use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use csv::Writer;
use git2::{Repository, Sort};
use indicatif::{ProgressBar, ProgressStyle};
use rayon::prelude::*;
use serde::Serialize;
use std::path::Path;
use walkdir::WalkDir;

#[derive(Serialize, Debug)]
struct CommitRecord {
    repo_id: String,
    author_name: String,
    author_email: String,
    timestamp: i64,
    date_iso: String,
    commit_hash: String,
}

fn extract_repo_commits(repo_path: &Path) -> Result<Vec<CommitRecord>> {
    let repo = Repository::open(repo_path)
        .with_context(|| format!("Не удалось открыть репозиторий: {:?}", repo_path))?;

    let repo_name = repo_path.file_stem().unwrap().to_string_lossy();
    let org_name = repo_path.parent().unwrap().file_name().unwrap().to_string_lossy();
    let repo_id = format!("{}/{}", org_name, repo_name);

    let mut records = Vec::new();
    
    // Сортировка по времени для корректной временной нарезки в будущем
    let mut revwalk = repo.revwalk()?;
    revwalk.set_sorting(Sort::TIME)?;
    revwalk.push_head()?;

    for oid_result in revwalk {
        let oid = oid_result?;
        let commit = repo.find_commit(oid)?;
        let author = commit.author();

        let timestamp = author.when().seconds();
        let date_iso = DateTime::<Utc>::from_timestamp(timestamp, 0)
            .unwrap_or_default()
            .to_rfc3339();

        records.push(CommitRecord {
            repo_id: repo_id.clone(),
            author_name: author.name().unwrap_or("Unknown").to_string(),
            author_email: author.email().unwrap_or("unknown@unknown.com").to_string(),
            timestamp,
            date_iso,
            commit_hash: oid.to_string(),
        });
    }

    Ok(records)
}

fn main() -> Result<()> {
    // Путь к папке с данными (относительно корня проекта или абсолютный)
    let data_dir = if args.len() > 1 {
        args[1].clone()
    } else {
        "../../../data".to_string() // Значение по умолчанию
    };
    
    println!("🔍 Поиск bare-репозиториев в {}...", data_dir);

    // Находим все папки, заканчивающиеся на .git
    let repo_paths: Vec<_> = WalkDir::new(data_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_dir() && e.file_name().to_string_lossy().ends_with(".git"))
        .map(|e| e.into_path())
        .collect();

    println!("📦 Найдено репозиториев: {}", repo_paths.len());

    if repo_paths.is_empty() {
        println!("⚠️ Репозитории не найдены. Убедитесь, что папка data/ существует и содержит .git папки.");
        return Ok(());
    }

    let pb = ProgressBar::new(repo_paths.len() as u64);
    pb.set_style(ProgressStyle::default_bar()
        .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({eta}) {msg}")
        .unwrap()
        .progress_chars("#>-"));

    // Параллельная обработка с помощью Rayon (автоматически использует все ядра CPU)
    let all_records: Vec<CommitRecord> = repo_paths
        .par_iter()
        .filter_map(|path| {
            let result = extract_repo_commits(path);
            pb.inc(1);
            match result {
                Ok(records) => Some(records),
                Err(e) => {
                    // Логируем ошибки, но не прерываем выполнение всего процесса
                    eprintln!("⚠️ Ошибка обработки {:?}: {}", path, e);
                    None
                }
            }
        })
        .flatten()
        .collect();

    pb.finish_with_message("✅ Парсинг завершен!");

    // Сортируем итоговый массив по времени для удобства последующей обработки
    println!("⏳ Сортировка {} записей по времени...", all_records.len());
    let mut sorted_records = all_records;
    sorted_records.par_sort_unstable_by_key(|r| r.timestamp);

    // Запись в CSV
    let output_file = "extracted_commits.csv";
    println!("💾 Сохранение результатов в {}...", output_file);
    
    let mut wtr = Writer::from_path(output_file)?;
    for record in sorted_records {
        wtr.serialize(record)?;
    }
    wtr.flush()?;

    println!("🎉 Успешно! Извлечено {} коммитов.", sorted_records.len());
    println!("📊 Уникальных авторов (по email): {}", sorted_records.iter().map(|r| &r.author_email).collect::<std::collections::HashSet<_>>().len());
    println!("📊 Уникальных репозиториев: {}", sorted_records.iter().map(|r| &r.repo_id).collect::<std::collections::HashSet<_>>().len());

    Ok(())
}
