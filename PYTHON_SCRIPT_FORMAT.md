# Python Script Format Requirements

## Overview

Python scripts in Coreflux must follow a specific format to be properly processed and sent to the broker.

## Required Format

Every Python script **must** start with a comment in the following format:

```python
# Script Name: [YourScriptName]
```

## Examples

### ✅ Valid Python Script
```python
# Script Name: Greeter
def say_hello(name="World"):
    return f"Hello, {name}!"

# Example usage:
result = say_hello("Alice")
print(result)
```

### ❌ Invalid Python Script (Missing Script Name)
```python
def say_hello(name="World"):
    return f"Hello, {name}!"

# This will fail validation - missing required comment
```

## Error Handling

If a Python script is missing the required `# Script Name: [name]` comment:

1. The command will **not** be sent to the broker
2. An error message will be displayed in the notebook cell output
3. The execution will fail with a clear explanation

## Error Message

When validation fails, you'll see this error message:
```
Python script must start with "# Script Name: [name]" comment. Please add this comment at the beginning of your Python code.
```

## Migration from Old Format

If you have existing Python scripts using the old `# @name` format, update them to use the new format:

**Old format:**
```python
# @name Greeter
def say_hello(name="World"):
    return f"Hello, {name}!"
```

**New format:**
```python
# Script Name: Greeter
def say_hello(name="World"):
    return f"Hello, {name}!"
```

## Benefits

This enforced format ensures:
- Consistent naming across all Python scripts
- Clear identification of script purposes
- Proper integration with the Coreflux broker system
- Better error handling and user feedback