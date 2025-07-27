// src/LanguageTranslationHandler.ts
// Handles automatic translation when language is changed via language selector

import * as vscode from 'vscode';
import { SCLTranslator } from './SCLTranslator';

export class LanguageTranslationHandler {
  private disposables: vscode.Disposable[] = [];
  private cellLanguageMap = new Map<string, string>(); // Track cell languages
  private pollTimer: NodeJS.Timeout | undefined;

  constructor() {
    this.setupLanguageChangeHandler();
  }

  private setupLanguageChangeHandler(): void {
    // Start polling for language changes every 500ms
    this.pollTimer = setInterval(() => {
      this.checkForLanguageChanges();
    }, 500);

    // Track when notebooks open
    const disposable1 = vscode.window.onDidChangeActiveNotebookEditor(async (editor) => {
      if (editor) {
        // Initialize language map for all cells
        for (const cell of editor.notebook.getCells()) {
          this.cellLanguageMap.set(cell.document.uri.toString(), cell.document.languageId);
        }
      }
    });

    this.disposables.push(disposable1);
  }

  private async checkForLanguageChanges(): Promise<void> {
    const activeEditor = vscode.window.activeNotebookEditor;
    if (!activeEditor) {
      return;
    }

    for (const cell of activeEditor.notebook.getCells()) {
      const cellUri = cell.document.uri.toString();
      const currentLanguage = cell.document.languageId;
      const previousLanguage = this.cellLanguageMap.get(cellUri);

      if (previousLanguage && previousLanguage !== currentLanguage) {
        // Language changed!
        await this.handleLanguageChange(cell, previousLanguage, currentLanguage);
      }

      // Update the map
      this.cellLanguageMap.set(cellUri, currentLanguage);
    }
  }

  private async handleLanguageChange(cell: vscode.NotebookCell, oldLanguage: string, newLanguage: string): Promise<void> {
    const content = cell.document.getText().trim();
    
    if (!content) {
      return; // Don't translate empty cells
    }

    // Check if we should translate
    let shouldTranslate = false;
    
    if (oldLanguage === 'scl' && newLanguage === 'lot' && LanguageTranslationHandler.isSCLCode(content)) {
      shouldTranslate = true;
    } else if (oldLanguage === 'lot' && newLanguage === 'scl' && LanguageTranslationHandler.isLOTCode(content)) {
      shouldTranslate = true;
    }

    if (shouldTranslate) {
      console.log(`Language changed from ${oldLanguage} to ${newLanguage}, translating...`);
      await LanguageTranslationHandler.handleLanguageSwitch(cell, newLanguage as 'lot' | 'scl');
    }
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
      // Just replace the content, the language is already set by the user clicking the selector
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        0, 0,
        cell.document.lineCount - 1,
        cell.document.lineAt(cell.document.lineCount - 1).text.length
      );
      edit.replace(cell.document.uri, fullRange, newContent);
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
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    this.disposables.forEach(d => d.dispose());
  }
}