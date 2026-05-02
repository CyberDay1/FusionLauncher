use crate::java::runtime::{JavaRuntime, JavaVersion};
use std::path::{Path, PathBuf};
use std::process::Command;

/// Detects installed Java runtimes on the system.
pub fn detect_installations() -> Vec<JavaRuntime> {
    let mut found = Vec::new();

    // Check JAVA_HOME
    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        if let Some(rt) = probe_java_dir(Path::new(&java_home)) {
            found.push(rt);
        }
    }

    // Check PATH
    if let Ok(path_var) = std::env::var("PATH") {
        let separator = if cfg!(windows) { ';' } else { ':' };
        for dir in path_var.split(separator) {
            let java_path = Path::new(dir).join(java_exe());
            if java_path.exists() {
                if let Some(rt) = probe_java_executable(&java_path) {
                    // Deduplicate by path
                    if !found.iter().any(|r| r.path == rt.path) {
                        found.push(rt);
                    }
                }
            }
        }
    }

    // Check common install locations
    for dir in common_java_dirs() {
        if dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    if let Some(rt) = probe_java_dir(&entry.path()) {
                        if !found.iter().any(|r| r.path == rt.path) {
                            found.push(rt);
                        }
                    }
                }
            }
        }
    }

    found
}

/// Probes a Java installation directory (e.g., /usr/lib/jvm/temurin-25)
fn probe_java_dir(dir: &Path) -> Option<JavaRuntime> {
    let java = dir.join("bin").join(java_exe());
    if java.exists() {
        probe_java_executable(&java)
    } else {
        None
    }
}

/// Probes a specific java executable to get version info.
fn probe_java_executable(java_path: &Path) -> Option<JavaRuntime> {
    let output = Command::new(java_path)
        .arg("-version")
        .output()
        .ok()?;

    // java -version outputs to stderr
    let version_output = String::from_utf8_lossy(&output.stderr).to_string();
    parse_java_version(&version_output).map(|(version, vendor)| JavaRuntime {
        path: java_path.to_path_buf(),
        version,
        vendor,
        arch: detect_arch(),
    })
}

/// Parses java -version output.
/// Example: `openjdk version "25.0.1" 2025-10-14`
fn parse_java_version(output: &str) -> Option<(JavaVersion, String)> {
    let first_line = output.lines().next()?;

    // Detect vendor
    let vendor = if first_line.contains("Temurin") || first_line.contains("AdoptOpenJDK") {
        "Temurin"
    } else if first_line.contains("GraalVM") {
        "GraalVM"
    } else if first_line.contains("Zulu") {
        "Zulu"
    } else if first_line.contains("Corretto") {
        "Corretto"
    } else {
        "OpenJDK"
    };

    // Extract version string between quotes
    let version_str = first_line.split('"').nth(1)?;
    let parts: Vec<&str> = version_str.split('.').collect();

    let major = parts.first()?.parse::<u32>().ok()?;
    let minor = parts.get(1).and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
    let patch = parts.get(2)
        .and_then(|s| s.split('-').next())
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0);

    Some((
        JavaVersion { major, minor, patch },
        vendor.to_string(),
    ))
}

fn java_exe() -> &'static str {
    if cfg!(windows) { "java.exe" } else { "java" }
}

fn detect_arch() -> String {
    if cfg!(target_arch = "x86_64") {
        "x64".to_string()
    } else if cfg!(target_arch = "aarch64") {
        "aarch64".to_string()
    } else {
        std::env::consts::ARCH.to_string()
    }
}

fn common_java_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if cfg!(windows) {
        // Common Windows install paths
        if let Ok(program_files) = std::env::var("ProgramFiles") {
            dirs.push(PathBuf::from(&program_files).join("Java"));
            dirs.push(PathBuf::from(&program_files).join("Eclipse Adoptium"));
            dirs.push(PathBuf::from(&program_files).join("Temurin"));
        }
        if let Ok(program_files) = std::env::var("ProgramFiles(x86)") {
            dirs.push(PathBuf::from(&program_files).join("Java"));
        }
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            dirs.push(PathBuf::from(&local).join("Programs").join("Eclipse Adoptium"));
        }
    } else if cfg!(target_os = "macos") {
        dirs.push(PathBuf::from("/Library/Java/JavaVirtualMachines"));
        if let Ok(home) = std::env::var("HOME") {
            dirs.push(PathBuf::from(&home).join(".sdkman/candidates/java"));
        }
    } else {
        // Linux
        dirs.push(PathBuf::from("/usr/lib/jvm"));
        dirs.push(PathBuf::from("/usr/java"));
        if let Ok(home) = std::env::var("HOME") {
            dirs.push(PathBuf::from(&home).join(".sdkman/candidates/java"));
        }
    }

    dirs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_java_version_temurin() {
        let output = r#"openjdk version "25.0.1" 2025-10-14
OpenJDK Runtime Environment Temurin-25.0.1+10 (build 25.0.1+10)
OpenJDK 64-Bit Server VM Temurin-25.0.1+10 (build 25.0.1+10, mixed mode, sharing)"#;

        let (version, vendor) = parse_java_version(output).unwrap();
        assert_eq!(version.major, 25);
        assert_eq!(version.minor, 0);
        assert_eq!(version.patch, 1);
        assert_eq!(vendor, "Temurin");
    }

    #[test]
    fn test_parse_java_version_openjdk() {
        let output = r#"openjdk version "21.0.2" 2024-01-16
OpenJDK Runtime Environment (build 21.0.2+13-58)
OpenJDK 64-Bit Server VM (build 21.0.2+13-58, mixed mode, sharing)"#;

        let (version, vendor) = parse_java_version(output).unwrap();
        assert_eq!(version.major, 21);
        assert_eq!(vendor, "OpenJDK");
    }
}
