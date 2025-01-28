// src/renderer/tree-renderer.ts

interface NotebookRendererOutputItem {
  json<T = unknown>(): T;
  text(): string;
}

interface RenderOutputFunctions {
  renderOutputItem(outputItem: NotebookRendererOutputItem, element: HTMLElement): void;
  disposeOutputItem?(outputId: string): void;
}

// expansions for <details>, chart data, open states, chart objects
let expansionsMap: Record<string, boolean> = {};
let chartDataMap: Record<string, Array<{ time: number; value: number }>> = {};
let chartOpenMap: Record<string, boolean> = {};
let chartObjects: Record<string, any> = {};

let chartJsLoaded = false;
let dateAdapterLoaded = false;

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

        element.innerHTML = '';
        buildTree(element, data.root, '', 0);

        // Re-render any open charts
        for (const path of Object.keys(chartOpenMap)) {
          if (chartOpenMap[path]) {
            const chartDiv = element.querySelector(`#chartDiv-${escapeId(path)}`) as HTMLDivElement | null;
            if (chartDiv) {
              chartDiv.style.display = 'block';
              updateChart(chartDiv, path);
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
 * Recursively build <details>/<summary> with expansions + numeric charts
 */
function buildTree(
  parent: HTMLElement,
  node: Record<string, any>,
  path: string,
  level: number
): void {
  for (const key of Object.keys(node)) {
    if (key === '_value') continue;

    const currentPath = path ? `${path}/${key}` : key;
    const val = node[key];
    const expanded = expansionsMap[currentPath] ?? false;

    if (typeof val === 'object' && val !== null) {
      // folder
      const details = document.createElement('details');
      if (expanded) details.setAttribute('open', '');
      details.style.marginLeft = `${level * 20}px`;

      const summary = document.createElement('summary');
      summary.textContent = key;
      details.appendChild(summary);

      details.addEventListener('toggle', () => {
        expansionsMap[currentPath] = details.hasAttribute('open');
      });

      parent.appendChild(details);
      buildTree(details, val, currentPath, level + 1);

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
      const numericVal = parseFloat(payloadStr);
      const isNumeric = !isNaN(numericVal);

      const payloadDiv = document.createElement('div');
      payloadDiv.style.marginLeft = `${(level + 1) * 20}px`;

      if (isNumeric) {
        if (!chartDataMap[currentPath]) {
          chartDataMap[currentPath] = [];
        }
        chartDataMap[currentPath].push({ time: Date.now(), value: numericVal });
      
        // We'll use a default color and default sizes here:
        const defaultChartColor = '#4bc0c0'; // could be 'rgb(75, 192, 192)'
        const defaultWidth = 400;
        const defaultHeight = 200;
      
        payloadDiv.innerHTML = `
          <strong>Payload:</strong> ${payloadStr}
          <span
            id="chartBtn-${escapeId(currentPath)}"
            style="margin-left:10px; cursor:pointer; color:${defaultChartColor};"
            title="Show chart for numeric payloads"
          >
            <svg
              fill="currentColor"
              width="16px"
              height="16px"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M19,2H5C3.3,2,2,3.3,2,5v14c0,1.7,1.3,3,3,3h14c1.7,0,3-1.3,3-3V5C22,3.3,20.7,2,19,2z
                       M8,17c0,0.6-0.4,1-1,1s-1-0.4-1-1v-4
                       c0-0.6,0.4-1,1-1s1,0.4,1,1V17z
                       M13,17c0,0.6-0.4,1-1,1s-1-0.4-1-1V7
                       c0-0.6,0.4-1,1-1s1,0.4,1,1V17z
                       M18,17c0,0.6-0.4,1-1,1s-1-0.4-1-1v-6
                       c0-0.6,0.4-1,1-1s1,0.4,1,1V17z"/>
            </svg>
          </span>
      
          <div id="chartDiv-${escapeId(currentPath)}" style="display:none; margin-top:5px;">
            <!-- Chart controls -->
            <div style="margin-bottom: 5px;">
              <label for="chartColor-${escapeId(currentPath)}">Color:</label>
              <input type="color" id="chartColor-${escapeId(currentPath)}" value="${defaultChartColor}" />
      
              <label for="chartWidth-${escapeId(currentPath)}" style="margin-left: 10px;">Width:</label>
              <input type="number" id="chartWidth-${escapeId(currentPath)}" value="${defaultWidth}" style="width: 60px;" />
      
              <label for="chartHeight-${escapeId(currentPath)}" style="margin-left: 10px;">Height:</label>
              <input type="number" id="chartHeight-${escapeId(currentPath)}" value="${defaultHeight}" style="width: 60px;" />
      
              <button id="chartApply-${escapeId(currentPath)}" style="margin-left: 10px;">Apply</button>
            </div>
      
            <!-- The canvas for the chart -->
            <canvas id="chartCanvas-${escapeId(currentPath)}" width="${defaultWidth}" height="${defaultHeight}"></canvas>
          </div>
        `;
      }
      else {
        payloadDiv.innerHTML = `<strong>Payload:</strong> ${payloadStr}`;
      }
      parent.appendChild(payloadDiv);

      if (isNumeric) {
        const chartBtn = payloadDiv.querySelector(`#chartBtn-${escapeId(currentPath)}`) as HTMLButtonElement | null;
        if (chartBtn) {
          chartBtn.addEventListener('click', () => {
            toggleChart(currentPath);
          });
        }
      }
    }
  }
}

function toggleChart(path: string) {
  const chartDiv = document.getElementById(`chartDiv-${escapeId(path)}`) as HTMLDivElement | null;
  if (!chartDiv) return;

  if (chartDiv.style.display === 'none') {
    chartDiv.style.display = 'block';
    chartOpenMap[path] = true;
    updateChart(chartDiv, path);
  } else {
    chartDiv.style.display = 'none';
    chartOpenMap[path] = false;
  }
}


function updateChart(chartDiv: HTMLDivElement, path: string) {
  // If an old chart instance exists, destroy it
  if (chartObjects[path]) {
    chartObjects[path].destroy();
    chartObjects[path] = null;
  }

  // Select our existing canvas
  const canvas = chartDiv.querySelector<HTMLCanvasElement>(
    `#chartCanvas-${escapeId(path)}`
  );
  if (!canvas) {
    chartDiv.innerText = '[Error] Canvas not found.';
    return;
  }

  // Grab the 2D context
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    chartDiv.innerText = '[Error] Canvas not supported.';
    return;
  }

  // Prepare chart data
  const dataPoints = chartDataMap[path] || [];
  dataPoints.sort((a, b) => a.time - b.time);
  const chartDataset = dataPoints.map(dp => ({
    x: new Date(dp.time),
    y: dp.value
  }));

  // Reference the loaded Chart from globalThis
  const ChartCtor = (globalThis as any).Chart;
  if (!ChartCtor) {
    chartDiv.innerText = '[Error] globalThis.Chart is not available.';
    return;
  }

  // Default color (or read from the color input if you want)
  const defaultColorInput = chartDiv.querySelector<HTMLInputElement>(
    `#chartColor-${escapeId(path)}`
  );
  const defaultColor = defaultColorInput ? defaultColorInput.value : '#4bc0c0';

  // Create the chart
  const chart = new ChartCtor(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: path,
          data: chartDataset,
          borderColor: defaultColor,
          tension: 0.1
        }
      ]
    },
    options: {
      scales: {
        x: {
          type: 'time', // requires chartjs-adapter-date-fns
          time: {
            unit: 'second'
          },
          title: {
            display: true,
            text: 'Timestamp'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Value'
          }
        }
      },
      plugins: {
        tooltip: {
          enabled: true
        }
      }
    }
  });

  chartObjects[path] = chart;

  // Hook up the "Apply" button to update chart color / size
  const applyBtn = chartDiv.querySelector<HTMLButtonElement>(
    `#chartApply-${escapeId(path)}`
  );
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      const colorInput = chartDiv.querySelector<HTMLInputElement>(
        `#chartColor-${escapeId(path)}`
      );
      const widthInput = chartDiv.querySelector<HTMLInputElement>(
        `#chartWidth-${escapeId(path)}`
      );
      const heightInput = chartDiv.querySelector<HTMLInputElement>(
        `#chartHeight-${escapeId(path)}`
      );

      if (!colorInput || !widthInput || !heightInput) return;

      // Read new values
      const newColor = colorInput.value;
      const newWidth = parseInt(widthInput.value, 10);
      const newHeight = parseInt(heightInput.value, 10);

      // Update canvas size
      canvas.width = newWidth;
      canvas.height = newHeight;

      // Update chart color
      chart.data.datasets[0].borderColor = newColor;

      // Force chart.js to resize & re-render
      chart.resize();
      chart.update();
    });
  }
}


function escapeId(path: string): string {
  return path.replace(/[^\w-]/g, '_');
}
