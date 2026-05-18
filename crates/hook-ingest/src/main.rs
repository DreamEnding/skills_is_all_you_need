use clap::{Parser, Subcommand, ValueEnum};
use serde::Serialize;
use skill_usage_core::models::{Platform, UsageEvent};
use skill_usage_core::{events, paths};
use std::io::{self, Read, Write};
use std::str::FromStr;

#[derive(Parser)]
#[command(name = "skill-meter", version, about = "Skills usage tracker")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Ingest hook events.
    Hook {
        #[command(subcommand)]
        command: Option<HookCommand>,

        /// Compatibility form: skill-meter hook --platform claude
        #[arg(long)]
        platform: Option<String>,

        /// Return non-zero on malformed payloads.
        #[arg(long)]
        strict: bool,
    },
    /// Import queued JSONL events into SQLite.
    Import {
        /// Accepted for command compatibility; filtering is not needed for MVP imports.
        #[arg(long)]
        platform: Option<String>,
    },
    /// Print usage summary.
    Summary {
        #[arg(long, default_value = "all")]
        range: String,

        #[arg(long)]
        platform: Option<String>,

        #[arg(long, value_enum, default_value_t = OutputFormat::Table)]
        format: OutputFormat,
    },
    /// Open the dashboard.
    Open,
    /// Verify hook setup and health.
    Doctor,
    /// Scan skills and print inventory.
    Scan {
        #[arg(long, value_enum, default_value_t = OutputFormat::Table)]
        format: OutputFormat,
    },
}

#[derive(Subcommand)]
enum HookCommand {
    /// Read a single hook payload from stdin and append it to the JSONL queue.
    Ingest {
        /// Platform: claude or codex.
        #[arg(long)]
        platform: String,

        /// Return non-zero on malformed payloads.
        #[arg(long)]
        strict: bool,
    },
}

#[derive(Clone, Copy, ValueEnum)]
enum OutputFormat {
    Table,
    Json,
}

fn main() {
    let cli = Cli::parse();
    let result = match cli.command {
        Commands::Hook {
            command,
            platform,
            strict,
        } => match command {
            Some(HookCommand::Ingest { platform, strict }) => ingest_hook(&platform, strict),
            None => {
                let Some(platform) = platform else {
                    eprintln!("missing --platform or hook subcommand");
                    std::process::exit(2);
                };
                ingest_hook(&platform, strict)
            }
        },
        Commands::Import { platform } => import_events(platform.as_deref()),
        Commands::Summary {
            range,
            platform,
            format,
        } => summary(&range, platform.as_deref(), format),
        Commands::Open => {
            eprintln!("skill-meter open: dashboard launch is not implemented yet");
            Ok(())
        }
        Commands::Doctor => doctor(),
        Commands::Scan { format } => scan(format),
    };

    if let Err(e) = result {
        eprintln!("{e}");
        std::process::exit(1);
    }
}

fn doctor() -> skill_usage_core::error::Result<()> {
    let events_dir = paths::events_dir()?;
    let db_path = paths::db_path()?;
    let error_count = events::ingest_error_count()?;
    let queued_files = if events_dir.exists() {
        std::fs::read_dir(&events_dir)?
            .filter_map(Result::ok)
            .filter(|e| e.path().extension().and_then(|ext| ext.to_str()) == Some("jsonl"))
            .count()
    } else {
        0
    };

    println!("data directory: {}", paths::data_dir()?.display());
    println!(
        "events directory: {} [exists={}]",
        events_dir.display(),
        events_dir.exists()
    );
    println!("queued event files: {queued_files}");
    println!(
        "database: {} [exists={}]",
        db_path.display(),
        db_path.exists()
    );
    println!("ingest errors: {error_count}");
    Ok(())
}

#[derive(Serialize)]
struct ScanInfo {
    canonical_name: String,
    locations: Vec<ScanLocationInfo>,
}

#[derive(Serialize)]
struct ScanLocationInfo {
    platform: String,
    skill_path: String,
}

fn scan(format: OutputFormat) -> skill_usage_core::error::Result<()> {
    let results = skill_usage_core::scanner::scan_all()?;
    if matches!(format, OutputFormat::Json) {
        let rows = results
            .into_iter()
            .map(|r| ScanInfo {
                canonical_name: r.skill.canonical_name,
                locations: r
                    .locations
                    .into_iter()
                    .map(|loc| ScanLocationInfo {
                        platform: loc.platform.as_str().to_string(),
                        skill_path: loc.skill_path,
                    })
                    .collect(),
            })
            .collect::<Vec<_>>();
        println!("{}", serde_json::to_string_pretty(&rows)?);
        return Ok(());
    }

    if results.is_empty() {
        println!("No skills found.");
        return Ok(());
    }
    for r in &results {
        println!("{}", r.skill.canonical_name);
        for loc in &r.locations {
            println!("  [{}] {}", loc.platform.as_str(), loc.skill_path);
        }
    }
    println!("\n{} skill(s) found.", results.len());
    Ok(())
}

fn ingest_hook(platform_str: &str, strict: bool) -> skill_usage_core::error::Result<()> {
    let platform = match Platform::from_str(platform_str) {
        Ok(platform) => platform,
        Err(error) if strict => {
            return Err(skill_usage_core::error::AppError::InvalidPayload(error));
        }
        Err(error) => {
            events::record_ingest_error(None, None, "", &error)?;
            return Ok(());
        }
    };

    let mut stdin = String::new();
    io::stdin().read_to_string(&mut stdin)?;
    if stdin.trim().is_empty() {
        return Ok(());
    }

    match events::parse_hook_events(platform, &stdin) {
        Ok(events) => {
            for event in events {
                write_event(&event)?;
            }
            Ok(())
        }
        Err(error) if strict => Err(error),
        Err(error) => {
            events::record_ingest_error(None, Some(platform), &stdin, &error.to_string())?;
            Ok(())
        }
    }
}

fn import_events(_platform: Option<&str>) -> skill_usage_core::error::Result<()> {
    let events_dir = paths::ensure_data_dirs()?;
    let imported = events::import_queued_events(&events_dir)?;
    println!("imported events: {imported}");
    Ok(())
}

fn summary(
    _range: &str,
    platform: Option<&str>,
    format: OutputFormat,
) -> skill_usage_core::error::Result<()> {
    let platform = platform.map(Platform::from_str).transpose().map_err(|e| {
        skill_usage_core::error::AppError::InvalidPayload(format!("unknown platform: {e}"))
    })?;
    let mut rows = events::usage_summary()?;
    if let Some(platform) = platform {
        rows.retain(|row| row.platform == platform);
    }

    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&rows)?);
        }
        OutputFormat::Table => {
            println!(
                "{:<32} {:<8} {:<14} {:>8}",
                "skill", "platform", "confidence", "count"
            );
            for row in rows {
                println!(
                    "{:<32} {:<8} {:<14} {:>8}",
                    row.canonical_name,
                    row.platform.as_str(),
                    row.confidence,
                    row.count
                );
            }
        }
    }
    Ok(())
}

fn write_event(event: &UsageEvent) -> skill_usage_core::error::Result<()> {
    let events_dir = paths::ensure_data_dirs()?;
    let filename = format!("{}.jsonl", event.occurred_at.format("%Y%m%d"));
    let path = events_dir.join(&filename);
    let line = serde_json::to_string(event)?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)?;
    writeln!(file, "{line}")?;
    events::record_usage_event(event)?;
    Ok(())
}
