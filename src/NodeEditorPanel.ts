// src/NodeEditorPanel.ts

import * as vscode from 'vscode';

export class NodeEditorPanel {
  public static currentPanel: NodeEditorPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _cellUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, cellUri: vscode.Uri) {
    const column = vscode.ViewColumn.Beside;

    if (NodeEditorPanel.currentPanel) {
      NodeEditorPanel.currentPanel._panel.reveal(column);
      NodeEditorPanel.currentPanel.update(cellUri);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'lotFluxEditor',
      'LOT Flux Editor',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    NodeEditorPanel.currentPanel = new NodeEditorPanel(panel, cellUri);
  }

  private constructor(panel: vscode.WebviewPanel, cellUri: vscode.Uri) {
    this._panel = panel;
    this._cellUri = cellUri;

    this._panel.webview.onDidReceiveMessage(
      async (msg) => {
        switch (msg.command) {
        case 'saveBlockCode':
          {

              const generated = generateLotDslFromBlocks(msg.blocklyXml);
              await this._updateCellDocument(generated);
            }
            break;
        }
      },
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.html = this._getHtmlForWebview();
    this.update(cellUri);
  }

  public dispose() {
    NodeEditorPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }

  public async update(cellUri: vscode.Uri) {
    this._cellUri = cellUri;
    // read cell text
    const doc = await vscode.workspace.openTextDocument(cellUri);
    const lotFluxCode = doc.getText();

    // If you store a blockly XML or something in the cell text,
    // parse that into a blockly workspace. For now, let's just pass it to the webview:
    this._panel.webview.postMessage({ command: 'loadBlockData', code: lotFluxCode });
  }

  private async _updateCellDocument(newText: string) {
    const doc = await vscode.workspace.openTextDocument(this._cellUri);
    const range = new vscode.Range(0, 0, doc.lineCount, 0);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(this._cellUri, range, newText);
    await vscode.workspace.applyEdit(edit);
    await doc.save();
    vscode.window.showInformationMessage('Saved updated LOT DSL from node editor');
  }

  private _getHtmlForWebview() {
    const nonce = getNonce();
    return /* html */ `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          background: #1e1e1e;
          color: #ccc;
          margin: 0; padding: 0;
        }
        #toolbar {
          background: #333; padding: 4px;
        }
        #blocklyArea {
          width: 100%; height: calc(100vh - 40px); position: relative;
        }
        #blocklyDiv {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
        }
      </style>
      <!-- Load Blockly from a CDN -->
      <script src="https://unpkg.com/blockly/blockly.min.js"></script>
    </head>
    <body>
      <div id="toolbar">
        <button id="saveBtn">Save DSL</button>
      </div>
      <div id="blocklyArea">
        <div id="blocklyDiv"></div>
      </div>

      <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        let workspace = null;

        window.addEventListener('message', event => {
          const msg = event.data;
          if (msg.command === 'loadBlockData') {
            // If we stored blockly XML or just raw code,
            // parse or do something. For now we do not parse
            console.log('Received code:', msg.code);
          }
        });

        function createWorkspace() {
          const blocklyDiv = document.getElementById('blocklyDiv');
          workspace = Blockly.inject(blocklyDiv, {
            toolbox: '<xml><block type="lot_if"></block></xml>'
          });

          // Example custom block
          Blockly.defineBlocksWithJsonArray([
            {
              "type": "lot_if",
              "message0": "IF %1 THEN %2 ELSE %3",
              "args0": [
                { "type": "field_input", "name": "COND", "text": "temperature > 30" },
                { "type": "input_statement", "name": "THEN" },
                { "type": "input_statement", "name": "ELSE" }
              ],
              "colour": 230,
              "tooltip": "Lot if statement",
              "helpUrl": ""
            }
          ]);
        }

        createWorkspace();

        document.getElementById('saveBtn').addEventListener('click', () => {
          // Convert workspace to XML
          const xml = Blockly.Xml.workspaceToDom(workspace);
          const xmlText = Blockly.Xml.domToText(xml);

          vscode.postMessage({ command: 'saveBlockCode', blocklyXml: xmlText });
        });

        // dynamic resizing
        function onResize() {
          const area = document.getElementById('blocklyArea');
          const div = document.getElementById('blocklyDiv');
          let x = 0;
          let y = 0;
          let element = area;
          do {
            x += element.offsetLeft;
            y += element.offsetTop;
            element = element.offsetParent;
          } while (element);
          div.style.left = x + 'px';
          div.style.top = y + 'px';
          div.style.width = area.offsetWidth + 'px';
          div.style.height = area.offsetHeight + 'px';
          Blockly.svgResize(workspace);
        }
        window.addEventListener('resize', onResize, false);
        onResize();
      </script>
    </body>
    </html>
    `;
  }
}

function generateLotDslFromBlocks(blocklyXml: string): string {
  // A simple approach: parse the XML, find the blocks, build a DSL string
  // Real code would be more thorough. For demonstration, let's do a static output:

  // e.g. read blocklyXml => generate
  // For now, we just do a dummy:
  return `DEFINE ACTION MyAction ON EVERY 15s DO
IF temperature>30 THEN
  PUBLISH TOPIC "Devices/Heater" "ON"
ELSE
  PUBLISH TOPIC "Devices/Heater" "OFF"
`;
}

// Helper for cryptographic nonce if needed
function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 16; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
