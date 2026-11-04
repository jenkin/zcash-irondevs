// dedup.rs

use anyhow::{Context, Result};
use csv::{Reader, Writer};
use serde_json::Value;
use std::collections::HashMap;
use std::fs::File;
use std::path::Path;
use std::time::Instant;

use crate::types::{AuthorRecord, CommitRecord, MappedCommitRecord};

fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}

fn normalize_name(name: &str) -> String {
    name.trim().to_lowercase()
}

// Load aliases from a JSON file, if it exists
fn load_aliases() -> Result<HashMap<String, String>> {
    let aliases_file = "author_aliases.json";
    let mut aliases = HashMap::new();
    
    if Path::new(aliases_file).exists() {
        println!("Loading aliases from {}...", aliases_file);
        let content = std::fs::read_to_string(aliases_file)?;
        let json: Value = serde_json::from_str(&content)?;
        
        if let Some(obj) = json.as_object() {
            if let Some(aliases_obj) = obj.get("aliases").and_then(|v| v.as_object()) {
                for (old_email, new_email) in aliases_obj {
                    aliases.insert(
                        normalize_email(old_email),
                        normalize_email(new_email.as_str().unwrap_or(""))
                    );
                }
                println!("Loaded {} aliases", aliases.len());
            }
        }
    }
    
    Ok(aliases)
}

// Resolve alias chains (e.g., A -> B -> C becomes A -> C)
fn resolve_alias_chains(aliases: &HashMap<String, String>) -> HashMap<String, String> {
    let mut resolved = HashMap::new();
    
    for (old_email, _) in aliases {
        let mut current = old_email.clone();
        let mut visited = std::collections::HashSet::new();
        
        // Traverse the chain until the final email is found
        while let Some(next_email) = aliases.get(&current) {
            if visited.contains(&current) {
                // Break if a cycle is detected
                break;
            }
            visited.insert(current.clone());
            current = next_email.clone();
        }
        
        // If a different email is found, add it to the resolved map
        if current != *old_email {
            resolved.insert(old_email.clone(), current);
        }
    }
    
    resolved
}

pub fn run() -> Result<()> {
    let total_start = Instant::now();
    let input_file = "extracted_commits.csv";
    let authors_output = "authors.csv";
    let commits_output = "commits_dedup.csv";

    // Load and resolve aliases
    let raw_aliases = load_aliases()?;
    let resolved_aliases = resolve_alias_chains(&raw_aliases);
    println!("Resolved {} alias chains", resolved_aliases.len());

    println!("Reading {}...", input_file);
    let read_start = Instant::now();
    let file = File::open(input_file).context("Failed to open input CSV. Run extraction first.")?;
    let mut rdr = Reader::from_reader(file);

    let mut email_name_counts: HashMap<String, HashMap<String, (usize, String)>> = HashMap::new();
    let mut records = Vec::new();

    for result in rdr.deserialize() {
        let record: CommitRecord = result?;
        let norm_email = normalize_email(&record.author_email);
        
        // Apply the alias if one exists
        let final_email = resolved_aliases.get(&norm_email)
            .cloned()
            .unwrap_or_else(|| norm_email.clone());
        
        let norm_name = normalize_name(&record.author_name);
        
        email_name_counts
            .entry(final_email)
            .or_default()
            .entry(norm_name)
            .and_modify(|(count, _original)| *count += 1)
            .or_insert((1, record.author_name.clone()));

        records.push(record);
    }
    let read_duration = read_start.elapsed();
    let total_records = records.len();

    println!("Analyzing author name frequencies per email...");
    let analyze_start = Instant::now();
    let mut email_to_author_id: HashMap<String, String> = HashMap::new();
    let mut authors_list: Vec<AuthorRecord> = Vec::new();
    let mut author_id_counter = 1;

    for (canonical_email, name_counts) in email_name_counts {
        let (_max_count, canonical_name) = name_counts
            .into_values()
            .max_by_key(|(count, _)| *count)
            .unwrap_or((0, "Unknown".to_string()));
            
        let author_id = format!("author_{:05}", author_id_counter);
        author_id_counter += 1;
        
        email_to_author_id.insert(canonical_email.clone(), author_id.clone());
        authors_list.push(AuthorRecord {
            author_id,
            canonical_name,
            canonical_email,
        });
    }
    let analyze_duration = analyze_start.elapsed();
    let unique_authors = email_to_author_id.len();

    println!("Writing {}...", authors_output);
    let write_start = Instant::now();
    let authors_file = File::create(authors_output)?;
    let mut authors_wtr = Writer::from_writer(authors_file);
    for author in authors_list {
        authors_wtr.serialize(author)?;
    }
    authors_wtr.flush()?;

    println!("Writing {}...", commits_output);
    let commits_file = File::create(commits_output)?;
    let mut commits_wtr = Writer::from_writer(commits_file);
    
    for record in records {
        let norm_email = normalize_email(&record.author_email);
        
        // First, apply the alias
        let final_email = resolved_aliases.get(&norm_email)
            .cloned()
            .unwrap_or_else(|| norm_email.clone());
        
        // Then, retrieve the author_id for the final email
        let author_id = email_to_author_id.get(&final_email)
            .cloned()
            .unwrap_or_else(|| "author_unknown".to_string());
            
        commits_wtr.serialize(MappedCommitRecord {
            repo_id: record.repo_id,
            author_id,
            timestamp: record.timestamp,
            commit_hash: record.commit_hash,
        })?;
    }
    commits_wtr.flush()?;
    let write_duration = write_start.elapsed();

    let total_duration = total_start.elapsed();

    println!("--- Deduplication Statistics ---");
    println!("Total records processed: {}", total_records);
    println!("Unique authors identified: {}", unique_authors);
    println!("Aliases applied: {}", resolved_aliases.len());
    println!("CSV reading time: {:.2} seconds", read_duration.as_secs_f64());
    println!("Analysis and mapping time: {:.2} seconds", analyze_duration.as_secs_f64());
    println!("File writing time: {:.2} seconds", write_duration.as_secs_f64());
    println!("Total deduplication time: {:.2} seconds", total_duration.as_secs_f64());
    println!("--------------------------------");

    Ok(())
}