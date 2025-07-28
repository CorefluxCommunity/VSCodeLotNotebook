# Python Runtime Auto-Detection for Coreflux Broker

This solution automatically detects Python installation and sets the correct `PYTHONNET_PYDLL` environment variable for Python.NET integration.

## 🔧 How It Works

### 1. **Automatic Python Detection**
The `PythonDetection` class automatically:
- Searches for Python installations using common commands (`python3`, `python`, `python3.13`, etc.)
- Detects the Python version and executable path
- Finds the corresponding shared library file (`.so` file)
- Sets the `PYTHONNET_PYDLL` environment variable

### 2. **Supported Python Versions**
- Python 3.10+
- Python 3.11
- Python 3.12
- Python 3.13

### 3. **Library Search Paths**
The system searches for Python libraries in common locations:
- `/usr/lib/x86_64-linux-gnu/libpython3.*.so`
- `/usr/lib/libpython3.*.so`
- Uses `ldconfig -p` to find additional library locations

## 🚀 Usage

### Basic Usage
```csharp
using CorefluxMQTTBroker.Services;

// Create Python executor
var pythonExecutor = new PythonExecutor();

// Initialize (automatically detects Python and sets PYTHONNET_PYDLL)
pythonExecutor.Initialize();

// Use Python
pythonExecutor.ExecutePythonCode("print('Hello from Python!')");
```

### In Your Broker Service
```csharp
public class YourBrokerService
{
    private readonly PythonExecutor _pythonExecutor;

    public YourBrokerService()
    {
        _pythonExecutor = new PythonExecutor();
    }

    public void Start()
    {
        // Initialize Python runtime automatically
        _pythonExecutor.Initialize();
        
        if (_pythonExecutor.IsInitialized)
        {
            Console.WriteLine("Python runtime ready for use");
        }
        else
        {
            Console.WriteLine("Failed to initialize Python runtime");
        }
    }
}
```

## 🔍 Diagnostics

### Manual Diagnostics
```csharp
// Print detailed diagnostics
PythonDetection.PrintPythonDiagnostics();
```

### Expected Output
```
[INF] Python Runtime Diagnostics:
PYTHONNET_PYDLL: /usr/lib/x86_64-linux-gnu/libpython3.13.so
Found python3: /usr/bin/python3
Found python3.13: /usr/bin/python3.13
[INF] Checking common library paths:
  /usr/lib/x86_64-linux-gnu/libpython3.13.so: EXISTS
  /usr/lib/x86_64-linux-gnu/libpython3.12.so: NOT FOUND
  ...
```

## 🛠️ Troubleshooting

### 1. **No Python Installation Detected**
**Error**: `No Python installation detected`
**Solution**: Install Python 3.10+
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install python3 python3-dev

# CentOS/RHEL
sudo yum install python3 python3-devel
```

### 2. **Python Library Not Found**
**Error**: `Could not find Python library for version X.X`
**Solution**: Install Python development libraries
```bash
# Ubuntu/Debian
sudo apt install python3-dev

# CentOS/RHEL
sudo yum install python3-devel
```

### 3. **Manual PYTHONNET_PYDLL Setting**
If automatic detection fails, you can set it manually:
```bash
export PYTHONNET_PYDLL=/usr/lib/x86_64-linux-gnu/libpython3.13.so
```

### 4. **Check Python Installation**
```bash
# Check Python version
python3 --version

# Find Python library
find /usr -name "libpython3*.so*" 2>/dev/null

# Check library with ldconfig
ldconfig -p | grep python
```

## 📋 Requirements

### System Requirements
- Linux operating system
- Python 3.10 or higher
- Python development libraries
- .NET 6.0 or higher

### Python.NET NuGet Package
```xml
<PackageReference Include="pythonnet" Version="3.0.3" />
```

## 🔄 Integration with Existing Code

### Before (Manual Setup)
```csharp
// Old way - required manual setup
Environment.SetEnvironmentVariable("PYTHONNET_PYDLL", "/path/to/python/lib.so");
PythonEngine.Initialize();
```

### After (Automatic Detection)
```csharp
// New way - automatic detection
var pythonExecutor = new PythonExecutor();
pythonExecutor.Initialize(); // Automatically detects and sets PYTHONNET_PYDLL
```

## 🧪 Testing

### Run the Test Program
```bash
dotnet run --project PythonTest.cs
```

### Expected Test Output
```
=== Python Runtime Auto-Detection Test ===

[TEST] Initializing Python runtime...
[INF] Detected Python 3.13 at: /usr/bin/python3
[INF] Set PYTHONNET_PYDLL to: /usr/lib/x86_64-linux-gnu/libpython3.13.so
[INF] Python runtime initialized successfully
[TEST] Python runtime initialized successfully!

[TEST] Testing Python code execution...
Python version: 3.13.3 (main, Apr  8 2024, 12:34:56)
Python executable: /usr/bin/python3
Hello from Python!

[TEST] Testing Python expression evaluation...
Result of '2 + 3 * 4': 14

[TEST] Testing module import...
[INF] Successfully imported Python module: math
Value of pi: 3.141592653589793

[TEST] All tests passed successfully!
=== Test Complete ===
```

## 🔧 Advanced Configuration

### Custom Python Commands
You can modify the `PythonCommands` array in `PythonDetection.cs`:
```csharp
private static readonly string[] PythonCommands = { 
    "python3", "python", "python3.13", "python3.12", "python3.11", "python3.10",
    "python3.9", "python3.8" // Add more versions as needed
};
```

### Custom Library Paths
You can modify the `LibraryPaths` array:
```csharp
private static readonly string[] LibraryPaths = {
    "/usr/lib/x86_64-linux-gnu/libpython3.13.so",
    "/usr/lib/x86_64-linux-gnu/libpython3.12.so",
    "/custom/path/libpython3.13.so" // Add custom paths
};
```

## 🚀 Benefits

1. **Zero Configuration**: No manual setup required
2. **Automatic Detection**: Finds Python installation automatically
3. **Multiple Version Support**: Works with Python 3.10+
4. **Robust Error Handling**: Provides clear error messages
5. **Diagnostic Tools**: Built-in troubleshooting utilities
6. **Cross-Platform Ready**: Easy to extend for Windows/macOS

## 📝 License

This solution is part of the Coreflux Broker project and follows the same licensing terms.