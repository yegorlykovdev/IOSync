use std::fs;
use std::path::PathBuf;

#[tauri::command]
fn get_username() -> String {
    whoami::username()
}

#[derive(serde::Serialize)]
struct LockInfo {
    locked: bool,
    username: Option<String>,
    timestamp: Option<String>,
}

fn lock_path(db_path: &str) -> PathBuf {
    PathBuf::from(format!("{}.lock", db_path))
}

#[tauri::command]
fn acquire_lock(db_path: String) -> Result<LockInfo, String> {
    let path = lock_path(&db_path);

    // Check if lock exists and is still valid
    if path.exists() {
        if let Ok(contents) = fs::read_to_string(&path) {
            let mut lines = contents.lines();
            let locked_user = lines.next().unwrap_or("unknown").to_string();
            let locked_time = lines.next().unwrap_or("unknown").to_string();

            // Check if lock is stale (older than 1 hour)
            if let Ok(metadata) = fs::metadata(&path) {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(elapsed) = modified.elapsed() {
                        if elapsed.as_secs() < 3600 {
                            let current_user = whoami::username();
                            if locked_user != current_user {
                                return Ok(LockInfo {
                                    locked: true,
                                    username: Some(locked_user),
                                    timestamp: Some(locked_time),
                                });
                            }
                            // Same user — reacquire
                        }
                    }
                }
            }
        }
    }

    // Create/overwrite lock file
    let username = whoami::username();
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let contents = format!("{}\n{}", username, timestamp);
    fs::write(&path, contents).map_err(|e| format!("Failed to create lock: {}", e))?;

    Ok(LockInfo {
        locked: false,
        username: None,
        timestamp: None,
    })
}

#[tauri::command]
fn release_lock(db_path: String) -> Result<(), String> {
    let path = lock_path(&db_path);
    if path.exists() {
        // Only delete if we own it
        if let Ok(contents) = fs::read_to_string(&path) {
            let locked_user = contents.lines().next().unwrap_or("");
            if locked_user == whoami::username() {
                fs::remove_file(&path).map_err(|e| format!("Failed to remove lock: {}", e))?;
            }
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            get_username,
            acquire_lock,
            release_lock,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
