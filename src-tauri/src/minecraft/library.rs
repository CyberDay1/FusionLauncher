use std::path::{Path, PathBuf};

/// Converts a Maven coordinate to a file path.
/// Mirrors GameProvider.mavenToPath() exactly.
///
/// Format: `group:artifact:version[:classifier][@extension]`
/// Example: `org.lwjgl:lwjgl:3.4.1` -> `org/lwjgl/lwjgl/3.4.1/lwjgl-3.4.1.jar`
/// Example: `org.lwjgl:lwjgl:3.4.1:natives-windows` -> `org/lwjgl/lwjgl/3.4.1/lwjgl-3.4.1-natives-windows.jar`
pub fn maven_to_path(libraries_dir: &Path, coordinate: &str) -> PathBuf {
    let parts: Vec<&str> = coordinate.split(':').collect();
    if parts.len() < 3 {
        return libraries_dir.join(coordinate);
    }

    let group = parts[0];
    let artifact = parts[1];
    let mut version = parts[2].to_string();
    let classifier = if parts.len() > 3 {
        format!("-{}", parts[3])
    } else {
        String::new()
    };

    // Handle @extension suffix
    let mut extension = "jar".to_string();
    if let Some(at_pos) = version.find('@') {
        extension = version[at_pos + 1..].to_string();
        version = version[..at_pos].to_string();
    }

    let path = format!(
        "{}/{}/{}/{}-{}{}. {}",
        group.replace('.', "/"),
        artifact,
        version,
        artifact,
        version,
        classifier,
        extension
    );

    libraries_dir.join(path)
}

/// Fusion Loader core modules that must be on the classpath.
/// Matches InstallerSteps.FUSION_MODULES.
pub const FUSION_CORE_MODULES: &[&str] = &[
    "fusion-api",
    "fusion-bootstrap",
    "fusion-classload",
    "fusion-mixin",
    "fusion-discovery",
    "fusion-lifecycle",
    "fusion-registry",
    "fusion-access",
    "fusion-optimize",
    "fusion-compat-fabric",
    "fusion-compat-neoforge",
];

/// Optional Fusion modules (may or may not be present in a release).
pub const FUSION_OPTIONAL_MODULES: &[&str] = &[
    "fusion-dimensions",
    "fusion-storage",
    "fusion-threading",
    "fusion-worldgen",
    "fusion-portals",
    "fusion-map",
    "fusion-claims",
];

/// Builds the path for a Fusion module JAR.
/// Layout: `libraries/dev/fusionloader/<module>/<version>/<module>-<version>.jar`
pub fn fusion_module_path(libraries_dir: &Path, module: &str, version: &str) -> PathBuf {
    libraries_dir
        .join("dev")
        .join("fusionloader")
        .join(module)
        .join(version)
        .join(format!("{}-{}.jar", module, version))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn test_maven_to_path_simple() {
        let libs = Path::new("/libraries");
        let result = maven_to_path(libs, "org.lwjgl:lwjgl:3.4.1");
        assert!(result.to_string_lossy().contains("org/lwjgl/lwjgl/3.4.1/lwjgl-3.4.1.jar"));
    }

    #[test]
    fn test_maven_to_path_with_classifier() {
        let libs = Path::new("/libraries");
        let result = maven_to_path(libs, "org.lwjgl:lwjgl:3.4.1:natives-windows");
        assert!(result.to_string_lossy().contains("lwjgl-3.4.1-natives-windows.jar"));
    }

    #[test]
    fn test_fusion_module_path() {
        let libs = Path::new("/libraries");
        let result = fusion_module_path(libs, "fusion-api", "0.1.0-alpha.1");
        assert!(result.to_string_lossy().contains(
            "dev/fusionloader/fusion-api/0.1.0-alpha.1/fusion-api-0.1.0-alpha.1.jar"
        ));
    }
}
