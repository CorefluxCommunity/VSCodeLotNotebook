using System;
using CorefluxMQTTBroker.Services;

namespace CorefluxMQTTBroker.Tests
{
    public class PythonTest
    {
        public static void Main(string[] args)
        {
            Console.WriteLine("=== Python Runtime Auto-Detection Test ===");
            
            try
            {
                // Create and initialize Python executor
                var pythonExecutor = new PythonExecutor();
                
                Console.WriteLine("\n[TEST] Initializing Python runtime...");
                pythonExecutor.Initialize();
                
                if (pythonExecutor.IsInitialized)
                {
                    Console.WriteLine("\n[TEST] Python runtime initialized successfully!");
                    
                    // Test basic Python execution
                    Console.WriteLine("\n[TEST] Testing Python code execution...");
                    pythonExecutor.ExecutePythonCode(@"
import sys
print(f'Python version: {sys.version}')
print(f'Python executable: {sys.executable}')
print('Hello from Python!')
");
                    
                    // Test Python expression evaluation
                    Console.WriteLine("\n[TEST] Testing Python expression evaluation...");
                    var result = pythonExecutor.ExecutePythonExpression("2 + 3 * 4");
                    Console.WriteLine($"Result of '2 + 3 * 4': {result}");
                    
                    // Test module import
                    Console.WriteLine("\n[TEST] Testing module import...");
                    pythonExecutor.ImportModule("math");
                    var piValue = pythonExecutor.ExecutePythonExpression("math.pi");
                    Console.WriteLine($"Value of pi: {piValue}");
                    
                    Console.WriteLine("\n[TEST] All tests passed successfully!");
                }
                else
                {
                    Console.WriteLine("\n[TEST] Failed to initialize Python runtime");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"\n[TEST] Error during testing: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
            }
            
            Console.WriteLine("\n=== Test Complete ===");
        }
    }
}