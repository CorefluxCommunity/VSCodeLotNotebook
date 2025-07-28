using System;
using Python.Runtime;

namespace CorefluxMQTTBroker.Services
{
    public class PythonExecutor
    {
        private bool _isInitialized = false;

        public void Initialize()
        {
            if (_isInitialized)
            {
                Console.WriteLine("[INF] Python runtime already initialized");
                return;
            }

            try
            {
                Console.WriteLine("[INF] Initializing Python runtime...");

                // First, try to automatically detect and set Python runtime
                if (!PythonDetection.InitializePythonRuntime())
                {
                    Console.WriteLine("[ERR] Failed to initialize Python runtime automatically");
                    Console.WriteLine("[INF] Please ensure Python 3.10+ is installed and try again");
                    return;
                }

                // Print diagnostics for debugging
                PythonDetection.PrintPythonDiagnostics();

                // Initialize Python.NET
                PythonEngine.Initialize();
                
                // Allow threading if needed
                PythonEngine.BeginAllowThreads();

                _isInitialized = true;
                Console.WriteLine("[INF] Python runtime initialized successfully");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERR] Failed to initialize Python runtime: {ex.Message}");
                Console.WriteLine("[INF] Please check Python installation and PYTHONNET_PYDLL setting");
                
                // Print diagnostics for troubleshooting
                PythonDetection.PrintPythonDiagnostics();
                
                throw;
            }
        }

        public void Shutdown()
        {
            if (_isInitialized)
            {
                try
                {
                    PythonEngine.Shutdown();
                    _isInitialized = false;
                    Console.WriteLine("[INF] Python runtime shutdown successfully");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[ERR] Error during Python runtime shutdown: {ex.Message}");
                }
            }
        }

        public bool IsInitialized => _isInitialized;

        public void ExecutePythonCode(string code)
        {
            if (!_isInitialized)
            {
                throw new InvalidOperationException("Python runtime not initialized. Call Initialize() first.");
            }

            try
            {
                using (Py.GIL())
                {
                    PythonEngine.RunSimpleString(code);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERR] Error executing Python code: {ex.Message}");
                throw;
            }
        }

        public dynamic? ExecutePythonExpression(string expression)
        {
            if (!_isInitialized)
            {
                throw new InvalidOperationException("Python runtime not initialized. Call Initialize() first.");
            }

            try
            {
                using (Py.GIL())
                {
                    return PythonEngine.Eval(expression);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERR] Error evaluating Python expression: {ex.Message}");
                return null;
            }
        }

        public void ImportModule(string moduleName)
        {
            if (!_isInitialized)
            {
                throw new InvalidOperationException("Python runtime not initialized. Call Initialize() first.");
            }

            try
            {
                using (Py.GIL())
                {
                    PythonEngine.ImportModule(moduleName);
                    Console.WriteLine($"[INF] Successfully imported Python module: {moduleName}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERR] Error importing Python module '{moduleName}': {ex.Message}");
                throw;
            }
        }
    }
}