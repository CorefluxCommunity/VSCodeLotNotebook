// src/renderer/tree-renderer.ts

interface NotebookRendererOutputItem {
  json<T = unknown>(): T;
  text(): string;
}

interface RenderOutputFunctions {
  renderOutputItem(outputItem: NotebookRendererOutputItem, element: HTMLElement): void;
  disposeOutputItem?(outputId: string): void;
}

// State maps
let expansionsMap: Record<string, boolean> = {};
let chartDataMap: Record<string, Array<{ time: number; rawValue: string; parsedValue: number | boolean | null }>> = {};
let chartOpenMap: Record<string, boolean> = {};
let chartObjects: Record<string, any> = {};
let dataTypeMap: Record<string, string> = {}; // Map path to selected data type (e.g., 'auto', 'int16')
let jsonExpansionsMap: Record<string, boolean> = {}; // Track JSON breakdown expansions

let chartJsLoaded = false;
let dateAdapterLoaded = false;
let colorSelected = "#4bc0c0";

/**
 * Attempt to load Chart.js and chartjs-adapter-date-fns (bundle) from CDN
 */
async function loadChartJs(): Promise<void> {
  if (chartJsLoaded && dateAdapterLoaded) return;

  // 1) Load Chart.js
  if (!chartJsLoaded) {
    await new Promise<void>((resolve, reject) => {
      console.log('[tree-renderer] Loading Chart.js from CDN...');
      const script = document.createElement('script');
      // Chart.js UMD
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.3.0/dist/chart.umd.min.js';
      script.onload = () => {
        chartJsLoaded = true;
        console.log('[tree-renderer] Chart.js loaded successfully.');
        resolve();
      };
      script.onerror = (err) => {
        console.error('[tree-renderer] Failed to load Chart.js.', err);
        reject(err);
      };
      document.head.appendChild(script);
    });
  }

  // 2) Load chartjs-adapter-date-fns *bundle*, which includes date-fns
  if (!dateAdapterLoaded) {
    await new Promise<void>((resolve, reject) => {
      console.log('[tree-renderer] Loading chartjs-adapter-date-fns bundle from CDN...');
      const script = document.createElement('script');
      // Must use the bundle that includes date-fns
      script.src = 'https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3/dist/chartjs-adapter-date-fns.bundle.min.js';
      script.onload = () => {
        dateAdapterLoaded = true;
        console.log('[tree-renderer] chartjs-adapter-date-fns bundle loaded successfully.');
        resolve();
      };
      script.onerror = (err) => {
        console.error('[tree-renderer] Failed to load chartjs-adapter-date-fns bundle.', err);
        reject(err);
      };
      document.head.appendChild(script);
    });
  }
}

/**
 * Check if a string is valid JSON
 */
function isValidJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a string is a base64 encoded image
 */
function isBase64Image(str: string): { isImage: boolean; mimeType?: string; src?: string } {
  const trimmed = str.trim();
  
  // Check for data URL format
  const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1];
    const base64Data = dataUrlMatch[2];
    
    if (mimeType.startsWith('image/')) {
      return { isImage: true, mimeType, src: trimmed };
    }
  }
  
  // Check for raw base64 image data
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(trimmed) && trimmed.length > 100) {
    // Common image magic bytes
    const jpegMagic = '/9j/';
    const pngMagic = 'iVBOR';
    const gifMagic = 'R0lGOD';
    const webpMagic = 'UklGR';
    
    if (trimmed.startsWith(jpegMagic)) {
      return { isImage: true, mimeType: 'image/jpeg', src: `data:image/jpeg;base64,${trimmed}` };
    } else if (trimmed.startsWith(pngMagic)) {
      return { isImage: true, mimeType: 'image/png', src: `data:image/png;base64,${trimmed}` };
    } else if (trimmed.startsWith(gifMagic)) {
      return { isImage: true, mimeType: 'image/gif', src: `data:image/gif;base64,${trimmed}` };
    } else if (trimmed.startsWith(webpMagic)) {
      return { isImage: true, mimeType: 'image/webp', src: `data:image/webp;base64,${trimmed}` };
    }
  }
  
  return { isImage: false };
}

/**
 * Check if a string contains HTML content
 */
function isHTMLContent(str: string): boolean {
  const trimmed = str.trim();
  
  // Check for common HTML tags
  const htmlTags = ['<html', '<div', '<p', '<span', '<body', '<head', '<title', '<h1', '<h2', '<h3', '<h4', '<h5', '<h6', '<ul', '<ol', '<li', '<a', '<img', '<table', '<tr', '<td', '<th', '<form', '<input', '<button', '<section', '<article', '<nav', '<header', '<footer', '<main', '<aside'];
  
  return trimmed.startsWith('<') && trimmed.includes('>') && 
         htmlTags.some(tag => trimmed.includes(tag));
}

/**
 * Render JSON breakdown
 */
function renderJSONBreakdown(parent: HTMLElement, jsonData: any, path: string, level: number): void {
  const container = document.createElement('div');
  container.style.marginLeft = `${level * 20}px`;
  container.style.marginTop = '5px';
  container.style.border = '1px solid #ddd';
  container.style.borderRadius = '4px';
  container.style.padding = '8px';
  container.style.backgroundColor = '#f9f9f9';
  
  const renderValue = (value: any, key: string, currentPath: string, currentLevel: number): HTMLElement => {
    const itemDiv = document.createElement('div');
    itemDiv.style.marginLeft = `${currentLevel * 15}px`;
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Object
      const details = document.createElement('details');
      const expanded = jsonExpansionsMap[currentPath] ?? false;
      if (expanded) details.setAttribute('open', '');
      
      const summary = document.createElement('summary');
      summary.textContent = `${key}: {}`;
      summary.style.fontWeight = 'bold';
      details.appendChild(summary);
      
      details.addEventListener('toggle', () => {
        jsonExpansionsMap[currentPath] = details.hasAttribute('open');
      });
      
      for (const [k, v] of Object.entries(value)) {
        const childPath = `${currentPath}.${k}`;
        details.appendChild(renderValue(v, k, childPath, currentLevel + 1));
      }
      
      itemDiv.appendChild(details);
    } else if (Array.isArray(value)) {
      // Array
      const details = document.createElement('details');
      const expanded = jsonExpansionsMap[currentPath] ?? false;
      if (expanded) details.setAttribute('open', '');
      
      const summary = document.createElement('summary');
      summary.textContent = `${key}: [${value.length} items]`;
      summary.style.fontWeight = 'bold';
      details.appendChild(summary);
      
      details.addEventListener('toggle', () => {
        jsonExpansionsMap[currentPath] = details.hasAttribute('open');
      });
      
      value.forEach((item, index) => {
        const childPath = `${currentPath}[${index}]`;
        details.appendChild(renderValue(item, `[${index}]`, childPath, currentLevel + 1));
      });
      
      itemDiv.appendChild(details);
    } else {
      // Primitive value
      const valueSpan = document.createElement('span');
      valueSpan.innerHTML = `<strong>${key}:</strong> `;
      
      if (typeof value === 'string') {
        // Check if it's a base64 image
        const imageCheck = isBase64Image(value);
        const isHTML = isHTMLContent(value);
        
        if (imageCheck.isImage) {
          const img = document.createElement('img');
          img.src = imageCheck.src!;
          img.alt = 'Base64 Image';
          img.style.maxWidth = '200px';
          img.style.maxHeight = '150px';
          img.style.display = 'block';
          img.style.margin = '5px 0';
          img.style.border = '1px solid #ddd';
          img.style.borderRadius = '3px';
          valueSpan.appendChild(document.createTextNode(`"${value.substring(0, 50)}..."`));
          valueSpan.appendChild(document.createElement('br'));
          valueSpan.appendChild(img);
        } else if (isHTML) {
          const htmlPreview = document.createElement('div');
          htmlPreview.innerHTML = value;
          htmlPreview.style.maxWidth = '300px';
          htmlPreview.style.maxHeight = '200px';
          htmlPreview.style.overflow = 'auto';
          htmlPreview.style.border = '1px solid #ccc';
          htmlPreview.style.padding = '5px';
          htmlPreview.style.backgroundColor = 'white';
          htmlPreview.style.margin = '5px 0';
          htmlPreview.style.borderRadius = '3px';
          valueSpan.appendChild(document.createTextNode(`"${value.substring(0, 50)}..."`));
          valueSpan.appendChild(document.createElement('br'));
          valueSpan.appendChild(htmlPreview);
        } else {
          // Check if it's JSON within JSON
          if (isValidJSON(value)) {
            const jsonPreview = document.createElement('div');
            jsonPreview.style.maxWidth = '300px';
            jsonPreview.style.maxHeight = '150px';
            jsonPreview.style.overflow = 'auto';
            jsonPreview.style.border = '1px solid #ddd';
            jsonPreview.style.padding = '5px';
            jsonPreview.style.backgroundColor = '#f8f8f8';
            jsonPreview.style.margin = '5px 0';
            jsonPreview.style.borderRadius = '3px';
            jsonPreview.style.fontFamily = 'monospace';
            jsonPreview.style.fontSize = '11px';
            
            try {
              const parsed = JSON.parse(value);
              jsonPreview.textContent = JSON.stringify(parsed, null, 2);
            } catch {
              jsonPreview.textContent = value;
            }
            
            valueSpan.appendChild(document.createTextNode(`"${value.substring(0, 50)}..."`));
            valueSpan.appendChild(document.createElement('br'));
            valueSpan.appendChild(jsonPreview);
          } else {
            // Check if it might be a long base64 string that could be an image
            if (value.length > 100 && /^[A-Za-z0-9+/=\r\n]+$/.test(value)) {
              const longBase64Preview = document.createElement('div');
              longBase64Preview.style.maxWidth = '300px';
              longBase64Preview.style.maxHeight = '100px';
              longBase64Preview.style.overflow = 'auto';
              longBase64Preview.style.border = '1px solid #ddd';
              longBase64Preview.style.padding = '5px';
              longBase64Preview.style.backgroundColor = '#f0f0f0';
              longBase64Preview.style.margin = '5px 0';
              longBase64Preview.style.borderRadius = '3px';
              longBase64Preview.style.fontFamily = 'monospace';
              longBase64Preview.style.fontSize = '10px';
              longBase64Preview.style.wordBreak = 'break-all';
              longBase64Preview.textContent = value.substring(0, 200) + (value.length > 200 ? '...' : '');
              longBase64Preview.title = 'Long base64 string (possibly image data)';
              
              valueSpan.appendChild(document.createTextNode(`"${value.substring(0, 50)}..."`));
              valueSpan.appendChild(document.createElement('br'));
              valueSpan.appendChild(longBase64Preview);
            } else {
              valueSpan.appendChild(document.createTextNode(`"${value}"`));
            }
          }
        }
      } else {
        valueSpan.appendChild(document.createTextNode(String(value)));
      }
      
      itemDiv.appendChild(valueSpan);
    }
    
    return itemDiv;
  };
  
  if (typeof jsonData === 'object' && jsonData !== null) {
    for (const [key, value] of Object.entries(jsonData)) {
      container.appendChild(renderValue(value, key, `${path}.${key}`, 0));
    }
  }
  
  parent.appendChild(container);
}

/**
 * Render HTML content in an iframe
 */
function renderHTMLContent(parent: HTMLElement, htmlContent: string, path: string): void {
  const container = document.createElement('div');
  container.style.marginTop = '5px';
  container.style.border = '1px solid #ddd';
  container.style.borderRadius = '4px';
  container.style.overflow = 'hidden';
  
  const header = document.createElement('div');
  header.style.backgroundColor = '#f0f0f0';
  header.style.padding = '5px 10px';
  header.style.borderBottom = '1px solid #ddd';
  header.style.fontWeight = 'bold';
  header.textContent = 'HTML Preview';
  
  const iframe = document.createElement('iframe');
  iframe.style.width = '100%';
  iframe.style.height = '300px';
  iframe.style.border = 'none';
  iframe.style.backgroundColor = 'white';
  
  // Create a blob URL for the HTML content
  const blob = new Blob([htmlContent], { type: 'text/html' });
  iframe.src = URL.createObjectURL(blob);
  
  container.appendChild(header);
  container.appendChild(iframe);
  parent.appendChild(container);
}

export function activate(): RenderOutputFunctions {
  return {
    async renderOutputItem(outputItem: NotebookRendererOutputItem, element: HTMLElement) {
      try {
        // Load Chart.js + adapter
        await loadChartJs();

        const data = outputItem.json<{
          root: Record<string, any>;
          expansions: Record<string, boolean>;
        }>();

        Object.assign(expansionsMap, data.expansions);
        // NOTE: We don't clear dataTypeMap here, it persists per renderer instance

        element.innerHTML = '';
        buildTree(element, data.root, '', 0);

        // Re-render any open charts
        for (const path of Object.keys(chartOpenMap)) {
          if (chartOpenMap[path]) {
            const chartDiv = element.querySelector(`#chartDiv-${escapeId(path)}`) as HTMLDivElement | null;
            const defaultColorInput = chartDiv?.querySelector<HTMLInputElement>(
              `#chartColor-${escapeId(path)}`
            );
            const defaultColor = defaultColorInput ? defaultColorInput.value : '#4bc0c0';

            if (chartDiv) {
              chartDiv.style.display = 'block';
              updateChart(chartDiv, path, defaultColor);
            }
          }
        }
      } catch (err) {
        element.textContent = `Error rendering LOT tree: ${String(err)}`;
      }
    },
    disposeOutputItem(_outputId: string): void {
      // no-op
    }
  };
}

export function deactivate(): void {
  // no-op
}

/**
 * Attempts to parse a payload string based on the selected type.
 * Returns the parsed value (number, boolean) or null if parsing fails or type is non-parsable.
 */
function parsePayload(payload: string, type: string): number | boolean | null {
  const p = payload.trim();
  switch (type) {
  case 'auto':
    const num = parseFloat(p);
    return !isNaN(num) ? num : null;
  case 'string':
    return null; // Cannot plot string directly
  case 'boolean':
    const lowerP = p.toLowerCase();
    if (lowerP === 'true' || lowerP === '1' || lowerP === 'on') return 1; // Return 1 for true
    if (lowerP === 'false' || lowerP === '0' || lowerP === 'off') return 0; // Return 0 for false
    return null; // Invalid boolean
  case 'int8':
  case 'int16':
  case 'int32':
    const intVal = parseInt(p, 10);
    // TODO: Add range checks for specific int types if necessary
    return !isNaN(intVal) ? intVal : null;
  case 'float32':
  case 'float64':
    const floatVal = parseFloat(p);
    return !isNaN(floatVal) ? floatVal : null;
  case 'hex':
    // Assume hex represents an integer
    const hexVal = parseInt(p.startsWith('0x') ? p : '0x' + p, 16);
    return !isNaN(hexVal) ? hexVal : null;
    // TODO: Add cases for Array, JSON, etc. if needed
  default:
    return null;
  }
}

/**
 * Recursively build <details>/<summary> with expansions + numeric charts
 */
function buildTree(
  parent: HTMLElement,
  node: Record<string, any>,
  path: string,
  level: number,
  colorChart: string = '#4bc0c0'
): void {
  for (const key of Object.keys(node)) {
    if (key === '_value') continue;

    const currentPath = path ? `${path}/${key}` : key;
    const val = node[key];
    const expanded = expansionsMap[currentPath] ?? false;

    if (typeof val === 'object' && val !== null) {
      // folder
      const details = document.createElement('details');
      //details.style.backgroundColor = '#f9f9f9';
      if (expanded) details.setAttribute('open', '');
      details.style.marginLeft = `${level * 20}px`;

      const summary = document.createElement('summary');
      summary.textContent = key;
      details.appendChild(summary);

      details.addEventListener('toggle', () => {
        expansionsMap[currentPath] = details.hasAttribute('open');
      });

      const chartDiv = parent.querySelector(`#chartDiv-${escapeId(path)}`) as HTMLDivElement | null;
      const defaultColorInput = chartDiv?.querySelector<HTMLInputElement>(
        `#chartColor-${escapeId(path)}`
      );
      const defaultColor = defaultColorInput ? defaultColorInput.value : '#4bc0c0';

      parent.appendChild(details);
      buildTree(details, val, currentPath, level + 1, defaultColor);

    } else {
      // leaf
      const div = document.createElement('div');
      div.style.marginLeft = `${level * 20}px`;
      div.innerHTML = `<strong>${key}:</strong> ${String(val)}`;
      parent.appendChild(div);
    }

    // if a nested _value
    if (val && typeof val === 'object' && val.hasOwnProperty('_value')) {
      const payloadStr = String(val._value);

      const payloadDiv = document.createElement('div');
      payloadDiv.style.marginLeft = `${(level + 1) * 20}px`;
      payloadDiv.style.display = 'flex';
      payloadDiv.style.alignItems = 'center';

      // Wrap payload value in a span for context menu
      const payloadValueSpan = document.createElement('span');
      
      // Handle very large payloads
      let displayValue = payloadStr;
      let isTruncated = false;
      const maxDisplayLength = 500;
      
      if (payloadStr.length > maxDisplayLength) {
        displayValue = payloadStr.substring(0, maxDisplayLength) + '...';
        isTruncated = true;
      }
      
      payloadValueSpan.innerHTML = `<strong>Payload:</strong> <span id="payloadValue-${escapeId(currentPath)}" title="Right-click to change data type">${displayValue}</span>`;
      
      // Add full payload tooltip if truncated
      if (isTruncated) {
        const payloadSpan = payloadValueSpan.querySelector(`#payloadValue-${escapeId(currentPath)}`);
        if (payloadSpan) {
          payloadSpan.title = `Right-click to change data type\n\nFull payload (${payloadStr.length} chars):\n${payloadStr}`;
        }
      }

      // --- ENHANCED CONTENT RENDERING LOGIC ---
      // Check for JSON content
      const isJSON = isValidJSON(payloadStr);
      
      // Check for base64 image content
      const imageCheck = isBase64Image(payloadStr);
      
      // Check for HTML content
      const isHTML = isHTMLContent(payloadStr);
      
      // Check if payload contains nested JSON (common in API responses)
      let nestedJSONData: any = null;
      if (!isJSON && payloadStr.includes('{') && payloadStr.includes('}')) {
        try {
          // Try to extract JSON from the payload
          const jsonMatch = payloadStr.match(/\{.*\}/s);
          if (jsonMatch) {
            nestedJSONData = JSON.parse(jsonMatch[0]);
          }
        } catch {
          // Ignore parsing errors
        }
      }
      
      // Create action buttons container
      const actionButtonsDiv = document.createElement('div');
      actionButtonsDiv.style.marginTop = '5px';
      actionButtonsDiv.style.display = 'flex';
      actionButtonsDiv.style.gap = '5px';
      actionButtonsDiv.style.flexWrap = 'wrap';
      
      // JSON breakdown button
      if (isJSON) {
        const jsonButton = document.createElement('button');
        jsonButton.textContent = '🔍 Break Down JSON';
        jsonButton.style.padding = '2px 8px';
        jsonButton.style.fontSize = '11px';
        jsonButton.style.cursor = 'pointer';
        jsonButton.style.backgroundColor = '#4CAF50';
        jsonButton.style.color = 'white';
        jsonButton.style.border = 'none';
        jsonButton.style.borderRadius = '3px';
        jsonButton.title = 'Expand JSON structure';
        
        jsonButton.addEventListener('click', () => {
          const existingBreakdown = payloadDiv.querySelector(`#jsonBreakdown-${escapeId(currentPath)}`);
          if (existingBreakdown) {
            existingBreakdown.remove();
            jsonButton.textContent = '🔍 Break Down JSON';
          } else {
            try {
              const jsonData = JSON.parse(payloadStr);
              const breakdownDiv = document.createElement('div');
              breakdownDiv.id = `jsonBreakdown-${escapeId(currentPath)}`;
              renderJSONBreakdown(breakdownDiv, jsonData, currentPath, level + 1);
              payloadDiv.appendChild(breakdownDiv);
              jsonButton.textContent = '🔽 Hide JSON';
            } catch (err) {
              console.error('Failed to parse JSON:', err);
              // Show error to user
              const errorDiv = document.createElement('div');
              errorDiv.style.color = 'red';
              errorDiv.style.fontSize = '11px';
              errorDiv.style.marginTop = '5px';
              errorDiv.textContent = `Error parsing JSON: ${err.message}`;
              payloadDiv.appendChild(errorDiv);
              // Remove error after 3 seconds
              setTimeout(() => errorDiv.remove(), 3000);
            }
          }
        });
        
        actionButtonsDiv.appendChild(jsonButton);
      }
      
      // Nested JSON breakdown button
      if (nestedJSONData) {
        const nestedJsonButton = document.createElement('button');
        nestedJsonButton.textContent = '🔍 Extract JSON';
        nestedJsonButton.style.padding = '2px 8px';
        nestedJsonButton.style.fontSize = '11px';
        nestedJsonButton.style.cursor = 'pointer';
        nestedJsonButton.style.backgroundColor = '#9C27B0';
        nestedJsonButton.style.color = 'white';
        nestedJsonButton.style.border = 'none';
        nestedJsonButton.style.borderRadius = '3px';
        nestedJsonButton.title = 'Extract and expand nested JSON';
        
        nestedJsonButton.addEventListener('click', () => {
          const existingBreakdown = payloadDiv.querySelector(`#nestedJsonBreakdown-${escapeId(currentPath)}`);
          if (existingBreakdown) {
            existingBreakdown.remove();
            nestedJsonButton.textContent = '🔍 Extract JSON';
          } else {
            const breakdownDiv = document.createElement('div');
            breakdownDiv.id = `nestedJsonBreakdown-${escapeId(currentPath)}`;
            renderJSONBreakdown(breakdownDiv, nestedJSONData, `${currentPath}.extracted`, level + 1);
            payloadDiv.appendChild(breakdownDiv);
            nestedJsonButton.textContent = '🔽 Hide JSON';
          }
        });
        
        actionButtonsDiv.appendChild(nestedJsonButton);
      }
      
      // Image preview button
      if (imageCheck.isImage) {
        const imageButton = document.createElement('button');
        imageButton.textContent = '🖼️ Show Image';
        imageButton.style.padding = '2px 8px';
        imageButton.style.fontSize = '11px';
        imageButton.style.cursor = 'pointer';
        imageButton.style.backgroundColor = '#2196F3';
        imageButton.style.color = 'white';
        imageButton.style.border = 'none';
        imageButton.style.borderRadius = '3px';
        imageButton.title = 'Display image preview';
        
        imageButton.addEventListener('click', () => {
          const existingImage = payloadDiv.querySelector(`#imagePreview-${escapeId(currentPath)}`);
          if (existingImage) {
            existingImage.remove();
            imageButton.textContent = '🖼️ Show Image';
          } else {
            const img = document.createElement('img');
            img.id = `imagePreview-${escapeId(currentPath)}`;
            img.src = imageCheck.src!;
            img.alt = 'Base64 Image';
            img.style.maxWidth = '400px';
            img.style.maxHeight = '300px';
            img.style.display = 'block';
            img.style.margin = '8px 0';
            img.style.border = '1px solid #ddd';
            img.style.borderRadius = '4px';
            payloadDiv.appendChild(img);
            imageButton.textContent = '🖼️ Hide Image';
          }
        });
        
        actionButtonsDiv.appendChild(imageButton);
      }
      
      // HTML preview button
      if (isHTML) {
        const htmlButton = document.createElement('button');
        htmlButton.textContent = '🌐 Show HTML';
        htmlButton.style.padding = '2px 8px';
        htmlButton.style.fontSize = '11px';
        htmlButton.style.cursor = 'pointer';
        htmlButton.style.backgroundColor = '#FF9800';
        htmlButton.style.color = 'white';
        htmlButton.style.border = 'none';
        htmlButton.style.borderRadius = '3px';
        htmlButton.title = 'Display HTML preview';
        
        htmlButton.addEventListener('click', () => {
          const existingHTML = payloadDiv.querySelector(`#htmlPreview-${escapeId(currentPath)}`);
          if (existingHTML) {
            existingHTML.remove();
            htmlButton.textContent = '🌐 Show HTML';
          } else {
            try {
              const htmlContainer = document.createElement('div');
              htmlContainer.id = `htmlPreview-${escapeId(currentPath)}`;
              renderHTMLContent(htmlContainer, payloadStr, currentPath);
              payloadDiv.appendChild(htmlContainer);
              htmlButton.textContent = '🌐 Hide HTML';
            } catch (err) {
              console.error('Failed to render HTML:', err);
              // Show error to user
              const errorDiv = document.createElement('div');
              errorDiv.style.color = 'red';
              errorDiv.style.fontSize = '11px';
              errorDiv.style.marginTop = '5px';
              errorDiv.textContent = `Error rendering HTML: ${err.message}`;
              payloadDiv.appendChild(errorDiv);
              // Remove error after 3 seconds
              setTimeout(() => errorDiv.remove(), 3000);
            }
          }
        });
        
        actionButtonsDiv.appendChild(htmlButton);
      }
      
      // Add action buttons to payload div
      if (actionButtonsDiv.children.length > 0) {
        payloadDiv.appendChild(actionButtonsDiv);
        
        // Add a small info text
        const infoText = document.createElement('div');
        infoText.style.fontSize = '10px';
        infoText.style.color = '#666';
        infoText.style.marginTop = '3px';
        infoText.style.fontStyle = 'italic';
        infoText.textContent = 'Click buttons above to interact with content';
        payloadDiv.appendChild(infoText);
      }
      // --- END ENHANCED CONTENT RENDERING LOGIC ---

      // Add context menu listener to the inner span
      const innerPayloadSpan = payloadValueSpan.querySelector<HTMLSpanElement>(`#payloadValue-${escapeId(currentPath)}`);
      if (innerPayloadSpan) {
        innerPayloadSpan.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          console.log(`Context menu requested for path: ${currentPath}, value: ${payloadStr}`);
          // TODO: Implement custom context menu creation and display here
          // Need to pass currentPath and potentially event coordinates
          showDataTypeContextMenu(event, currentPath);
        });
      }

      // Determine initial plottability based on 'auto' type
      const initialDataType = dataTypeMap[currentPath] || 'auto'; // Use stored type or default to auto
      const initialParsedValue = parsePayload(payloadStr, initialDataType);
      const isPlottable = initialParsedValue !== null;

      // Store raw value AND parsed value (using initial/auto parse)
      if (!chartDataMap[currentPath]) {
        chartDataMap[currentPath] = [];
      }
      chartDataMap[currentPath].push({
        time: Date.now(),
        rawValue: payloadStr, // Store raw string
        parsedValue: initialParsedValue // Store initial parse result
      });

      // Chart Button Span (visibility based on initial plottability)
      let chartButtonSpan: HTMLSpanElement | null = null;
      if (isPlottable) {
        chartButtonSpan = document.createElement('span');
        chartButtonSpan.id = `chartBtn-${escapeId(currentPath)}`;
        chartButtonSpan.style.marginLeft = '10px';
        chartButtonSpan.style.cursor = 'pointer';
        chartButtonSpan.style.color = colorSelected; // Use the current color
        chartButtonSpan.title = 'Show chart for numeric/boolean payloads';
        chartButtonSpan.innerHTML = `
           <svg fill="currentColor" width="16px" height="16px" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
             <path d="M19,2H5C3.3,2,2,3.3,2,5v14c0,1.7,1.3,3,3,3h14c1.7,0,3-1.3,3-3V5C22,3.3,20.7,2,19,2z M8,17c0,0.6-0.4,1-1,1s-1-0.4-1-1v-4 c0-0.6,0.4-1,1-1s1,0.4,1,1V17z M13,17c0,0.6-0.4,1-1,1s-1-0.4-1-1V7 c0-0.6,0.4-1,1-1s1,0.4,1,1V17z M18,17c0,0.6-0.4,1-1,1s-1-0.4-1-1v-6 c0-0.6,0.4-1,1-1s1,0.4,1,1V17z"/>
           </svg>`;
      }

      payloadDiv.appendChild(payloadValueSpan);
      if (chartButtonSpan) {
        payloadDiv.appendChild(chartButtonSpan);
      }

      // Conversion Display Div (initially empty)
      const conversionDiv = document.createElement('div');
      conversionDiv.id = `conversionDisplay-${escapeId(currentPath)}`;
      conversionDiv.style.marginLeft = `${(level + 1) * 20}px`;
      conversionDiv.style.marginTop = '3px';
      conversionDiv.style.fontSize = '0.9em';
      conversionDiv.style.fontFamily = 'monospace'; // Good for hex bytes
      conversionDiv.style.color = '#aaa'; // Dim color

      // Chart Area (initially hidden) - Keep this separate below the value/selector line
      const chartAreaDiv = document.createElement('div');
      chartAreaDiv.id = `chartDiv-${escapeId(currentPath)}`;
      chartAreaDiv.style.display = 'none';
      chartAreaDiv.style.marginTop = '5px';
      chartAreaDiv.style.marginLeft = `${(level + 1) * 20}px`; // Maintain indentation

      // We'll use a default color and default sizes here:
      const defaultChartColor = colorSelected; // Reuse color variable
      const defaultWidth = 400;
      const defaultHeight = 200;

      chartAreaDiv.innerHTML = `
          <!-- Chart controls -->
          <div style="margin-bottom: 5px;">
            <label for="chartColor-${escapeId(currentPath)}">Color:</label>
            <input type=\"color\" id=\"chartColor-${escapeId(currentPath)}\" value=\"${defaultChartColor}\" />

            <label for=\"chartWidth-${escapeId(currentPath)}\" style=\"margin-left: 10px;\">Width:</label>
            <input type=\"number\" id=\"chartWidth-${escapeId(currentPath)}\" value=\"${defaultWidth}\" style=\"width: 60px;\" />

            <label for=\"chartHeight-${escapeId(currentPath)}\" style=\"margin-left: 10px;\">Height:</label>
            <input type=\"number\" id=\"chartHeight-${escapeId(currentPath)}\" value=\"${defaultHeight}\" style=\"width: 60px;\" />

            <button id=\"chartApply-${escapeId(currentPath)}\" style=\"margin-left: 10px;\">Apply</button>
          </div>

          <!-- The canvas for the chart -->
          <canvas id=\"chartCanvas-${escapeId(currentPath)}\" width=\"${defaultWidth}\" height=\"${defaultHeight}\"></canvas>
      `;

      parent.appendChild(payloadDiv);
      parent.appendChild(conversionDiv); // Add the conversion display div
      parent.appendChild(chartAreaDiv);

      if (chartButtonSpan) {
        chartButtonSpan.addEventListener('click', () => {
          toggleChart(currentPath);
        });
      }
    }
  }
}

function toggleChart(path: string) {
  const chartDiv = document.getElementById(`chartDiv-${escapeId(path)}`) as HTMLDivElement | null;
  if (!chartDiv) return;

  const defaultColorInput = chartDiv?.querySelector<HTMLInputElement>(
    `#chartColor-${escapeId(path)}`
  );
  const defaultColor = defaultColorInput ? defaultColorInput.value : '#4bc0c0';

  defaultColorInput?.addEventListener('change', (e) => {
    const newColor = (e.target as HTMLInputElement)?.value;
    // Store the color or do whatever is needed
    chartObjects[path].data.datasets[0].borderColor = newColor;
    colorSelected = newColor;
  })

  if (chartDiv.style.display === 'none') {
    chartDiv.style.display = 'block';
    chartOpenMap[path] = true;
    updateChart(chartDiv, path, defaultColor);
  } else {
    chartDiv.style.display = 'none';
    chartOpenMap[path] = false;
  }
}

function updateChart(chartDiv: HTMLDivElement, path: string, defaultColorChart: string = '#4bc0c0') {
  // --- Get Canvas and Context ---
  const canvas = chartDiv.querySelector<HTMLCanvasElement>(
    `#chartCanvas-${escapeId(path)}`
  );
  if (!canvas) {
    chartDiv.innerText = '[Error] Canvas not found.';
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    chartDiv.innerText = '[Error] Canvas not supported.';
    return;
  }

  // --- Destroy existing chart object for this path, if any ---
  if (chartObjects[path]) {
    console.log(`[tree-renderer] Destroying previous chart instance for ${path}`);
    chartObjects[path].destroy(); // Destroy the old Chart.js object
    chartObjects[path] = null; // Remove from map
  }

  // --- Prepare Data ---
  const selectedType = dataTypeMap[path] || 'auto';
  const rawDataPoints = chartDataMap[path] || [];
  const parsedDataPoints = rawDataPoints
    .map(dp => ({
      time: dp.time,
      value: parsePayload(dp.rawValue, selectedType)
    }))
    .filter(dp => dp.value !== null);
  parsedDataPoints.sort((a, b) => a.time - b.time);
  const chartDataset = parsedDataPoints.map(dp => ({
    x: new Date(dp.time),
    y: dp.value
  }));

  // --- Create New Chart ---
  console.log(`[tree-renderer] Creating chart for ${path}`);
  const ChartCtor = (globalThis as any).Chart;
  if (!ChartCtor) {
    chartDiv.innerText = '[Error] globalThis.Chart is not available.';
    return;
  }
  const isBoolean = selectedType === 'boolean';
  const chart = new ChartCtor(ctx, { // Create a new chart object
    type: 'line',
    data: { 
      datasets: [
        {
          label: `${path} (${selectedType})`,
          data: chartDataset,
          borderColor: colorSelected, // Use current color
          tension: 0.1,
          stepped: isBoolean
        }
      ]
    },
    options: { 
      scales: {
        x: { 
          type: 'time', 
          time: { unit: 'second' }, 
          title: { display: true, text: 'Timestamp' } 
        },
        y: {
          type: isBoolean ? 'category' : 'linear',
          labels: isBoolean ? ['false', 'true'] : undefined,
          min: isBoolean ? 0 : undefined,
          max: isBoolean ? 1 : undefined,
          title: { display: true, text: 'Value' }
        }
      },
      plugins: { tooltip: { enabled: true } }
    }
  });

  chartObjects[path] = chart; // Store the NEW chart object

  // --- Add Apply Button Listener ---
  const applyBtn = chartDiv.querySelector<HTMLButtonElement>(
    `#chartApply-${escapeId(path)}`
  );
  if (applyBtn) {
    // Need to re-add listener as button might be recreated by buildTree
    applyBtn.replaceWith(applyBtn.cloneNode(true)); // Simple way to remove old listeners
    const newApplyBtn = chartDiv.querySelector<HTMLButtonElement>(`#chartApply-${escapeId(path)}`);
    newApplyBtn?.addEventListener('click', () => {
      const colorInput = chartDiv.querySelector<HTMLInputElement>(`#chartColor-${escapeId(path)}`);
      const widthInput = chartDiv.querySelector<HTMLInputElement>(`#chartWidth-${escapeId(path)}`);
      const heightInput = chartDiv.querySelector<HTMLInputElement>(`#chartHeight-${escapeId(path)}`);
      if (!colorInput || !widthInput || !heightInput || !chart) return;
      const newColor = colorInput.value;
      const newWidth = parseInt(widthInput.value, 10);
      const newHeight = parseInt(heightInput.value, 10);
      canvas.style.width = `${newWidth}px`;
      canvas.style.height = `${newHeight}px`;
      chart.data.datasets[0].borderColor = newColor;
      colorSelected = newColor; // Update global? Maybe should be per-chart.
      chart.update(); // Update after style change
    });
  }
}

function escapeId(path: string): string {
  return path.replace(/[^\w-]/g, '_');
}

// Function to create and show the context menu
function showDataTypeContextMenu(event: MouseEvent, path: string) {
  removeContextMenu();
  console.log(`Showing context menu for ${path} at ${event.clientX}, ${event.clientY}`);

  const menu = document.createElement('div');
  menu.id = 'dataTypeContextMenu';
  menu.style.position = 'absolute';
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  menu.style.backgroundColor = '#3c3c3c';
  menu.style.border = '1px solid #555';
  menu.style.padding = '5px 0';
  menu.style.zIndex = '1000';
  menu.style.color = '#ccc';
  menu.style.fontFamily = 'sans-serif';
  menu.style.fontSize = '12px';

  // Add Plotting Types
  const plotTypes = ['Auto', 'Boolean'];
  plotTypes.forEach(type => addMenuItem(menu, type, path));

  // Add Separator
  const separator1 = document.createElement('div');
  separator1.style.height = '1px';
  separator1.style.backgroundColor = '#555';
  separator1.style.margin = '5px 0';
  menu.appendChild(separator1);

  // Add Byte Conversion Types
  const byteTypes = ['Int8', 'Int16', 'Int32', 'Int64', 'Float32', 'Float64'];
  byteTypes.forEach(type => addMenuItem(menu, type, path));

  // Add Separator
  const separator2 = document.createElement('div');
  separator2.style.height = '1px';
  separator2.style.backgroundColor = '#555';
  separator2.style.margin = '5px 0';
  menu.appendChild(separator2);

  // Add Hex Specific Operations
  const hexTypes = ['Hex', 'View as Decimal (from Hex)'];
  hexTypes.forEach(type => addMenuItem(menu, type, path));

  document.body.appendChild(menu);
  document.addEventListener('click', removeContextMenu, { once: true, capture: true });
  menu.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
}

// Helper to add menu item and its click logic
function addMenuItem(menu: HTMLElement, type: string, path: string) {
  const item = document.createElement('div');
  item.textContent = type;
  item.style.padding = '4px 15px';
  item.style.cursor = 'pointer';

  item.addEventListener('mouseenter', () => item.style.backgroundColor = '#555');
  item.addEventListener('mouseleave', () => item.style.backgroundColor = '#3c3c3c');

  item.addEventListener('click', () => {
    const selectedType = type.toLowerCase(); // e.g., 'int8', 'view as decimal (from hex)'
    const selectedTypeRaw = type; // e.g., 'Int8', 'View as Decimal (from Hex)'
    console.log(`Selected type: ${selectedTypeRaw} for path: ${path}`);

    const conversionDiv = document.getElementById(`conversionDisplay-${escapeId(path)}`);
    const payloadValueElement = document.getElementById(`payloadValue-${escapeId(path)}`);
    const rawPayloadString = payloadValueElement?.textContent || '';

    if (!conversionDiv) {
      console.error('Conversion display div not found for', path);
      removeContextMenu();
      return;
    }

    // Reset styles
    conversionDiv.textContent = '';
    conversionDiv.style.color = 'inherit';

    // --- Handle actions based on selected type --- 
    if (selectedType === 'auto' || selectedType === 'boolean') {
      // Update plot type and chart
      dataTypeMap[path] = selectedType;
      const chartDiv = document.getElementById(`chartDiv-${escapeId(path)}`) as HTMLDivElement | null;
      if (chartDiv && chartOpenMap[path]) {
        updateChart(chartDiv, path, colorSelected);
      }
    } else if (selectedType === 'string') {
      // Just clear conversion display (already done)
    } else if (selectedType === 'view as decimal (from hex)') {
      try {
        const hexInput = rawPayloadString.trim().startsWith('0x') ? rawPayloadString.trim() : '0x' + rawPayloadString.trim();
        if (hexInput === '0x') throw new Error('Empty Hex string');
        const decimalValue = parseInt(hexInput, 16);
        if (isNaN(decimalValue)) throw new Error('Invalid Hex string for parsing');
        conversionDiv.textContent = `Hex '${rawPayloadString.trim()}' as Decimal: ${decimalValue}`;
      } catch (err: any) {
        conversionDiv.textContent = `Error: ${err.message}`;
        conversionDiv.style.color = 'red';
      } 
    } else {
    // Perform byte conversion and display (Int8, Int16, ..., Hex)
    // Note: 'hex' case in convertToBytes interprets input *as* hex bytes
      const result = convertToBytes(rawPayloadString, selectedType);
      if (result.error) {
        conversionDiv.textContent = `Error: ${result.error}`;
        conversionDiv.style.color = 'red';
      } else {
        conversionDiv.textContent = `As ${selectedTypeRaw} (LE): ${result.bytes.join(' ')}`;
      }
    }

    // TODO: Update chart button visibility based on 'auto' or 'boolean' state?
    removeContextMenu();
  });
  menu.appendChild(item);
}

// Function to remove the context menu
function removeContextMenu() {
  const existingMenu = document.getElementById('dataTypeContextMenu');
  if (existingMenu) {
    document.removeEventListener('click', removeContextMenu, { capture: true });
    existingMenu.remove();
  }
}

/**
 * Converts a string value to its byte representation for a given target type.
 * Assumes Little Endian.
 */
function convertToBytes(valueStr: string, targetType: string): { bytes: string[], error?: string } {
  const p = valueStr.trim();
  let num: number | bigint;
  let bufferSizeBytes: number;
  let dataViewSetter: (view: DataView, byteOffset: number, value: any, littleEndian?: boolean) => void;

  try {
    // Determine size and DataView setter based on type
    switch (targetType) {
    case 'int8':
      bufferSizeBytes = 1;
      num = parseInt(p, 10);
      dataViewSetter = (v, o, val) => v.setInt8(o, val);
      break;
    case 'int16':
      bufferSizeBytes = 2;
      num = parseInt(p, 10);
      dataViewSetter = (v, o, val) => v.setInt16(o, val, true);
      break;
    case 'int32':
      bufferSizeBytes = 4;
      num = parseInt(p, 10);
      dataViewSetter = (v, o, val) => v.setInt32(o, val, true);
      break;
    case 'int64': // Requires BigInt
      bufferSizeBytes = 8;
      num = BigInt(p);
      dataViewSetter = (v, o, val) => v.setBigInt64(o, val, true);
      break;
    case 'float32':
      bufferSizeBytes = 4;
      num = parseFloat(p);
      dataViewSetter = (v, o, val) => v.setFloat32(o, val, true);
      break;
    case 'float64':
      bufferSizeBytes = 8;
      num = parseFloat(p);
      dataViewSetter = (v, o, val) => v.setFloat64(o, val, true);
      break;
    case 'hex': // Treat hex input as the source for integer bytes
      const hexString = p.startsWith('0x') ? p.substring(2) : p;
      if (!/^[0-9a-fA-F]+$/.test(hexString)) throw new Error('Invalid Hex string');
      // Determine size based on hex string length (2 chars per byte)
      bufferSizeBytes = Math.ceil(hexString.length / 2);
      if (bufferSizeBytes === 0) throw new Error('Empty Hex string');
      const buffer = new ArrayBuffer(bufferSizeBytes);
      const view = new DataView(buffer);
      // Pad with leading zero if odd length
      const paddedHexString = hexString.length % 2 ? '0' + hexString : hexString;
      for (let i = 0; i < bufferSizeBytes; i++) {
        const byteHex = paddedHexString.substring(i * 2, i * 2 + 2);
        view.setUint8(i, parseInt(byteHex, 16));
      }
      // Read bytes back for consistent output format
      const bytes: string[] = [];
      for (let i = 0; i < bufferSizeBytes; i++) {
        bytes.push('0x' + view.getUint8(i).toString(16).padStart(2, '0').toUpperCase());
      }
      return { bytes };
    default:
      return { bytes: [], error: `Unsupported target type: ${targetType}` };
    }

    // Check if parsing failed (for non-BigInt types)
    if (typeof num === 'number' && isNaN(num)) {
      return { bytes: [], error: `Invalid number format for input: "${p}"` };
    }

    // Perform the conversion using DataView
    const buffer = new ArrayBuffer(bufferSizeBytes);
    const view = new DataView(buffer);
    dataViewSetter(view, 0, num, true);

    // Read bytes back as hex strings
    const bytes: string[] = [];
    for (let i = 0; i < bufferSizeBytes; i++) {
      bytes.push('0x' + view.getUint8(i).toString(16).padStart(2, '0').toUpperCase());
    }
    return { bytes };

  } catch (err: any) {
    return { bytes: [], error: err.message || 'Conversion failed' };
  }
}
