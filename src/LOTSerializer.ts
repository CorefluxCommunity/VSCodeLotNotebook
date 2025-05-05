import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from 'util';

interface RawNotebookCell {
  language: string;
  value: string;
  kind: vscode.NotebookCellKind;
}

// Keep track of watchers to avoid duplicates
const watchers = new Map<string, vscode.FileSystemWatcher>();

export default class LOTSerializer implements vscode.NotebookSerializer {
  async deserializeNotebook(
    content: Uint8Array,
    _token: vscode.CancellationToken
  ): Promise<vscode.NotebookData> {
    // *** Added Log ***
    console.log(`LOTSerializer: deserializeNotebook called.`); // Log when deserialization happens

    // Get the URI associated with this deserialization request
    // NOTE: The NotebookSerializer interface itself doesn't directly provide the URI.
    // This might be a limitation. Let's assume for now VS Code handles the reload.
    // We will add more sophisticated watching later if needed.

    let contents = '';
    try {
      contents = new TextDecoder().decode(content);
      // *** Added Log ***
      console.log(`LOTSerializer: Decoded content (first 500 chars): ${contents.substring(0, 500)}`);
    } catch (e) {
      console.error("LOTSerializer: Error decoding file content:", e);
      vscode.window.showErrorMessage(`Error decoding LOT Notebook file content: ${e}`);
      // Return an empty notebook or handle appropriately
      return new vscode.NotebookData([]);
    }

    let raw: RawNotebookCell[];
    try {
      // Handle empty or whitespace-only content
      if (contents.trim() === '') {
        raw = [];
      } else {
        raw = JSON.parse(contents) as RawNotebookCell[];
      }
      // *** Added Log ***
      console.log(`LOTSerializer: Parsed raw data:`, raw);
    } catch (e) {
      console.error("LOTSerializer: Error parsing notebook JSON content:", e);
      // Provide more context in the error message
      vscode.window.showErrorMessage(`Error parsing LOT Notebook JSON. Content: "${contents.substring(0, 100)}...". Error: ${e}`);
      raw = [];
    }

    const cells = raw.map(
      // Add validation for item structure if necessary
      item => new vscode.NotebookCellData(
        item.kind === vscode.NotebookCellKind.Markup ? vscode.NotebookCellKind.Markup : vscode.NotebookCellKind.Code, // Validate kind
        item.value || '', // Ensure value is a string
        item.language || 'plaintext' // Ensure language is a string, provide default
      )
    );
    // *** Added Log ***
    console.log(`LOTSerializer: Created ${cells.length} NotebookCellData objects.`);

    // *** Temporary Watcher Logic (for diagnostics) ***
    // We need the URI to create a watcher. This interface doesn't provide it directly.
    // This suggests the watcher might need to be managed where the notebook document is opened,
    // likely in your main extension file (e.g., extension.ts).
    // For now, we'll rely on VS Code's built-in watching and the log above.
    /*
    const notebookUri: vscode.Uri = ???; // How to get the URI here?

    if (notebookUri && !watchers.has(notebookUri.toString())) {
        console.log(`LOTSerializer: Creating watcher for ${notebookUri.fsPath}`);
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(notebookUri, '*'));
        watcher.onDidChange(uri => {
            console.log(`LOTSerializer: File changed on disk: ${uri.fsPath}`);
            // Here you would typically trigger a reload or update mechanism
            // For now, we just log to see if the change is detected.
        });
        watcher.onDidDelete(uri => {
             console.log(`LOTSerializer: File deleted on disk: ${uri.fsPath}`);
             watcher.dispose(); // Clean up watcher
             watchers.delete(notebookUri.toString());
        });
        watchers.set(notebookUri.toString(), watcher);

        // TODO: Need to dispose of watchers when the notebook is closed.
    }
    */

    return new vscode.NotebookData(cells);
  }

  async serializeNotebook(
    data: vscode.NotebookData,
    _token: vscode.CancellationToken
  ): Promise<Uint8Array> {
    // *** Added Log ***
    console.log(`LOTSerializer: serializeNotebook called.`);
    let raw: RawNotebookCell[] = [];

    for (const cell of data.cells) {
      // Ensure kind is valid, default to Code if not
      const kind = (cell.kind === vscode.NotebookCellKind.Markup || cell.kind === vscode.NotebookCellKind.Code)
        ? cell.kind
        : vscode.NotebookCellKind.Code;
      raw.push({
        kind: kind,
        language: cell.languageId,
        value: cell.value
      });
    }
    try {
      const jsonString = JSON.stringify(raw, null, 2); // Pretty print JSON
      return new TextEncoder().encode(jsonString);
    } catch (e) {
      console.error("LOTSerializer: Error serializing notebook:", e);
      vscode.window.showErrorMessage(`Error saving LOT Notebook: ${e}`);
      return new TextEncoder().encode("[]"); // Return empty array on error
    }
  }

  // TODO: Implement dispose method if needed to clean up watchers when extension deactivates
  // dispose(): void {
  //     watchers.forEach(watcher => watcher.dispose());
  //     watchers.clear();
  // }
}
