// src/LanguageTranslationHandler.ts
// Handles automatic translation when language is changed via language selector

import * as vscode from 'vscode';
import { SCLTranslator } from './SCLTranslator';

export class LanguageTranslationHandler {
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.setupLanguageChangeHandler();
  }

  private setupLanguageChangeHandler(): void {
    // Listen for language changes in notebook cells
    const disposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
      // Check if this is a notebook document
      if (event.document.uri.scheme !== 'vscode-notebook-cell') {
        return;
      }

      // Get the notebook document
      const notebookDocument = vscode.workspace.notebookDocuments.find(nb => 
        nb.getCells().some(cell => cell.document === event.document)
      );

      if (!notebookDocument) {
        return;
      }

      // Find the cell that was changed
      const cell = notebookDocument.getCells().find(cell => cell.document === event.document);
      if (!cell) {
        return;
      }

      // Check if this was a language change (no content changes, just language metadata)
      if (event.contentChanges.length > 0) {
        return; // This was a content change, not a language change
      }

      // We need to detect language changes differently since onDidChangeTextDocument
      // doesn't fire for language changes. Let's use a different approach.
    });

    this.disposables.push(disposable);
  }

  // Alternative approach: Handle explicit language switching
  public static async handleLanguageSwitch(cell: vscode.NotebookCell, targetLanguage: 'lot' | 'scl'): Promise<void> {
    const currentContent = cell.document.getText().trim();
    
    if (!currentContent) {
      return; // Don't translate empty cells
    }

    let translatedContent: string;

    if (targetLanguage === 'lot' && cell.document.languageId === 'scl') {
      // SCL → LOT
      if (this.isSCLCode(currentContent)) {
        translatedContent = SCLTranslator.sclToLot(currentContent);
        await this.replaceCell(cell, translatedContent, 'lot');
      }
    } else if (targetLanguage === 'scl' && cell.document.languageId === 'lot') {
      // LOT → SCL
      if (this.isLOTCode(currentContent)) {
        translatedContent = SCLTranslator.lotToScl(currentContent);
        await this.replaceCell(cell, translatedContent, 'scl');
      }
    }
  }

  private static isSCLCode(content: string): boolean {
    const trimmed = content.trim().toUpperCase();
    return trimmed.startsWith('TYPE ') || 
           trimmed.startsWith('FUNCTION_BLOCK ') || 
           trimmed.startsWith('FUNCTION ') ||
           trimmed.startsWith('VAR');
  }

  private static isLOTCode(content: string): boolean {
    const trimmed = content.trim().toUpperCase();
    return trimmed.startsWith('DEFINE ');
  }

  private static async replaceCell(cell: vscode.NotebookCell, newContent: string, newLanguage: string): Promise<void> {
    try {
      const notebook = cell.notebook;
      const cellIndex = notebook.getCells().indexOf(cell);
      
      if (cellIndex === -1) {
        return;
      }

      // Create new cell data with translated content
      const newCellData = new vscode.NotebookCellData(
        vscode.NotebookCellKind.Code,
        newContent,
        newLanguage
      );

      // Replace the cell
      const edit = new vscode.WorkspaceEdit();
      const notebookEdit = new vscode.NotebookEdit(
        new vscode.NotebookRange(cellIndex, cellIndex + 1),
        [newCellData]
      );
      edit.set(notebook.uri, [notebookEdit]);
      
      await vscode.workspace.applyEdit(edit);

      // Show success message
      vscode.window.showInformationMessage(
        `✅ Translated ${newLanguage === 'lot' ? 'SCL to LOT' : 'LOT to SCL'}`
      );

    } catch (error) {
      vscode.window.showErrorMessage(`Translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Command to translate current cell
  public static async translateCurrentCell(): Promise<void> {
    const activeEditor = vscode.window.activeNotebookEditor;
    if (!activeEditor) {
      vscode.window.showWarningMessage('No active notebook editor found.');
      return;
    }

    const cell = activeEditor.notebook.cellAt(activeEditor.selection.start);
    if (!cell) {
      vscode.window.showWarningMessage('No active cell found.');
      return;
    }

    const currentLanguage = cell.document.languageId;
    const currentContent = cell.document.getText().trim();

    if (!currentContent) {
      vscode.window.showWarningMessage('Cell is empty.');
      return;
    }

    if (currentLanguage === 'scl' && this.isSCLCode(currentContent)) {
      await this.handleLanguageSwitch(cell, 'lot');
    } else if (currentLanguage === 'lot' && this.isLOTCode(currentContent)) {
      await this.handleLanguageSwitch(cell, 'scl');
    } else {
      vscode.window.showWarningMessage(
        `Cannot translate: Cell must contain ${currentLanguage === 'scl' ? 'SCL' : 'LOT'} code starting with ${currentLanguage === 'scl' ? 'TYPE, FUNCTION_BLOCK, or VAR' : 'DEFINE'}.`
      );
    }
  }

  public dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}