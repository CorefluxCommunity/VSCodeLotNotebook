// src/renderer/shell-renderer.ts

interface NotebookRendererOutputItem {
  json<T = unknown>(): T;
  text(): string;
}

interface RenderOutputFunctions {
  renderOutputItem(outputItem: NotebookRendererOutputItem, element: HTMLElement): void;
  disposeOutputItem?(outputId: string): void;
}

interface ShellCommand {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface ShellOutput {
  commands: ShellCommand[];
}

export function activate(): RenderOutputFunctions {
  return {
    renderOutputItem(outputItem: NotebookRendererOutputItem, element: HTMLElement) {
      try {
        const data = outputItem.json<ShellOutput>();
        
        element.innerHTML = '';
        buildShellTree(element, data);
      } catch (err) {
        // Fallback to text if JSON parsing fails
        const text = outputItem.text();
        element.innerHTML = `<pre style="background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 10px; border-radius: 4px; font-family: 'Courier New', monospace; white-space: pre-wrap;">${escapeHtml(text)}</pre>`;
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

function buildShellTree(parent: HTMLElement, data: ShellOutput): void {
  if (!data.commands || data.commands.length === 0) {
    parent.innerHTML = '<div style="color: var(--vscode-descriptionForeground); font-style: italic;">No commands executed</div>';
    return;
  }

  const container = document.createElement('div');
  container.style.fontFamily = 'var(--vscode-font-family)';
  container.style.fontSize = 'var(--vscode-font-size)';
  container.style.color = 'var(--vscode-foreground)';

  data.commands.forEach((cmd, index) => {
    const commandNode = createCommandNode(cmd, index + 1);
    container.appendChild(commandNode);
  });

  parent.appendChild(container);
}

function createCommandNode(cmd: ShellCommand, commandNumber: number): HTMLElement {
  const details = document.createElement('details');
  details.style.marginBottom = '8px';
  details.style.border = '1px solid var(--vscode-panel-border)';
  details.style.borderRadius = '4px';
  details.style.backgroundColor = 'var(--vscode-editor-background)';
  details.setAttribute('open', ''); // Start expanded

  const summary = document.createElement('summary');
  summary.style.padding = '8px 12px';
  summary.style.cursor = 'pointer';
  summary.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
  summary.style.borderBottom = '1px solid var(--vscode-panel-border)';
  summary.style.fontWeight = 'bold';
  summary.style.userSelect = 'none';

  // Command number and command text
  const commandText = document.createElement('span');
  commandText.style.fontFamily = 'monospace';
  commandText.style.color = 'var(--vscode-textPreformat-foreground)';
  commandText.textContent = `${commandNumber}. ${cmd.command}`;

  // Exit code indicator
  const exitCodeSpan = document.createElement('span');
  exitCodeSpan.style.marginLeft = '12px';
  exitCodeSpan.style.fontSize = '0.9em';
  exitCodeSpan.style.fontWeight = 'normal';
  
  if (cmd.exitCode === 0) {
    exitCodeSpan.style.color = 'var(--vscode-debugIcon-startForeground)';
    exitCodeSpan.textContent = `✓ (exit: ${cmd.exitCode})`;
  } else {
    exitCodeSpan.style.color = 'var(--vscode-errorForeground)';
    exitCodeSpan.textContent = `✗ (exit: ${cmd.exitCode})`;
  }

  summary.appendChild(commandText);
  summary.appendChild(exitCodeSpan);

  // Output content
  const content = document.createElement('div');
  content.style.padding = '8px 12px';

  // Add stdout if present
  if (cmd.stdout.trim()) {
    const stdoutDiv = document.createElement('div');
    stdoutDiv.style.marginBottom = '8px';
    
    const stdoutLabel = document.createElement('div');
    stdoutLabel.style.fontSize = '0.8em';
    stdoutLabel.style.color = 'var(--vscode-descriptionForeground)';
    stdoutLabel.style.marginBottom = '4px';
    stdoutLabel.textContent = 'STDOUT:';
    
    const stdoutContent = document.createElement('pre');
    stdoutContent.style.margin = '0';
    stdoutContent.style.padding = '8px';
    stdoutContent.style.backgroundColor = 'var(--vscode-textBlockQuote-background)';
    stdoutContent.style.borderRadius = '3px';
    stdoutContent.style.fontFamily = 'monospace';
    stdoutContent.style.fontSize = '0.9em';
    stdoutContent.style.whiteSpace = 'pre-wrap';
    stdoutContent.style.wordBreak = 'break-word';
    stdoutContent.style.color = 'var(--vscode-foreground)';
    stdoutContent.textContent = cmd.stdout;

    stdoutDiv.appendChild(stdoutLabel);
    stdoutDiv.appendChild(stdoutContent);
    content.appendChild(stdoutDiv);
  }

  // Add stderr if present
  if (cmd.stderr.trim()) {
    const stderrDiv = document.createElement('div');
    
    const stderrLabel = document.createElement('div');
    stderrLabel.style.fontSize = '0.8em';
    stderrLabel.style.color = 'var(--vscode-errorForeground)';
    stderrLabel.style.marginBottom = '4px';
    stderrLabel.textContent = 'STDERR:';
    
    const stderrContent = document.createElement('pre');
    stderrContent.style.margin = '0';
    stderrContent.style.padding = '8px';
    stderrContent.style.backgroundColor = 'var(--vscode-inputValidation-errorBackground)';
    stderrContent.style.borderRadius = '3px';
    stderrContent.style.fontFamily = 'monospace';
    stderrContent.style.fontSize = '0.9em';
    stderrContent.style.whiteSpace = 'pre-wrap';
    stderrContent.style.wordBreak = 'break-word';
    stderrContent.style.color = 'var(--vscode-errorForeground)';
    stderrContent.textContent = cmd.stderr;

    stderrDiv.appendChild(stderrLabel);
    stderrDiv.appendChild(stderrContent);
    content.appendChild(stderrDiv);
  }

  // If no output at all, show a message
  if (!cmd.stdout.trim() && !cmd.stderr.trim()) {
    const noOutputDiv = document.createElement('div');
    noOutputDiv.style.color = 'var(--vscode-descriptionForeground)';
    noOutputDiv.style.fontStyle = 'italic';
    noOutputDiv.style.fontSize = '0.9em';
    noOutputDiv.textContent = 'No output';
    content.appendChild(noOutputDiv);
  }

  details.appendChild(summary);
  details.appendChild(content);

  return details;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
} 