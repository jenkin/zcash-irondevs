// types.rs

use serde::{Deserialize, Serialize};

/// Represents a raw commit record extracted directly from the Git history.
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct CommitRecord {
    pub repo_id: String,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: i64,
    pub date_iso: String,
    pub commit_hash: String,
}

/// Represents a deduplicated author with a unique identifier and canonical contact information.
#[derive(Debug, Deserialize, Serialize)]
pub struct AuthorRecord {
    pub author_id: String,
    pub canonical_name: String,
    pub canonical_email: String,
}

/// Represents a commit record mapped to a deduplicated author ID for consistent aggregation.
#[derive(Debug, Deserialize, Serialize)]
pub struct MappedCommitRecord {
    pub repo_id: String,
    pub author_id: String,
    pub timestamp: i64,
    pub commit_hash: String,
}

/// Represents a detected email address change for an author, used to build alias resolution chains.
#[derive(Debug, Clone)]
pub struct AliasDiscovery {
    pub old_email: String,
    pub new_email: String,
    pub timestamp: i64,
}