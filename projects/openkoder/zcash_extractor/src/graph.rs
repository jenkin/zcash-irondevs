// src/graph.rs

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use csv::Reader;
use serde::Serialize;
use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs::File;
use std::time::Instant;

use crate::types::{AuthorRecord, MappedCommitRecord};

/// Represents the cumulative number of commits up to a specific date.
#[derive(Serialize)]
struct CumulativeStat {
    date: String,
    total: u32,
}

/// Represents a node in the graph (either an author or a repository).
#[derive(Serialize)]
struct Node {
    id: String,
    label: String,
    node_type: String,
    total_commits: u32,
    x: f64,
    y: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    cumulative_commits: Option<Vec<CumulativeStat>>,
}

/// Represents a connection between an author and a repository.
#[derive(Serialize)]
struct Link {
    source: String,
    target: String,
    total_commits: u32,
    active_days: Vec<String>,
    first_day: String,
    last_day: String,
}

/// Overall statistics for the generated graph.
#[derive(Serialize)]
struct Metrics {
    total_authors: usize,
    total_repos: usize,
    total_commits: u32,
    top_authors: Vec<(String, u32)>,
    active_days: Vec<String>,
}

/// The root structure that will be serialized into graph_data.json.
#[derive(Serialize)]
struct GraphData {
    nodes: Vec<Node>,
    links: Vec<Link>,
    metrics: Metrics,
}

/// Converts a Unix timestamp to a "YYYY-MM-DD" string.
fn get_day_from_timestamp(timestamp: i64) -> String {
    let dt = DateTime::<Utc>::from_timestamp(timestamp, 0).unwrap_or_default();
    dt.format("%Y-%m-%d").to_string()
}

pub fn run() -> Result<()> {
    let total_start = Instant::now();

    println!("Reading authors.csv...");
    let authors_file = File::open("authors.csv").context("Failed to open authors.csv")?;
    let mut authors_rdr = Reader::from_reader(authors_file);

    let mut author_names: HashMap<String, String> = HashMap::new();
    let mut author_commit_counts: HashMap<String, u32> = HashMap::new();

    for result in authors_rdr.deserialize() {
        let author: AuthorRecord = result?;
        author_names.insert(author.author_id.clone(), author.canonical_name);
        author_commit_counts.insert(author.author_id.clone(), 0);
    }

    println!("Reading commits_dedup.csv and aggregating...");
    let commits_file =
        File::open("commits_dedup.csv").context("Failed to open commits_dedup.csv")?;
    let mut commits_rdr = Reader::from_reader(commits_file);

    let mut pair_commits: HashMap<(String, String), u32> = HashMap::new();
    let mut pair_days: HashMap<(String, String), BTreeSet<String>> = HashMap::new();
    let mut unique_repos: HashSet<String> = HashSet::new();
    let mut repo_commit_counts: HashMap<String, u32> = HashMap::new();
    let mut active_days: HashSet<String> = HashSet::new();
    let mut total_commits: u32 = 0;
    
    // Maps each author to a map of dates and the number of commits made on that date.
    let mut author_daily_commits: HashMap<String, HashMap<String, u32>> = HashMap::new();

    for result in commits_rdr.deserialize() {
        let record: MappedCommitRecord = result?;
        let day = get_day_from_timestamp(record.timestamp);
        let author_id = record.author_id.clone();

        let pair_key = (author_id.clone(), record.repo_id.clone());
        *pair_commits.entry(pair_key.clone()).or_insert(0) += 1;
        pair_days.entry(pair_key).or_default().insert(day.clone());

        unique_repos.insert(record.repo_id.clone());
        *repo_commit_counts.entry(record.repo_id).or_insert(0) += 1;
        *author_commit_counts.entry(author_id.clone()).or_insert(0) += 1;

        // Aggregate commits by day for each author.
        *author_daily_commits
            .entry(author_id)
            .or_default()
            .entry(day.clone())
            .or_insert(0) += 1;

        active_days.insert(day);
        total_commits += 1;
    }

    println!("Building graph structures with logarithmic diagonal layout...");

    // Sort authors and repositories by total commit count in descending order.
    let mut sorted_authors: Vec<_> = author_commit_counts.iter().collect();
    sorted_authors.sort_by(|a, b| b.1.cmp(a.1));

    let mut sorted_repos: Vec<_> = repo_commit_counts.iter().collect();
    sorted_repos.sort_by(|a, b| b.1.cmp(a.1));

    // ========================================================================
    // LOGARITHMIC DIAGONAL LAYOUT
    // ========================================================================
    const AUTHOR_X0: f64 = 0.12; // Top-left corner (top author)
    const AUTHOR_Y0: f64 = 0.06;
    const AUTHOR_X1: f64 = 0.52; // Bottom-right corner (tail)
    const AUTHOR_Y1: f64 = 0.94;

    let log_weights: Vec<f64> = sorted_authors
        .iter()
        .map(|&(_, &c)| (1.0 + c as f64).ln())
        .collect();

    let total_log_weight: f64 = log_weights.iter().sum::<f64>().max(1e-9);

    let mut nodes = Vec::new();
    let mut cumulative_log = 0.0_f64;

    for (i, (author_id, commits)) in sorted_authors.iter().enumerate() {
        let c = **commits;
        let lw = log_weights[i];

        let t = (cumulative_log + lw / 2.0) / total_log_weight;
        cumulative_log += lw;

        let x = AUTHOR_X0 + t * (AUTHOR_X1 - AUTHOR_X0);
        let y = AUTHOR_Y0 + t * (AUTHOR_Y1 - AUTHOR_Y0);

        // Build a compact array of cumulative commits, including only days with activity.
        let mut cumulative_commits_vec = Vec::new();
        
        // Dereference author_id to resolve borrowing issues (converts &&String to &String).
        if let Some(daily_map) = author_daily_commits.remove(*author_id) {
            let mut sorted_days: Vec<_> = daily_map.into_iter().collect();
            // Lexicographical sorting works perfectly for the "YYYY-MM-DD" format.
            sorted_days.sort_by(|a, b| a.0.cmp(&b.0));
            
            let mut running_total = 0u32;
            for (date, count) in sorted_days {
                running_total += count;
                cumulative_commits_vec.push(CumulativeStat { date, total: running_total });
            }
        }

        nodes.push(Node {
            id: (*author_id).clone(),
            label: author_names
                .get(*author_id)
                .cloned()
                .unwrap_or_else(|| "Unknown".to_string()),
            node_type: "author".to_string(),
            total_commits: c,
            x,
            y,
            cumulative_commits: if cumulative_commits_vec.is_empty() {
                None
            } else {
                Some(cumulative_commits_vec)
            },
        });
    }

    // RIGHT SIDE: Repositories (fixed vertical column).
    let repo_count = sorted_repos.len();
    for (i, (repo_id, commits)) in sorted_repos.iter().enumerate() {
        let denominator = (repo_count as f64 - 1.0).max(1.0);
        let y = 0.1 + (i as f64 / denominator) * 0.8;

        nodes.push(Node {
            id: (*repo_id).clone(),
            label: (*repo_id).clone(),
            node_type: "repo".to_string(),
            total_commits: **commits,
            x: 0.85,
            y,
            cumulative_commits: None,
        });
    }

    // Create edges (one for each author-repo pair).
    let mut links = Vec::new();
    for ((author_id, repo_id), total_commits) in pair_commits {
        let days = pair_days
            .get(&(author_id.clone(), repo_id.clone()))
            .unwrap();
        let first_day = days.first().unwrap().clone();
        let last_day = days.last().unwrap().clone();

        links.push(Link {
            source: author_id,
            target: repo_id,
            total_commits,
            active_days: days.into_iter().cloned().collect(),
            first_day,
            last_day,
        });
    }

    // Sort edges by total commit count.
    links.sort_by(|a, b| b.total_commits.cmp(&a.total_commits));

    let mut sorted_authors_for_metrics: Vec<_> = author_commit_counts.into_iter().collect();
    sorted_authors_for_metrics.sort_by(|a, b| b.1.cmp(&a.1));
    let top_authors: Vec<(String, u32)> = sorted_authors_for_metrics
        .into_iter()
        .take(10)
        .map(|(id, count)| {
            let name = author_names
                .get(&id)
                .cloned()
                .unwrap_or_else(|| "Unknown".to_string());
            (name, count)
        })
        .collect();

    let mut sorted_days: Vec<_> = active_days.into_iter().collect();
    sorted_days.sort();

    let graph_data = GraphData {
        nodes,
        links,
        metrics: Metrics {
            total_authors: author_names.len(),
            total_repos: unique_repos.len(),
            total_commits,
            top_authors,
            active_days: sorted_days,
        },
    };

    println!("Writing graph_data.json...");
    let json_file = File::create("graph_data.json")?;
    serde_json::to_writer_pretty(json_file, &graph_data)?;

    let total_duration = total_start.elapsed();
    println!("--- Graph Building Statistics ---");
    println!(
        "Total nodes (authors + repos): {}",
        graph_data.nodes.len()
    );
    println!(
        "Total unique edges (aggregated by pairs): {}",
        graph_data.links.len()
    );
    println!(
        "Graph generation time: {:.2} seconds",
        total_duration.as_secs_f64()
    );
    println!("Output saved to: graph_data.json");
    println!("---------------------------------");

    Ok(())
}