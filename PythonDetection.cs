using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

namespace CorefluxMQTTBroker.Services
{
    public static class PythonDetection
    {
        private static readonly string[] PythonCommands = { "python3", "python", "python3.13", "python3.12", "python3.11", "python3.10" };
        private static readonly string[] LibraryPaths = {
            "/usr/lib/x86_64-linux-gnu/libpython3.13.so",
            "/usr/lib/x86_64-linux-gnu/libpython3.12.so", 
            "/usr/lib/x86_64-linux-gnu/libpython3.11.so",
            "/usr/lib/x86_64-linux-gnu/libpython3.10.so",
            "/usr/lib/libpython3.13.so",
            "/usr/lib/libpython3.12.so",
            "/usr/lib/libpython3.11.so",
            "/usr/lib/libpython3.10.so"
        };

        public static bool InitializePythonRuntime()
        {
            try
            {
                // Check if PYTHONNET_PYDLL is already set
                var existingPath = Environment.GetEnvironmentVariable("PYTHONNET_PYDLL");
                if (!string.IsNullOrEmpty(existingPath) && File.Exists(existingPath))
                {
                    Console.WriteLine($"[INF] Using existing PYTHONNET_PYDLL: {existingPath}");
                    return true;
                }

                // Try to detect Python installation
                var pythonInfo = DetectPythonInstallation();
                if (pythonInfo == null)
                {
                    Console.WriteLine("[ERR] No Python installation detected. Please install Python 3.10+ or set PYTHONNET_PYDLL manually.");
                    return false;
                }

                Console.WriteLine($"[INF] Detected Python {pythonInfo.Version} at: {pythonInfo.ExecutablePath}");

                // Find the corresponding library file
                var libraryPath = FindPythonLibrary(pythonInfo.Version);
                if (string.IsNullOrEmpty(libraryPath))
                {
                    Console.WriteLine($"[ERR] Could not find Python library for version {pythonInfo.Version}");
                    Console.WriteLine("[INF] Please install Python development libraries or set PYTHONNET_PYDLL manually.");
                    return false;
                }

                // Set the environment variable
                Environment.SetEnvironmentVariable("PYTHONNET_PYDLL", libraryPath);
                Console.WriteLine($"[INF] Set PYTHONNET_PYDLL to: {libraryPath}");

                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERR] Error initializing Python runtime: {ex.Message}");
                return false;
            }
        }

        private static PythonInfo? DetectPythonInstallation()
        {
            foreach (var command in PythonCommands)
            {
                try
                {
                    var pythonInfo = GetPythonInfo(command);
                    if (pythonInfo != null)
                    {
                        return pythonInfo;
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[DBG] Failed to check {command}: {ex.Message}");
                }
            }

            return null;
        }

        private static PythonInfo? GetPythonInfo(string command)
        {
            try
            {
                // Check if command exists and get version
                var startInfo = new ProcessStartInfo
                {
                    FileName = command,
                    Arguments = "--version",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using var process = Process.Start(startInfo);
                if (process == null) return null;

                var output = process.StandardOutput.ReadToEnd();
                var error = process.StandardError.ReadToEnd();
                process.WaitForExit();

                if (process.ExitCode != 0)
                {
                    Console.WriteLine($"[DBG] Command '{command}' failed: {error}");
                    return null;
                }

                // Parse version from output (e.g., "Python 3.13.3")
                var versionMatch = Regex.Match(output, @"Python (\d+\.\d+)");
                if (!versionMatch.Success)
                {
                    Console.WriteLine($"[DBG] Could not parse version from: {output}");
                    return null;
                }

                var version = versionMatch.Groups[1].Value;
                var executablePath = GetExecutablePath(command);

                return new PythonInfo
                {
                    Version = version,
                    ExecutablePath = executablePath,
                    FullVersion = output.Trim()
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DBG] Error getting Python info for {command}: {ex.Message}");
                return null;
            }
        }

        private static string GetExecutablePath(string command)
        {
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = "which",
                    Arguments = command,
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using var process = Process.Start(startInfo);
                if (process == null) return command;

                var output = process.StandardOutput.ReadToEnd().Trim();
                process.WaitForExit();

                return string.IsNullOrEmpty(output) ? command : output;
            }
            catch
            {
                return command;
            }
        }

        private static string? FindPythonLibrary(string version)
        {
            // Extract major.minor version (e.g., "3.13" from "3.13.3")
            var versionMatch = Regex.Match(version, @"(\d+\.\d+)");
            if (!versionMatch.Success)
            {
                return null;
            }

            var majorMinorVersion = versionMatch.Groups[1].Value;

            // Check common library paths for this version
            foreach (var basePath in LibraryPaths)
            {
                var versionedPath = basePath.Replace("3.13", majorMinorVersion)
                                           .Replace("3.12", majorMinorVersion)
                                           .Replace("3.11", majorMinorVersion)
                                           .Replace("3.10", majorMinorVersion);

                if (File.Exists(versionedPath))
                {
                    return versionedPath;
                }
            }

            // Try to find library using ldconfig
            try
            {
                var libraryName = $"libpython{majorMinorVersion}.so";
                var startInfo = new ProcessStartInfo
                {
                    FileName = "ldconfig",
                    Arguments = "-p",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using var process = Process.Start(startInfo);
                if (process != null)
                {
                    var output = process.StandardOutput.ReadToEnd();
                    process.WaitForExit();

                    var lines = output.Split('\n');
                    foreach (var line in lines)
                    {
                        if (line.Contains(libraryName))
                        {
                            var parts = line.Split("=>");
                            if (parts.Length == 2)
                            {
                                var path = parts[1].Trim();
                                if (File.Exists(path))
                                {
                                    return path;
                                }
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DBG] Error using ldconfig: {ex.Message}");
            }

            return null;
        }

        public static void PrintPythonDiagnostics()
        {
            Console.WriteLine("[INF] Python Runtime Diagnostics:");
            Console.WriteLine($"PYTHONNET_PYDLL: {Environment.GetEnvironmentVariable("PYTHONNET_PYDLL") ?? "Not set"}");
            
            foreach (var command in PythonCommands)
            {
                try
                {
                    var startInfo = new ProcessStartInfo
                    {
                        FileName = "which",
                        Arguments = command,
                        RedirectStandardOutput = true,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    };

                    using var process = Process.Start(startInfo);
                    if (process != null)
                    {
                        var output = process.StandardOutput.ReadToEnd().Trim();
                        process.WaitForExit();
                        
                        if (!string.IsNullOrEmpty(output))
                        {
                            Console.WriteLine($"Found {command}: {output}");
                        }
                    }
                }
                catch
                {
                    // Ignore errors
                }
            }

            Console.WriteLine("[INF] Checking common library paths:");
            foreach (var path in LibraryPaths)
            {
                var exists = File.Exists(path);
                Console.WriteLine($"  {path}: {(exists ? "EXISTS" : "NOT FOUND")}");
            }
        }
    }

    public class PythonInfo
    {
        public string Version { get; set; } = string.Empty;
        public string ExecutablePath { get; set; } = string.Empty;
        public string FullVersion { get; set; } = string.Empty;
    }
}