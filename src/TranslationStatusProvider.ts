// src/TranslationStatusProvider.ts
// Shows helpful translation shortcuts in notebook cells

import * as vscode from 'vscode';

export class TranslationStatusProvider {
  private disposables: vscode.Disposable[] = [];
  private decorationType: vscode.TextEditorDecorationType;

  constructor() {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: '',
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
        fontStyle: 'italic',
        margin: '0 0 0 2em'
      },
      isWholeLine: false
    });

    this.setupDecorationUpdater();
  }

  private setupDecorationUpdater(): void {
    // Update decorations when active editor changes
    const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor(() => {
      this.updateDecorations();
    });

    // Update decorations when text changes
    const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument((event) => {
      if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
        this.updateDecorations();
      }
    });

    this.disposables.push(onDidChangeActiveEditor, onDidChangeTextDocument);
  }

  private updateDecorations(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    // Only show in notebook cells
    if (editor.document.uri.scheme !== 'vscode-notebook-cell') {
      return;
    }

    const document = editor.document;
    const text = document.getText();
    const language = document.languageId;

    if (!text.trim() && (language === 'scl' || language === 'lot')) {
      // Show hint in empty cells
      const decorations: vscode.DecorationOptions[] = [];
      
      let hintText = '';
      if (language === 'scl') {
        hintText = 'Press Ctrl+Space for SCL completions • Ctrl+Shift+T to translate to LOT';
      } else if (language === 'lot') {
        hintText = 'Press Ctrl+Space for LOT completions • Ctrl+Shift+T to translate to SCL';
      }

      if (hintText) {
        const decoration: vscode.DecorationOptions = {
          range: new vscode.Range(0, 0, 0, 0),
          renderOptions: {
            after: {
              contentText: hintText,
              color: new vscode.ThemeColor('editorCodeLens.foreground'),
              fontStyle: 'italic'
            }
          }
        };
        decorations.push(decoration);
      }

      editor.setDecorations(this.decorationType, decorations);
    } else {
      // Clear decorations if cell has content
      editor.setDecorations(this.decorationType, []);
    }
  }

  public dispose(): void {
    this.decorationType.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}