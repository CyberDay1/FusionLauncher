use crate::error::LauncherError;
use crate::minecraft::library;
use std::path::Path;
use tauri::{AppHandle, Emitter};

/// Fusion Loader's own dependencies that aren't in the vanilla MC manifest.
/// These must be downloaded separately and placed on the classpath.
/// Versions match gradle/libs.versions.toml in the Fusion Loader repo.
/// Dependencies matching gradle/libs.versions.toml in the Fusion Loader repo.
const FUSION_DEPENDENCIES: &[(&str, &str)] = &[
    // Mixin (Fabric's fork of SpongePowered Mixin)
    ("net.fabricmc:sponge-mixin:0.17.1+mixin.0.8.7", "https://maven.fabricmc.net/net/fabricmc/sponge-mixin/0.17.1+mixin.0.8.7/sponge-mixin-0.17.1+mixin.0.8.7.jar"),
    // MixinExtras
    ("io.github.llamalad7:mixinextras-common:0.5.3", "https://repo1.maven.org/maven2/io/github/llamalad7/mixinextras-common/0.5.3/mixinextras-common-0.5.3.jar"),
    // ASM 9.8
    ("org.ow2.asm:asm:9.8", "https://repo1.maven.org/maven2/org/ow2/asm/asm/9.8/asm-9.8.jar"),
    ("org.ow2.asm:asm-tree:9.8", "https://repo1.maven.org/maven2/org/ow2/asm/asm-tree/9.8/asm-tree-9.8.jar"),
    ("org.ow2.asm:asm-util:9.8", "https://repo1.maven.org/maven2/org/ow2/asm/asm-util/9.8/asm-util-9.8.jar"),
    ("org.ow2.asm:asm-commons:9.8", "https://repo1.maven.org/maven2/org/ow2/asm/asm-commons/9.8/asm-commons-9.8.jar"),
    ("org.ow2.asm:asm-analysis:9.8", "https://repo1.maven.org/maven2/org/ow2/asm/asm-analysis/9.8/asm-analysis-9.8.jar"),
    // NightConfig (TOML parsing)
    ("com.electronwill.night-config:core:3.8.1", "https://repo1.maven.org/maven2/com/electronwill/night-config/core/3.8.1/core-3.8.1.jar"),
    ("com.electronwill.night-config:toml:3.8.1", "https://repo1.maven.org/maven2/com/electronwill/night-config/toml/3.8.1/toml-3.8.1.jar"),
    // Guava (needed by Mixin)
    ("com.google.guava:guava:33.4.8-jre", "https://repo1.maven.org/maven2/com/google/guava/guava/33.4.8-jre/guava-33.4.8-jre.jar"),
    // Gson (JSON)
    ("com.google.code.gson:gson:2.12.1", "https://repo1.maven.org/maven2/com/google/code/gson/gson/2.12.1/gson-2.12.1.jar"),
    // SLF4J (logging)
    ("org.slf4j:slf4j-api:2.0.9", "https://repo1.maven.org/maven2/org/slf4j/slf4j-api/2.0.9/slf4j-api-2.0.9.jar"),
];

/// Installs Fusion Loader dependencies to the libraries directory.
pub async fn install_fusion_dependencies(
    app: &AppHandle,
    client: &reqwest::Client,
    libraries_dir: &Path,
) -> Result<(), LauncherError> {
    let total = FUSION_DEPENDENCIES.len();
    for (i, (coord, url)) in FUSION_DEPENDENCIES.iter().enumerate() {
        let lib_path = library::maven_to_path(libraries_dir, coord);
        if !lib_path.exists() {
            if let Some(parent) = lib_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            tracing::info!("Downloading Fusion dependency: {}", coord);
            crate::minecraft::downloader::download_file(client, url, &lib_path).await?;
        }

        let _ = app.emit("install-progress", serde_json::json!({
            "step": "Fusion Dependencies",
            "item": coord,
            "current": i + 1,
            "total": total,
            "percent": ((i + 1) as f64 / total as f64) * 100.0
        }));
    }
    Ok(())
}

/// Installs Fusion Loader module JARs from a GitHub release.
pub async fn install_fusion_modules(
    app: &AppHandle,
    client: &reqwest::Client,
    release: &super::releases::GithubRelease,
    libraries_dir: &Path,
    fusion_version: &str,
) -> Result<(), LauncherError> {
    let module_assets = super::releases::find_module_assets(release);
    let total = module_assets.len();

    for (i, asset) in module_assets.iter().enumerate() {
        // Extract module name from filename (e.g., "fusion-api-0.1.0-alpha.1.jar" -> "fusion-api")
        let module_name = asset.name.strip_suffix(".jar")
            .and_then(|n| n.strip_suffix(&format!("-{}", fusion_version)))
            .unwrap_or(&asset.name);

        let dest = library::fusion_module_path(libraries_dir, module_name, fusion_version);
        if !dest.exists() {
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent)?;
            }
            tracing::info!("Downloading Fusion module: {}", module_name);
            crate::minecraft::downloader::download_file(
                client, &asset.browser_download_url, &dest
            ).await?;
        }

        let _ = app.emit("install-progress", serde_json::json!({
            "step": "Fusion Modules",
            "item": module_name,
            "current": i + 1,
            "total": total,
            "percent": ((i + 1) as f64 / total as f64) * 100.0
        }));
    }

    Ok(())
}
