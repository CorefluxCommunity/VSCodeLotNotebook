# Enhanced Tree Renderer Demo

This demo shows the enhanced tree renderer capabilities for handling various payload types.

## JSON Payload Example

The tree renderer now detects JSON payloads and provides a "🔍 Break Down JSON" button to expand the structure.

### Example JSON Payload:
```json
{
  "id": "chatcmpl-BxfvN8zYMUmN2YBnnYPyfSRW32v97",
  "object": "chat.completion",
  "created": 1753562209,
  "model": "o4-mini-2025-04-16",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "The photo shows a right hand held out in front of a shelving unit...",
        "refusal": null,
        "annotations": []
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 528,
    "completion_tokens": 280,
    "total_tokens": 808
  }
}
```

## Base64 Image Example

The renderer detects base64 encoded images and provides a "🖼️ Show Image" button.

### Example Base64 Image Payload:
```
data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=
```

## HTML Content Example

The renderer detects HTML content and provides a "🌐 Show HTML" button to display it in an iframe.

### Example HTML Payload:
```html
<!DOCTYPE html>
<html>
<head>
    <title>Sample Page</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .container { max-width: 600px; margin: 0 auto; }
        .header { background: #f0f0f0; padding: 10px; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Sample HTML Content</h1>
            <p>This is a sample HTML page that can be rendered in the tree view.</p>
        </div>
        <div class="content">
            <h2>Features</h2>
            <ul>
                <li>JSON breakdown with expandable structure</li>
                <li>Base64 image preview</li>
                <li>HTML content rendering</li>
                <li>Nested JSON extraction</li>
            </ul>
        </div>
    </div>
</body>
</html>
```

## Nested JSON Example

The renderer can extract JSON from within larger payloads.

### Example Nested JSON Payload:
```
Some text before JSON: {"name": "John", "age": 30, "city": "New York"} and some text after.
```

## Features Added

1. **JSON Breakdown**: Click "🔍 Break Down JSON" to expand JSON structures with collapsible sections
2. **Image Preview**: Click "🖼️ Show Image" to display base64 encoded images
3. **HTML Rendering**: Click "🌐 Show HTML" to render HTML content in an iframe
4. **Nested JSON Extraction**: Click "🔍 Extract JSON" to extract and expand JSON from mixed content
5. **Enhanced Detection**: Improved detection of various content types including:
   - Multiple image formats (JPEG, PNG, GIF, WebP)
   - Comprehensive HTML tag detection
   - Long base64 string identification
   - JSON within JSON structures

## Usage

When viewing a tree with payloads, look for the colored action buttons that appear below the payload value. Each button provides a different way to interact with the content:

- **Green button (🔍)**: Break down JSON structures
- **Blue button (🖼️)**: Show image previews
- **Orange button (🌐)**: Show HTML content
- **Purple button (🔍)**: Extract nested JSON

The renderer maintains the existing charting functionality for numeric data while adding these new content-specific features.