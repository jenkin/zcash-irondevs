// main.rs
// Module declarations for the processing pipeline and shared data structures
mod dedup;
mod graph;
mod types;

use anyhow::{Context, Result};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use chrono::{DateTime, Utc};
use csv::Writer;
use git2::{BranchType, Repository, Sort};
use indicatif::{ProgressBar, ProgressStyle};
use rayon::prelude::*;
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs::File;
use std::path::Path;
use std::time::Instant;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use walkdir::WalkDir;

use crate::types::{AliasDiscovery, CommitRecord};

/// Extracts commit history and detects potential email address changes from a given repository.
/// Returns a list of commit records and any discovered email aliases.
fn extract_repo_commits(repo_path: &Path) -> Result<(Vec<CommitRecord>, Vec<AliasDiscovery>)> {
    // Open the Git repository and construct a unique identifier based on its path
    let repo = Repository::open(repo_path)
        .with_context(|| format!("Failed to open repository: {:?}", repo_path))?;

    let repo_name = repo_path.file_stem().unwrap().to_string_lossy();
    let org_name = repo_path.parent().unwrap().file_name().unwrap().to_string_lossy();
    let repo_id = format!("{}/{}", org_name, repo_name);

    let mut records = Vec::new();
    let mut aliases_found = Vec::new();
    
    // Regular expression to detect email change announcements in commit messages
    let email_change_regex = Regex::new(
        r"(?i)(?:my\s+new\s+email|changed\s+email|new\s+email|updated\s+email|contact\s+me\s+at)[^a-zA-Z0-9]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"
    ).unwrap();

    // Initialize the commit walker, sorted by time, with a fallback for repositories without a default HEAD
    let mut revwalk = repo.revwalk()?;
    revwalk.set_sorting(Sort::TIME)?;
    
    if revwalk.push_head().is_err() {
        let mut found_branch = false;
        if let Ok(branches) = repo.branches(Some(BranchType::Local)) {
            for branch_result in branches {
                if let Ok((branch, _)) = branch_result {
                    if let Some(target) = branch.get().target() {
                        if revwalk.push(target).is_ok() {
                            found_branch = true;
                            break;
                        }
                    }
                }
            }
        }
        if !found_branch {
            return Ok((Vec::new(), Vec::new())); 
        }
    }

    // Iterate through the commit history
    for oid_result in revwalk {
        let oid = oid_result?;
        let commit = repo.find_commit(oid)?;
        let author = commit.author();

        let old_email = author.email().unwrap_or("unknown@unknown.com").to_lowercase();
        let timestamp = author.when().seconds();
        
        // Check commit message for email change patterns
        if let Some(msg) = commit.message() {
            if let Some(caps) = email_change_regex.captures(msg) {
                let new_email = caps.get(1).unwrap().as_str().to_lowercase();
                if !new_email.is_empty() && new_email != old_email {
                    aliases_found.push(AliasDiscovery {
                        old_email: old_email.clone(),
                        new_email,
                        timestamp,
                    });
                }
            }
        }

        // Construct and store the commit record
        let date_iso = DateTime::<Utc>::from_timestamp(timestamp, 0)
            .unwrap_or_default()
            .to_rfc3339();

        records.push(CommitRecord {
            repo_id: repo_id.clone(),
            author_name: author.name().unwrap_or("Unknown").to_string(),
            author_email: old_email,
            timestamp,
            date_iso,
            commit_hash: oid.to_string(),
        });
    }

    Ok((records, aliases_found))
}

/// Resolves an email address to its final canonical form by following a chain of aliases.
/// Includes cycle detection to prevent infinite loops.
fn get_canonical_email(email: &str, aliases: &HashMap<String, String>) -> String {
    let mut current = email.to_string();
    let mut visited = HashSet::new();
    
    while let Some(next_email) = aliases.get(&current) {
        if visited.contains(&current) {
            break;
        }
        visited.insert(current.clone());
        current = next_email.clone();
    }
    current
}

/// Processes a map of raw email aliases and resolves all indirect chains 
/// so that every old email points directly to its final canonical email.
fn resolve_email_chains(raw_aliases: &HashMap<String, String>) -> HashMap<String, String> {
    let mut resolved = HashMap::new();
    for old_email in raw_aliases.keys() {
        let canonical = get_canonical_email(old_email, raw_aliases);
        if canonical != *old_email {
            resolved.insert(old_email.clone(), canonical);
        }
    }
    resolved
}

/// Merges newly discovered email aliases with existing ones stored in 'author_aliases.json'.
/// Resolves any resulting chains and updates the file if changes are detected.
fn update_alias_file(new_discoveries: &HashMap<String, String>) -> Result<()> {
    let aliases_file = "author_aliases.json";
    let mut combined_aliases: HashMap<String, String> = HashMap::new();

    // Load existing aliases if the file exists
    if Path::new(aliases_file).exists() {
        let content = std::fs::read_to_string(aliases_file)?;
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(obj) = parsed.as_object() {
                if let Some(aliases) = obj.get("aliases").and_then(|v| v.as_object()) {
                    for (k, v) in aliases {
                        combined_aliases.insert(k.clone(), v.as_str().unwrap().to_string());
                    }
                }
            }
        }
    }

    // Merge new discoveries
    for (old_email, new_email) in new_discoveries {
        combined_aliases.entry(old_email.clone()).or_insert_with(|| new_email.clone());
    }

    // Resolve chains and save back to disk if updated
    let resolved_aliases = resolve_email_chains(&combined_aliases);

    if !resolved_aliases.is_empty() {
        let output = serde_json::json!({
            "aliases": resolved_aliases
        });
        let file = File::create(aliases_file)?;
        serde_json::to_writer_pretty(file, &output)?;
        println!("Auto-discovered and resolved email chains. Saved {} aliases to {}.", resolved_aliases.len(), aliases_file);
    }

    Ok(())
}

/// Orchestrates the extraction phase: discovers repositories, processes them in parallel,
/// aggregates email aliases, sorts the results chronologically, and writes to a CSV file.
fn run_extraction() -> Result<()> {
    let total_start = Instant::now();
    let args: Vec<String> = env::args().collect();
    
    // Determine the target data directory from arguments or use the default
    let data_dir = if args.len() > 1 && !args[1].starts_with("-") {
        args[1].clone()
    } else {
        "../../../data".to_string()
    };
    
    println!("Searching for bare repositories in {}...", data_dir);

    // Recursively search for bare Git repositories
    let repo_paths: Vec<_> = WalkDir::new(&data_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_dir() && e.file_name().to_string_lossy().ends_with(".git"))
        .map(|e| e.into_path())
        .collect();

    println!("Found {} repositories", repo_paths.len());

    if repo_paths.is_empty() {
        println!("Warning: No repositories found. Ensure the data/ directory exists and contains .git directories.");
        return Ok(());
    }

    // Initialize a progress bar for parallel processing
    let pb = ProgressBar::new(repo_paths.len() as u64);
    pb.set_style(
        ProgressStyle::with_template("[{bar:40.cyan/blue}] {percent}% ({pos}/{len}) {eta_precise}")
            .unwrap()
            .progress_chars("█░ ") 
    );

    let parse_start = Instant::now();
    
    // Process repositories in parallel using Rayon
    let extraction_results: Vec<(Vec<CommitRecord>, Vec<AliasDiscovery>)> = repo_paths
        .par_iter()
        .filter_map(|path| {
            let result = extract_repo_commits(path);
            pb.inc(1);
            match result {
                Ok(data) => Some(data),
                Err(e) => {
                    eprintln!("Warning: Error processing {:?}: {}", path, e);
                    None
                }
            }
        })
        .collect();
        
    let parse_duration = parse_start.elapsed();
    pb.finish_with_message("Parsing completed!");

    let mut all_records = Vec::new();
    let mut all_aliases_with_time: Vec<AliasDiscovery> = Vec::new();

    for (records, aliases) in extraction_results {
        all_records.extend(records);
        all_aliases_with_time.extend(aliases);
    }

    // Sort aliases chronologically to ensure correct resolution order (oldest changes first)
    all_aliases_with_time.sort_by_key(|a| a.timestamp);

    let mut aggregated_aliases: HashMap<String, String> = HashMap::new();
    for alias in all_aliases_with_time {
        aggregated_aliases.insert(alias.old_email, alias.new_email);
    }

    update_alias_file(&aggregated_aliases)?;

    println!("Sorting {} records by time...", all_records.len());
    let mut sorted_records = all_records;
    sorted_records.par_sort_unstable_by_key(|r| r.timestamp);

    let output_file = "extracted_commits.csv";
    println!("Saving results to {}...", output_file);
    
    let mut wtr = Writer::from_path(output_file)?;
    for record in &sorted_records {
        wtr.serialize(record)?;
    }
    wtr.flush()?;

    let total_duration = total_start.elapsed();
    let unique_authors = sorted_records.iter().map(|r| &r.author_email).collect::<std::collections::HashSet<_>>().len();
    let unique_repos = sorted_records.iter().map(|r| &r.repo_id).collect::<std::collections::HashSet<_>>().len();

    println!("--- Extraction Statistics ---");
    println!("Total commits extracted: {}", sorted_records.len());
    println!("Unique authors (by raw email): {}", unique_authors);
    println!("Unique repositories processed: {}", unique_repos);
    println!("Parallel parsing time: {:.2} seconds", parse_duration.as_secs_f64());
    println!("Total extraction time: {:.2} seconds", total_duration.as_secs_f64());
    println!("-----------------------------");

    Ok(())
}

/// Axum handler that serves the generated 'graph_data.json' file.
/// Returns a 404 Not Found response if the file has not been generated yet.
async fn serve_graph_data() -> impl IntoResponse {
    match std::fs::read_to_string("graph_data.json") {
        Ok(content) => (
            [(axum::http::header::CONTENT_TYPE, "application/json")],
            content,
        ).into_response(),
        Err(_) => (
            axum::http::StatusCode::NOT_FOUND,
            "graph_data.json not found. Please run the extraction pipeline first.",
        ).into_response(),
    }
}

/// Configures and starts the local web server to serve the frontend assets 
/// and the generated graph data endpoint.
async fn run_server() -> Result<()> {
    println!("Starting web server on http://localhost:3000");
    println!("Press Ctrl+C to stop");
    
    // Serve static frontend files and the graph data endpoint with permissive CORS
    let serve_dir = ServeDir::new("frontend");
    
    let app = Router::new()
        .route("/graph_data.json", get(serve_graph_data))
        .nest_service("/", serve_dir)
        .layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
    Ok(())
}

/// Main entry point. Parses command-line arguments to determine which 
/// stages of the pipeline to execute, ensuring correct execution order.
#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = env::args().collect();
    let has_flags = args.iter().any(|arg| arg.starts_with("-"));
    
    // Parse command-line arguments to determine the execution mode
    let run_extract = !has_flags || args.iter().any(|arg| arg == "--extract" || arg == "-e");
    let run_dedup = !has_flags || args.iter().any(|arg| arg == "--dedup" || arg == "-d");
    let run_graph = !has_flags || args.iter().any(|arg| arg == "--graph" || arg == "-g");
    let should_run_server = args.iter().any(|arg| arg == "--serve" || arg == "-s");

    // If only the server is requested, start it and exit
    if should_run_server {
        run_server().await?;
        return Ok(());
    }

    // Validate that prerequisite files exist before running dependent stages
    if run_dedup && !run_extract && !Path::new("extracted_commits.csv").exists() {
        anyhow::bail!("Missing 'extracted_commits.csv'. Please run extraction first (-e) or use full pipeline (no flags).");
    }
    
    if run_graph && !run_dedup && (!Path::new("authors.csv").exists() || !Path::new("commits_dedup.csv").exists()) {
        anyhow::bail!("Missing 'authors.csv' or 'commits_dedup.csv'. Please run deduplication first (-d) or use full pipeline (no flags).");
    }

    // Execute the requested pipeline stages
    if run_extract {
        println!("=== Step 1: Extraction ===");
        run_extraction()?;
    }
    
    if run_dedup {
        println!("=== Step 2: Deduplication ===");
        dedup::run()?;
    }
    
    if run_graph {
        println!("=== Step 3: Graph Building ===");
        graph::run()?;
    }

    println!("Pipeline completed successfully.");

    println!(r#"
Next steps to start the interactive web visualization:

  1. Run the server:
     cargo run --release -- --serve

  2. Open your browser and navigate to:
     http://localhost:3000
"#);

    Ok(())
}