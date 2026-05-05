use crate::error::LauncherError;
use crate::instance::config::{InstanceConfig, InstanceType};
use crate::minecraft::library;
use crate::minecraft::manifest;
use std::path::{Path, PathBuf};
use tokio::process::Command;

/// Builds and spawns the Java process for a Fusion Loader instance.
pub struct ProcessLauncher;

impl ProcessLauncher {
    /// Builds the full command to launch Fusion Loader.
    /// Mirrors the classpath that FusionBootstrap expects from GameProvider.
    pub fn build_command(
        instance: &InstanceConfig,
        game_dir: &Path,
        libraries_dir: &Path,
        java_path: &Path,
        assets_dir: &Path,
        username: Option<&str>,
        uuid: Option<&str>,
        access_token: Option<&str>,
    ) -> Result<Command, LauncherError> {
        let mut cmd = Command::new(java_path);

        // --- JVM Arguments ---

        // Memory
        cmd.arg(format!("-Xms{}m", instance.min_memory_mb));
        cmd.arg(format!("-Xmx{}m", instance.max_memory_mb));

        // Version-specific JVM flags
        let mc_major: u32 = instance.minecraft_version
            .split('.').next()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);

        if mc_major >= 26 {
            // MC 26+ requires Java 25 with preview features
            cmd.arg("--enable-preview");
            cmd.arg("-XX:+UseZGC");
            cmd.arg("-XX:+ZGenerational");
        } else {
            // MC 1.21.x runs on Java 21 — use G1GC (safe default)
            cmd.arg("-XX:+UseG1GC");
            cmd.arg("-XX:+ParallelRefProcEnabled");
            cmd.arg("-XX:MaxGCPauseMillis=200");
        }

        // Log4j config (mirrors FusionClient.main())
        cmd.arg("-Dlog4j.configurationFile=log4j2-fusion.xml");

        // User-specified JVM args
        for arg in &instance.jvm_args {
            cmd.arg(arg);
        }

        // --- Classpath ---

        let classpath = build_classpath(
            game_dir,
            libraries_dir,
            &instance.fusion_version,
            &instance.minecraft_version,
        )?;

        cmd.arg("-cp");
        cmd.arg(&classpath);

        // --- Main Class ---

        let main_class = match instance.instance_type {
            InstanceType::Client => "dev.fusionloader.bootstrap.FusionClient",
            InstanceType::Server => "dev.fusionloader.bootstrap.FusionServer",
        };
        cmd.arg(main_class);

        // --- Game Arguments ---

        cmd.arg("--gameDir");
        cmd.arg(game_dir.to_string_lossy().to_string());

        cmd.arg("--version");
        cmd.arg(&instance.minecraft_version);

        if instance.instance_type == InstanceType::Client {
            cmd.arg("--assetsDir");
            cmd.arg(assets_dir.to_string_lossy().to_string());

            // Asset index — read from version JSON (e.g., "17" for 1.21.1, "21" for 26.1)
            cmd.arg("--assetIndex");
            cmd.arg(read_asset_index(game_dir, &instance.minecraft_version));

            // Auth
            cmd.arg("--accessToken");
            cmd.arg(access_token.unwrap_or("0"));
            cmd.arg("--username");
            cmd.arg(username.unwrap_or("Player"));
            if let Some(uid) = uuid {
                cmd.arg("--uuid");
                cmd.arg(uid);
            }
        }

        // User-specified game args
        for arg in &instance.game_args {
            cmd.arg(arg);
        }

        // Working directory
        cmd.current_dir(game_dir);

        // Pipe IO for log streaming and server console
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());
        cmd.stdin(std::process::Stdio::piped());

        Ok(cmd)
    }
}

/// Constructs the full classpath string.
/// Order: Fusion modules → MC libraries → MC JAR
fn build_classpath(
    game_dir: &Path,
    libraries_dir: &Path,
    fusion_version: &str,
    mc_version: &str,
) -> Result<String, LauncherError> {
    let mut entries: Vec<PathBuf> = Vec::new();

    // 1. Fusion core modules (required)
    for module in library::FUSION_CORE_MODULES {
        let path = library::fusion_module_path(libraries_dir, module, fusion_version);
        if path.exists() {
            entries.push(path);
        } else {
            tracing::warn!("Fusion module not found: {} (expected at {})",
                module, path.display());
        }
    }

    // 2. Fusion optional modules (if present)
    for module in library::FUSION_OPTIONAL_MODULES {
        let path = library::fusion_module_path(libraries_dir, module, fusion_version);
        if path.exists() {
            entries.push(path);
        }
    }

    // 3. MC libraries (from version.json)
    let version_json = game_dir
        .join("versions")
        .join(mc_version)
        .join(format!("{}.json", mc_version));

    if version_json.exists() {
        let content = std::fs::read_to_string(&version_json)?;
        let detail: manifest::VersionDetail = serde_json::from_str(&content)?;

        for lib in &detail.libraries {
            // Check OS rules
            if let Some(ref rules) = lib.rules {
                if !manifest::evaluate_rules(rules) {
                    continue;
                }
            }

            let lib_path = if let Some(ref downloads) = lib.downloads {
                if let Some(ref artifact) = downloads.artifact {
                    libraries_dir.join(&artifact.path)
                } else {
                    library::maven_to_path(libraries_dir, &lib.name)
                }
            } else {
                library::maven_to_path(libraries_dir, &lib.name)
            };

            if lib_path.exists() {
                entries.push(lib_path);
            }
        }
    }

    // 4. MC JAR itself (last on classpath)
    let mc_jar = game_dir
        .join("versions")
        .join(mc_version)
        .join(format!("{}.jar", mc_version));

    if mc_jar.exists() {
        entries.push(mc_jar);
    }

    // Join with OS-appropriate separator
    let separator = if cfg!(windows) { ";" } else { ":" };
    Ok(entries
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(separator))
}

/// Reads the asset index ID from the version JSON.
fn read_asset_index(game_dir: &Path, mc_version: &str) -> String {
    let version_json = game_dir
        .join("versions")
        .join(mc_version)
        .join(format!("{}.json", mc_version));

    if let Ok(content) = std::fs::read_to_string(&version_json) {
        if let Ok(detail) = serde_json::from_str::<manifest::VersionDetail>(&content) {
            return detail.asset_index.id;
        }
    }
    // Fallback for pre-downloaded versions
    mc_version.to_string()
}
