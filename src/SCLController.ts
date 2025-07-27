// src/SCLController.ts

import * as vscode from 'vscode';
import { SCLTranslator } from './SCLTranslator';
import LOTController from './LOTController';

export class SCLController {
    private readonly _controller: vscode.NotebookController;
    private _lotController: LOTController;
    private _executionOrder = 0;

    constructor(lotController: LOTController) {
        this._lotController = lotController;
        
        this._controller = vscode.notebooks.createNotebookController(
            'scl-notebook-controller-id',
            'lot-notebook', // Use same notebook type as LOT
            'SCL Notebook'
        );

        this._controller.supportedLanguages = ['scl', 'markdown'];
        this._controller.supportsExecutionOrder = true;
        this._controller.executeHandler = this._execute.bind(this);
        this._controller.interruptHandler = this._handleInterrupt.bind(this);
    }

    private async _execute(
        cells: vscode.NotebookCell[],
        notebook: vscode.NotebookDocument,
        controller: vscode.NotebookController
    ): Promise<void> {
        for (const cell of cells) {
            await this._executeCell(cell);
        }
    }

    private async _executeCell(cell: vscode.NotebookCell): Promise<void> {
        const execution = this._controller.createNotebookCellExecution(cell);
        execution.executionOrder = ++this._executionOrder;
        execution.start(Date.now());

        try {
            const sclCode = cell.document.getText();
            
            // Skip empty cells
            if (!sclCode.trim()) {
                execution.replaceOutput([]);
                execution.end(true, Date.now());
                return;
            }

            // Skip markdown cells
            if (cell.document.languageId === 'markdown') {
                execution.replaceOutput([]);
                execution.end(true, Date.now());
                return;
            }

            // Validate SCL syntax first
            const validation = SCLTranslator.validateScl(sclCode);
            if (!validation.isValid) {
                const errorOutput = this.createErrorOutput(
                    `SCL Syntax Errors:\n${validation.errors.join('\n')}`
                );
                execution.replaceOutput([errorOutput]);
                execution.end(false, Date.now());
                return;
            }

            // Translate SCL to LOT
            let lotCode: string;
            try {
                lotCode = SCLTranslator.sclToLot(sclCode);
            } catch (error: any) {
                const errorOutput = this.createErrorOutput(
                    `SCL Translation Error: ${error.message}`
                );
                execution.replaceOutput([errorOutput]);
                execution.end(false, Date.now());
                return;
            }

            // Show the generated LOT code
            const translationOutput = this.createSuccessOutput(
                `✅ SCL successfully translated to LOT:\n\n${lotCode}`
            );
            
            // Create a new LOT cell with the translated code
            await this.createLotCell(cell, lotCode);
            
            execution.replaceOutput([translationOutput]);
            execution.end(true, Date.now());

        } catch (error: any) {
            const errorOutput = this.createErrorOutput(`Execution Error: ${error.message}`);
            execution.replaceOutput([errorOutput]);
            execution.end(false, Date.now());
        }
    }

    private async createLotCell(originalCell: vscode.NotebookCell, lotCode: string): Promise<void> {
        const notebook = originalCell.notebook;
        const cellIndex = notebook.getCells().indexOf(originalCell);
        
        // Create new cell data
        const newCellData = new vscode.NotebookCellData(
            vscode.NotebookCellKind.Code,
            lotCode,
            'lot'
        );

        // Insert the new LOT cell after the SCL cell
        const edit = new vscode.WorkspaceEdit();
        const notebookEdit = new vscode.NotebookEdit(
            new vscode.NotebookRange(cellIndex + 1, cellIndex + 1),
            [newCellData]
        );
        edit.set(notebook.uri, [notebookEdit]);
        
        await vscode.workspace.applyEdit(edit);
    }

    private _handleInterrupt(notebook: vscode.NotebookDocument): void {
        // Handle interruption if needed
        console.log('SCL execution interrupted');
    }

    private createSuccessOutput(message: string): vscode.NotebookCellOutput {
        const html = `
            <div style="background-color: rgba(26, 255, 0, 0.10); color: white; padding: 10px; border-radius: 4px; font-family: monospace;">
                <pre style="margin: 0; white-space: pre-wrap;">${this.escapeHtml(message)}</pre>
            </div>
        `;
        
        return new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.text(html, 'text/html')
        ]);
    }

    private createErrorOutput(message: string): vscode.NotebookCellOutput {
        const html = `
            <div style="background-color: rgba(255, 0, 0, 0.10); color: #ff6b6b; padding: 10px; border-radius: 4px; font-family: monospace;">
                <pre style="margin: 0; white-space: pre-wrap;">${this.escapeHtml(message)}</pre>
            </div>
        `;
        
        return new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.text(html, 'text/html')
        ]);
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    public dispose(): void {
        this._controller.dispose();
    }
}

// Command functions for SCL operations
export class SCLCommands {
    
    /**
     * Convert SCL cell to LOT
     */
    public static async convertSclToLot(): Promise<void> {
        const activeEditor = vscode.window.activeNotebookEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active notebook editor found.');
            return;
        }

        const cell = activeEditor.selection.start;
        const cellData = activeEditor.notebook.cellAt(cell);
        
        if (cellData.document.languageId !== 'scl') {
            vscode.window.showErrorMessage('Selected cell is not an SCL cell.');
            return;
        }

        const sclCode = cellData.document.getText();
        
        try {
            // Validate SCL
            const validation = SCLTranslator.validateScl(sclCode);
            if (!validation.isValid) {
                vscode.window.showErrorMessage(`SCL validation errors: ${validation.errors.join(', ')}`);
                return;
            }

            // Translate to LOT
            const lotCode = SCLTranslator.sclToLot(sclCode);
            
            // Create new LOT cell
            const newCellData = new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                lotCode,
                'lot'
            );

            const edit = new vscode.WorkspaceEdit();
            const notebookEdit = new vscode.NotebookEdit(
                new vscode.NotebookRange(cell + 1, cell + 1),
                [newCellData]
            );
            edit.set(activeEditor.notebook.uri, [notebookEdit]);
            
            await vscode.workspace.applyEdit(edit);
            
            vscode.window.showInformationMessage('✅ SCL successfully converted to LOT!');
            
        } catch (error: any) {
            vscode.window.showErrorMessage(`Translation error: ${error.message}`);
        }
    }

    /**
     * Convert LOT cell to SCL
     */
    public static async convertLotToScl(): Promise<void> {
        const activeEditor = vscode.window.activeNotebookEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active notebook editor found.');
            return;
        }

        const cell = activeEditor.selection.start;
        const cellData = activeEditor.notebook.cellAt(cell);
        
        if (cellData.document.languageId !== 'lot') {
            vscode.window.showErrorMessage('Selected cell is not a LOT cell.');
            return;
        }

        const lotCode = cellData.document.getText();
        
        try {
            // Translate to SCL
            const sclCode = SCLTranslator.lotToScl(lotCode);
            
            // Create new SCL cell
            const newCellData = new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                sclCode,
                'scl'
            );

            const edit = new vscode.WorkspaceEdit();
            const notebookEdit = new vscode.NotebookEdit(
                new vscode.NotebookRange(cell + 1, cell + 1),
                [newCellData]
            );
            edit.set(activeEditor.notebook.uri, [notebookEdit]);
            
            await vscode.workspace.applyEdit(edit);
            
            vscode.window.showInformationMessage('✅ LOT successfully converted to SCL!');
            
        } catch (error: any) {
            vscode.window.showErrorMessage(`Translation error: ${error.message}`);
        }
    }

    /**
     * Format SCL code in current cell
     */
    public static async formatScl(): Promise<void> {
        const activeEditor = vscode.window.activeNotebookEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active notebook editor found.');
            return;
        }

        const cell = activeEditor.selection.start;
        const cellData = activeEditor.notebook.cellAt(cell);
        
        if (cellData.document.languageId !== 'scl') {
            vscode.window.showErrorMessage('Selected cell is not an SCL cell.');
            return;
        }

        const sclCode = cellData.document.getText();
        
        try {
            const formattedCode = SCLTranslator.formatScl(sclCode);
            
            const edit = new vscode.WorkspaceEdit();
            edit.replace(
                cellData.document.uri,
                new vscode.Range(0, 0, cellData.document.lineCount, 0),
                formattedCode
            );
            
            await vscode.workspace.applyEdit(edit);
            
            vscode.window.showInformationMessage('✅ SCL code formatted successfully!');
            
        } catch (error: any) {
            vscode.window.showErrorMessage(`Formatting error: ${error.message}`);
        }
    }

    /**
     * Validate SCL syntax in current cell
     */
    public static async validateScl(): Promise<void> {
        const activeEditor = vscode.window.activeNotebookEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active notebook editor found.');
            return;
        }

        const cell = activeEditor.selection.start;
        const cellData = activeEditor.notebook.cellAt(cell);
        
        if (cellData.document.languageId !== 'scl') {
            vscode.window.showErrorMessage('Selected cell is not an SCL cell.');
            return;
        }

        const sclCode = cellData.document.getText();
        const validation = SCLTranslator.validateScl(sclCode);
        
        if (validation.isValid) {
            vscode.window.showInformationMessage('✅ SCL syntax is valid!');
        } else {
            const errorMessage = `❌ SCL validation errors:\n${validation.errors.join('\n')}`;
            vscode.window.showErrorMessage(errorMessage);
        }
    }

    /**
     * Create a new SCL model template
     */
    public static async createSclModel(): Promise<void> {
        const modelName = await vscode.window.showInputBox({
            prompt: 'Enter model name',
            placeHolder: 'MyModel'
        });

        if (!modelName) return;

        const topic = await vscode.window.showInputBox({
            prompt: 'Enter topic pattern',
            placeHolder: 'sensor/+/data'
        });

        if (!topic) return;

        const template = `DEFINE MODEL ${modelName} WITH TOPIC "${topic}"
    ADD STRING "deviceId"
    ADD OBJECT "payload"
    ADD "timestamp" WITH TIMESTAMP "UTC"`;

        SCLCommands.insertSclTemplate(template);
    }

    /**
     * Create a new SCL action template
     */
    public static async createSclAction(): Promise<void> {
        const actionName = await vscode.window.showInputBox({
            prompt: 'Enter action name',
            placeHolder: 'MyAction'
        });

        if (!actionName) return;

        const triggerType = await vscode.window.showQuickPick(
            ['TOPIC', 'EVERY', 'TIMESTAMP'],
            { placeHolder: 'Select trigger type' }
        );

        if (!triggerType) return;

        let triggerValue = '';
        if (triggerType === 'TOPIC') {
            triggerValue = await vscode.window.showInputBox({
                prompt: 'Enter topic pattern',
                placeHolder: 'sensor/+/data'
            }) || '';
        } else if (triggerType === 'EVERY') {
            triggerValue = await vscode.window.showInputBox({
                prompt: 'Enter time interval (e.g., "30 SECONDS")',
                placeHolder: '30 SECONDS'
            }) || '';
        }

        const template = triggerType === 'TOPIC' 
            ? `DEFINE ACTION ${actionName}
ON TOPIC "${triggerValue}" DO
    SET "variable" WITH (GET JSON "field" IN PAYLOAD AS STRING)
    PUBLISH MODEL TargetModel TO ("output/topic") WITH
        field = {variable}`
            : `DEFINE ACTION ${actionName}
ON EVERY ${triggerValue} DO
    SET "variable" WITH "value"
    PUBLISH MODEL TargetModel TO ("output/topic") WITH
        field = {variable}`;

        SCLCommands.insertSclTemplate(template);
    }

    private static async insertSclTemplate(template: string): Promise<void> {
        const activeEditor = vscode.window.activeNotebookEditor;
        if (!activeEditor) {
            // Create new notebook if none is active
            const newNotebook = await vscode.workspace.openNotebookDocument('lot-notebook', new vscode.NotebookData([
                new vscode.NotebookCellData(vscode.NotebookCellKind.Code, template, 'scl')
            ]));
            await vscode.window.showNotebookDocument(newNotebook);
        } else {
            // Insert into current notebook
            const newCellData = new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                template,
                'scl'
            );

            const edit = new vscode.WorkspaceEdit();
            const cellCount = activeEditor.notebook.cellCount;
            const notebookEdit = new vscode.NotebookEdit(
                new vscode.NotebookRange(cellCount, cellCount),
                [newCellData]
            );
            edit.set(activeEditor.notebook.uri, [notebookEdit]);
            
            await vscode.workspace.applyEdit(edit);
        }
    }
}