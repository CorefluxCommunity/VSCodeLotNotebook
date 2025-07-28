// src/LOTController.ts

import * as vscode from 'vscode';
import * as mqtt from 'mqtt';
import * as fs from 'fs'; // Import fs for reading certificate files
import { getOrPromptBrokerCredentials, MqttCredentials } from './credentials'; // Import interface
import { MqttTopicProvider } from './MqttTopicProvider';
import { EventEmitter } from 'events'; // Import EventEmitter
import { CorefluxEntitiesProvider } from './CorefluxEntitiesProvider'; // Import provider
import { exec } from 'child_process';
import * as os from 'os';

type CellStep = 'remove' | 'add' | 'subscribe' | 'live' | 'done' | 'failed';

interface CellState {
  step: CellStep;
  code: string;
  type: 'MODEL' | 'ACTION' | 'RULE' | 'ROUTE' | 'VISU';
  name: string;
  execution: vscode.NotebookCellExecution;
  treeState: { [key: string]: boolean }; // Tracks expanded/collapsed state of topics
  stopRequested: boolean;
  liveTree: any; // Nested object for storing topics/payloads
  subscribedTopics: string[];
}

// Type alias for valid entity types
type EntityTypeString = 'MODEL' | 'ACTION' | 'RULE' | 'ROUTE' | 'VISU';

export default class LOTController extends EventEmitter { // Extend EventEmitter
  readonly controllerId = 'lot-notebook-controller-id';
  readonly notebookType = 'lot-notebook';
  readonly label = 'LOT Notebook';
  readonly supportedLanguages = ['lot', 'scl', 'markdown', 'shellscript', 'bash', 'terminal'];

  private readonly _controller: vscode.NotebookController;
  private _executionOrder = 0;

  private _client?: mqtt.MqttClient;
  private _connected = false;
  private currentBrokerUrl: string | null = null; // Store broker URL for status

  private _cellStates = new Map<string, CellState>();
  private _entitiesProvider: CorefluxEntitiesProvider;

  private _context: vscode.ExtensionContext;
  private _topicProvider: MqttTopicProvider;
  private _payloadMap: Map<string, string>;

  constructor(
    context: vscode.ExtensionContext,
    topicProvider: MqttTopicProvider,
    payloadMap: Map<string, string>,
    entitiesProvider: CorefluxEntitiesProvider // Inject provider
  ) {
    super(); // Call EventEmitter constructor
    this._context = context;
    this._topicProvider = topicProvider;
    this._payloadMap = payloadMap;
    this._entitiesProvider = entitiesProvider; // Store provider reference

    this._controller = vscode.notebooks.createNotebookController(
      this.controllerId,
      this.notebookType,
      this.label
    );

    this._controller.supportedLanguages = this.supportedLanguages;
    this._controller.supportsExecutionOrder = true;

    // Attach the execute and interrupt handlers
    this._controller.executeHandler = this._execute.bind(this);
    this._controller.interruptHandler = this._handleInterrupt.bind(this);

    // Add dispose logic for status items
    context.subscriptions.push(this._controller);
  }

  public dispose(): void {
    this._controller.dispose();
    if (this._client) {
      this._client.end();
    }
  }

  public createHtmlOutput(msg: string, error = false): vscode.NotebookCellOutputItem {
    const html = `
        <div style="background-color:${error ? 'rgba(255, 0, 0, 0.10)' : 'rgba(26, 255, 0, 0.10)'}; color:white; padding:5px;">
          ${msg}
        </div>
      `;

    const htmlOutputItem = new vscode.NotebookCellOutputItem(
      Buffer.from(html, 'utf8'),
      'text/html'
    );

    return htmlOutputItem;
  }

  /**
   * Parse parsing error details from broker output
   * Example: "Parsing error: Expected one of STRING, but found PARSE ERROR IDENTIFIER (2,9)"
   */
  private _parseParsingError(payload: string): { hasError: boolean; line?: number; column?: number; message?: string; details?: string; suggestions?: string } {
    // Make regex multiline and more robust
    const parsingErrorMatch = payload.match(/Parsing error:\s*([\s\S]+?)(?:\s+with Errors:\s*([\s\S]+))?$/im);
    if (!parsingErrorMatch) {
      return { hasError: false };
    }

    const errorMessage = parsingErrorMatch[1]?.trim();
    const errorDetails = parsingErrorMatch[2]?.trim();
    
    // Try to extract line and column from the error message
    // Look for patterns like "(2,9)" or "line 2, column 9"
    const positionMatch = errorMessage?.match(/\((\d+),(\d+)\)/) || errorMessage?.match(/line\s+(\d+),\s*column\s+(\d+)/i);
    
    let line: number | undefined;
    let column: number | undefined;
    
    if (positionMatch) {
      line = parseInt(positionMatch[1], 10);
      column = parseInt(positionMatch[2], 10);
    }

    // Extract Suggestions section (multi-line)
    let suggestions: string | undefined = undefined;
    const suggestionsMatch = payload.match(/Suggestions:\s*([\s\S]*)/i);
    if (suggestionsMatch) {
      suggestions = suggestionsMatch[1].trim();
    }

    console.log('[LOTController] Parsing error detected:', { line, column, errorMessage, errorDetails, suggestions });
    return {
      hasError: true,
      line,
      column,
      message: errorMessage,
      details: errorDetails,
      suggestions
    };
  }

  /**
   * Create enhanced error output with parsing error details
   */
  private _createParsingErrorOutput(errorInfo: { line?: number; column?: number; message?: string; details?: string; suggestions?: string }, code: string): vscode.NotebookCellOutputItem {
    let errorHtml = `
      <div style="background-color:rgba(255, 0, 0, 0.10); color:white; padding:10px; border-left:4px solid #ff4444;">
        <h4 style="margin:0 0 10px 0; color:#ff6666;">🔍 Parsing Error Detected</h4>
    `;

    if (errorInfo.message) {
      errorHtml += `<p style="margin:5px 0;"><strong>Error:</strong> ${errorInfo.message}</p>`;
    }

    if (errorInfo.details) {
      errorHtml += `<p style="margin:5px 0;"><strong>Details:</strong> ${errorInfo.details}</p>`;
    }

    if (errorInfo.line !== undefined && errorInfo.column !== undefined) {
      errorHtml += `<p style="margin:5px 0;"><strong>Position:</strong> Line ${errorInfo.line}, Column ${errorInfo.column}</p>`;
      
      // Show the problematic line with full word highlighting
      const codeLines = code.split('\n');
      if (errorInfo.line <= codeLines.length) {
        const problematicLine = codeLines[errorInfo.line - 1];
        // Find the word at the error column
        let start = errorInfo.column - 1;
        let end = errorInfo.column - 1;
        // Expand left
        while (start > 0 && /[\w$]/.test(problematicLine[start - 1])) start--;
        // Expand right
        while (end < problematicLine.length && /[\w$]/.test(problematicLine[end])) end++;
        const beforeError = problematicLine.substring(0, start);
        const errorWord = problematicLine.substring(start, end) || problematicLine[errorInfo.column - 1] || '';
        const afterError = problematicLine.substring(end);
        errorHtml += `
          <div style="background-color:rgba(0,0,0,0.3); padding:10px; margin:10px 0; border-radius:4px; font-family:monospace;">
            <div style="color:#888;">Line ${errorInfo.line}:</div>
            <div style="color:#fff;">
              <span>${beforeError}</span>
              <span style="background-color:#ff4444; color:#000; padding:1px 2px; border-radius:2px; text-decoration:underline;">${errorWord}</span>
              <span>${afterError}</span>
            </div>
          </div>
        `;
      }
    }

    errorHtml += `
        <p style=\"margin:10px 0 0 0; font-size:0.9em; color:#ccc;\">\n`;
    if (errorInfo.suggestions) {
      // Make URLs clickable
      let suggestionsHtml = errorInfo.suggestions.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:#8cf; text-decoration:underline;">$1</a>');
      // Preserve line breaks
      errorHtml += `<strong>Suggestions:</strong><br><div style=\"color:#ffe; white-space:pre-line;\">${suggestionsHtml}</div>`;
    } else {
      errorHtml += `💡 Tip: Coreflux v.1.6.4 provides more detailed feedback, you are using a inferior version. Ensure the syntax is correct. `;
    }
    errorHtml += `</p>\n`;
    errorHtml += `</div>`;

    console.log('[LOTController] Showing parsing error output:', errorInfo);
    return new vscode.NotebookCellOutputItem(
      Buffer.from(errorHtml, 'utf8'),
      'text/html'
    );
  }

  /**
   * Handle interrupt requests (stops all running cells in the target notebook).
   */
  private async _handleInterrupt(notebook: vscode.NotebookDocument): Promise<void> {
    console.log(`Interrupt requested for notebook: ${notebook.uri.toString()}`);
    let interruptedCount = 0;

    for (const cell of notebook.getCells()) {
      const cellUri = cell.document.uri.toString();
      const cellState = this._cellStates.get(cellUri);

      // Check if there is an active execution state for this cell
      if (cellState && cellState.execution && (cellState.step !== 'done' && cellState.step !== 'failed')) {
        console.log(`Interrupting cell: ${cellUri} in step: ${cellState.step}`);
        try {
          // Unsubscribe if needed
          if (cellState.subscribedTopics.length > 0) {
            this._unsubscribeFromTopics(cellState.subscribedTopics);
          }
          // End the execution
          cellState.execution.end(false, Date.now()); // Mark as not success
          cellState.step = 'failed'; // Mark state as failed/interrupted
          // Optionally add output to the cell indicating interruption
          cellState.execution.replaceOutput([
            new vscode.NotebookCellOutput([
              this.createHtmlOutput('Execution Interrupted by User.', true)
            ])
          ]);
          // Remove from map? Delay to allow output to show?
          this._cellStates.delete(cellUri);
          interruptedCount++;
        } catch (e) {
          console.error(`Error during cell interruption for ${cellUri}:`, e);
          // Ensure state is marked as failed even if ending execution threw error
          if(cellState) cellState.step = 'failed';
          this._cellStates.delete(cellUri);
        }
      }
    }

    if (interruptedCount > 0) {
      console.log(`Interrupted ${interruptedCount} cell(s).`);
    } else {
      console.log('No active cells found to interrupt for this notebook.');
    }
  }

  /**
   * Execution entrypoint for notebook cells.
   * Passes execution object and cancellation token down.
   */
  private async _execute(
    cells: vscode.NotebookCell[],
    _notebook: vscode.NotebookDocument,
    _controller: vscode.NotebookController
  ): Promise<void> {
    for (const cell of cells) {
      const execution = this._controller.createNotebookCellExecution(cell);
      // Wrap _doExecution in a try-catch to ensure execution always ends
      try {
        await this._doExecution(cell, execution, execution.token);
      } catch (error) {
        console.error(`Error during cell execution for ${cell.document.uri}:`, error);
        if (!execution.token.isCancellationRequested) { // Don't overwrite cancellation end
          execution.end(false, Date.now());
        }
        // Clean up state if necessary
        this._cellStates.delete(cell.document.uri.toString());
      }
    }
  }

  /**
   * Actual cell execution logic.
   * Accepts execution and token.
   */
  private async _doExecution(cell: vscode.NotebookCell, execution: vscode.NotebookCellExecution, token: vscode.CancellationToken): Promise<void> {
    execution.executionOrder = ++this._executionOrder;
    execution.start(Date.now());

    const cellUri = cell.document.uri.toString();

    // Register cancellation handler *early*
    const cancellationListener = token.onCancellationRequested(() => {
      console.log(`Cancellation requested for cell: ${cellUri}`);
      // End the execution - VS Code handles UI
      execution.end(false, Date.now());
      // Clean up state associated with this specific execution
      const cellState = this._cellStates.get(cellUri);
      if (cellState) {
        // Unsubscribe if needed
        if (cellState.subscribedTopics.length > 0) {
          console.log(`Unsubscribing topics for cancelled cell: ${cellUri}`);
          this._unsubscribeFromTopics(cellState.subscribedTopics);
        }
        // Mark internal state as done/failed?
        // Setting to failed prevents further processing in _handleCommandOutput
        cellState.step = 'failed';
        // Remove from map later? Maybe in a finally block?
        // For now, leave it marked as failed.
      }
    });

    try { // Wrap main logic in try-finally to dispose listener
      const code = cell.document.getText();
      const lang = cell.document.languageId;
      if (lang === 'bash' || lang === 'shellscript' || lang === 'terminal') {
        // Split code into individual commands (lines)
        const commands = code.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0 && !line.startsWith('#'));

        if (commands.length === 0) {
          execution.replaceOutput([new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.text('No commands to execute', 'text/plain')
          ])]);
          execution.end(true, Date.now());
          return;
        }

        // Get the notebook's directory
        let notebookDir = undefined;
        try {
          const notebookUri = cell.notebook.uri;
          if (notebookUri && notebookUri.fsPath) {
            const path = require('path');
            notebookDir = path.dirname(notebookUri.fsPath);
          }
        } catch (e) { /* fallback to undefined */ }

        // Create or reuse a dedicated terminal
        const terminalName = 'LOT Terminal Cell';
        let terminal = vscode.window.terminals.find(t => t.name === terminalName);
        if (!terminal) {
          terminal = vscode.window.createTerminal({ name: terminalName });
        }
        terminal.show();

        // Always send 'cd <notebookDir>' as the first command
        if (notebookDir) {
          terminal.sendText(`cd "${notebookDir}"`, true);
        }

        // Send each command as a separate line
        for (const command of commands) {
          terminal.sendText(command, true);
        }

        // Show a message in the cell
        execution.replaceOutput([new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.text(
            `Commands sent to the integrated terminal (${terminalName}).\nCheck the terminal panel for output.`,
            'text/plain')
        ])]);
        execution.end(true, Date.now());
        return;
      }
      const parsed = this._parseEntityTypeAndName(code);
      if (!parsed) {
        execution.replaceOutput([new vscode.NotebookCellOutput([this.createHtmlOutput('Failed to parse entity type and name from code. Expected "DEFINE MODEL <Name>", "DEFINE ACTION <Name>", or "DEFINE ROUTE <Name>, or "DEFINE RULE <Name>".', true)])]);
        execution.end(false, Date.now());
        return;
      }
      const { type, name } = parsed;
      const stopRequested = code.toUpperCase().includes('STOP');

      const cellState: CellState = {
        step: 'remove',
        code,
        type,
        name,
        execution,
        stopRequested,
        liveTree: {},
        subscribedTopics: [],
        treeState: {}
      };
      this._cellStates.set(cellUri, cellState);

      if (token.isCancellationRequested) { return; }

      if (!this._connected) {
        const success = await this._connectMqtt();
        if (!success) {
          execution.replaceOutput([new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.stderr('Failed to connect to MQTT broker.')])]);
          execution.end(false, Date.now());
          this._cellStates.delete(cellUri);
          return;
        }
        if (token.isCancellationRequested) { return; }
      }

      if (token.isCancellationRequested) { return; }

      const removeCmd = this._buildRemoveCommand(type, name);
      await this._publishCommand(removeCmd, execution, `Removing ${type} ${name}...`, token);

      // Note: Further steps happen asynchronously in _handleCommandOutput

    } finally {
      // Dispose the cancellation listener when execution finishes or errors
      cancellationListener.dispose();
    }
  }

  /**
   * Initiates MQTT connection if not already connected or attempting to reconnect.
   * Useful for triggering the initial connection explicitly.
   */
  public async connectMqttIfNeeded(): Promise<void> {
    if (!this._connected && !this._client?.reconnecting) {
      console.log('connectMqttIfNeeded called, attempting connection...');
      this.emit('connecting');
      try {
        await this._connectMqtt();
      } catch (error) {
        console.error('connectMqttIfNeeded failed:', error);
      }
    } else if (this._connected) {
      console.log('connectMqttIfNeeded called, already connected.');
      this.emit('connected', this._client, this.currentBrokerUrl);
    } else {
      console.log('connectMqttIfNeeded called, connection already in progress (reconnecting).');
      this.emit('connecting');
    }
  }

  private async _connectMqtt(): Promise<boolean> {
    if (this._connected && this._client) {
      console.log('Already connected.');
      this.emit('connected', this._client, this.currentBrokerUrl);
      return true;
    }
    this._connected = false;

    let credentials: MqttCredentials;
    try {
      credentials = await getOrPromptBrokerCredentials(this._context);
      this.currentBrokerUrl = credentials.brokerUrl;
    } catch (err: any) {
      console.error('Failed to get MQTT credentials:', err);
      vscode.window.showErrorMessage(`Failed to get MQTT credentials: ${err.message}`);
      this.currentBrokerUrl = null;
      this.emit('disconnected');
      return false;
    }

    this.emit('connecting');

    const options: mqtt.IClientOptions = {
      username: credentials.username,
      password: credentials.password,
    };

    if (credentials.useTls) {
      options.protocol = 'mqtts';
      options.rejectUnauthorized = credentials.rejectUnauthorized;

      try {
        if (credentials.caPath) {
          options.ca = fs.readFileSync(credentials.caPath);
          console.log(`Loaded CA certificate from: ${credentials.caPath}`);
        }
        if (credentials.certPath) {
          options.cert = fs.readFileSync(credentials.certPath);
          console.log(`Loaded client certificate from: ${credentials.certPath}`);
        }
        if (credentials.keyPath) {
          options.key = fs.readFileSync(credentials.keyPath);
          console.log(`Loaded client key from: ${credentials.keyPath}`);
        }
      } catch (err: any) {
        console.error('Error reading certificate file:', err);
        vscode.window.showErrorMessage(`Error reading certificate file: ${err.message}`);
        return false;
      }
    }

    try {
      console.log(`Attempting MQTT connection to ${credentials.brokerUrl}...`);
      if (this._client) {
        this._client.removeAllListeners();
        this._client.end(true);
        this._client = undefined;
      }

      this._client = mqtt.connect(credentials.brokerUrl, options);

      this._client.on('connect', () => {
        if (!this._connected) {
          this._connected = true;
          console.log(`MQTT connected successfully to ${this.currentBrokerUrl} as user: ${credentials.username}`);


          this.emit('connected', this._client, this.currentBrokerUrl);
        }
      });

      this._client.on('message', (topic, payloadBuf) => {
        // console.log(`[MQTT Client] 'message' event fired. Topic: ${topic}`);
        this._handleMqttMessage(topic, payloadBuf.toString());
      });

      this._client.on('error', (err) => {
        console.error('[MQTT Client] Received "error" event:', err);
        if (this._connected) {
          this._connected = false;
          this.emit('disconnected');
        }
      });

      this._client.on('close', () => {
        console.log('[MQTT Client] Received "close" event.');
        if (this._connected) {
          this._connected = false;
          this.emit('disconnected');
        }
      });

      // ADDED HANDLERS for more diagnostics
      this._client.on('reconnect', () => {
        console.log('[MQTT Client] Received "reconnect" event.');
        this.emit('connecting'); // Signal reconnect attempt
      });

      this._client.on('offline', () => {
        console.log('[MQTT Client] Received "offline" event.');
        if (this._connected) {
          this._connected = false;
          this.emit('disconnected');
        }
      });

      return await new Promise<boolean>((resolve, reject) => {
        if (!this._client) return reject(new Error('Client not initialized'));

        const connectTimeout = setTimeout(() => {
          console.error(`MQTT connection to ${this.currentBrokerUrl} timed out.`);
          this._client?.end(true);
          this._connected = false;
          this.emit('disconnected');
          reject(new Error('Connection timed out'));
        }, 15000);

        this._client.once('connect', () => {
          clearTimeout(connectTimeout);
          resolve(true);
        });

        this._client.once('error', (err) => {
          clearTimeout(connectTimeout);
          reject(err);
        });

        this._client.once('close', () => {
          clearTimeout(connectTimeout);
          if (!this._connected) {
            console.log('Connection closed before establishing.');
            this.emit('disconnected');
            reject(new Error('Connection closed before establishing'));
          }
        });
      });

    } catch (err: any) {
      console.error('Error initiating MQTT connection:', err);
      vscode.window.showErrorMessage(`Error initiating MQTT connection: ${err.message}`);
      this._connected = false;
      this.currentBrokerUrl = null;
      this.emit('disconnected');
      return false;
    }
  }

  /**
   * Subscribe to a single topic.
   */
  private _subscribeToTopic(topic: string) {
    if (!this._client || !this._connected) {
      console.warn(`Cannot subscribe to ${topic}, client not connected.`);
      return;
    }
    this._client.subscribe(topic, { qos: 1 }, err => {
      if (err) {
        console.error(`Failed to subscribe to ${topic}:`, err);
      } else {
        console.log(`Subscribed to ${topic}`);
      }
    });
  }

  /**
   * Publish command, checking cancellation token.
   */
  private _publishCommand(command: string, execution: vscode.NotebookCellExecution, statusMsg: string, token: vscode.CancellationToken): Promise<void> {
    return new Promise((resolve, reject) => {
      if (token.isCancellationRequested) {
        console.log('Skipping publish command due to cancellation.');
        return resolve();
      }
      const cellUri = execution.cell.document.uri.toString();
      const cellState = this._cellStates.get(cellUri);
      // Double check if state is still valid before publishing next step
      if (!cellState || cellState.step === 'failed' || cellState.step === 'done') {
        console.log(`Skipping publish (no token) because cell state is terminal: ${cellUri}`);
        return resolve();
      }

      const existingItems = execution.cell.outputs?.flatMap(o => o.items) || [];
      execution.clearOutput();
      const newOutputItems = [...existingItems, this.createHtmlOutput(statusMsg)];
      execution.replaceOutput([new vscode.NotebookCellOutput(newOutputItems)]);

      const topic = '$SYS/Coreflux/Command';
      console.log(`Publishing command (checking token): ${command}`);

      this._client?.publish(topic, command, { qos: 1 }, err => {
        if (token.isCancellationRequested) {
          console.log('Command publish callback ignored due to cancellation.');
          return resolve();
        }
        if (err) {
          console.error(`Failed to publish command '${command}':`, err);
          try {
            execution.replaceOutput([
              new vscode.NotebookCellOutput([...existingItems, this.createHtmlOutput(`Failed to publish command: ${command}`, true)])
            ]);
            execution.end(false, Date.now());
            if (cellState) cellState.step = 'failed'; // Mark as failed on error
            this._cellStates.delete(cellUri);
          } catch (e) { console.error("Error ending execution in publish callback:", e); }
          reject(err);
        } else {
          console.log(`Published: ${command}`);
          resolve();
        }
      });
    });
  }

  private _unsubscribeFromTopics(topics: string[]) {
    if (!this._client || !this._connected) return;
    for (const topic of topics) {
      this._client.unsubscribe(topic, err => {
        if (err) {
          console.error(`Failed to unsubscribe from ${topic}:`, err);
        } else {
          console.log(`Unsubscribed from ${topic}`);
        }
      });
    }
  }

  /**
   * Handles command output.
   */
  private _handleCommandOutput(payload: string) {
    console.log(`>>> _handleCommandOutput ENTERED with payload: "${payload}"`);
    let processed = false;

    for (const [uri, cellState] of this._cellStates.entries()) {
      if (cellState.step === 'failed' || cellState.step === 'done' || cellState.step === 'live') {
        continue;
      }

      const { execution, type, name, code } = cellState;
      const lowerPayload = payload.toLowerCase();

      console.log(`[${uri}] Checking output against: Step=${cellState.step}, Name=${name}`); // Log cell info

      // Relevance Check
      const isSuccess = lowerPayload.includes('success');
      const isNotFound = lowerPayload.includes('not found') || lowerPayload.includes('does not exist');
      const mentionsName = payload.includes(name);
      let isRelevant = false;
      if (cellState.step === 'remove' && mentionsName && (isSuccess || isNotFound || lowerPayload.includes('error') || lowerPayload.includes('failed'))) {
        isRelevant = true;
      } else if (cellState.step === 'add' && (
        (mentionsName && (isSuccess || isNotFound || lowerPayload.includes('error') || lowerPayload.includes('failed')))
        || this._parseParsingError(payload).hasError // Always process parsing errors
      )) {
        isRelevant = true;
      }

      if (!isRelevant) {
        continue;
      }

      console.log(`[${uri}] Processing relevant output for step ${cellState.step}`);
      processed = true;

      const isActualError = (lowerPayload.includes('error') || lowerPayload.includes('failed'))
                          && !(cellState.step === 'remove' && isNotFound);

      console.log(`[${uri}] Calculated flags: isSuccess=${isSuccess}, isNotFound=${isNotFound}, isActualError=${isActualError}`); // Log flags

      if (cellState.step === 'remove') {
        console.log(`[${uri}] DEBUG: Remove Step Check. Payload: "${payload}"`); // Log exact payload
        console.log(`[${uri}] DEBUG: Remove Step Check. Expected Name: "${name}"`); // Log expected name
        console.log(`[${uri}] DEBUG: Remove Step Check. Calculated Flags: isSuccess=${isSuccess}, isNotFound=${isNotFound}, mentionsName=${mentionsName}, isRelevant=${isRelevant}, isActualError=${isActualError}`); // Log calculated flags

        if (isSuccess || isNotFound) {
          console.log(`[${uri}] DEBUG: Remove Step - Transitioning to add. Condition (isSuccess || isNotFound) met.`); // Log transition decision
          cellState.step = 'add';
          const addCmd = this._buildAddCommand(type, code);
          // Add log before calling publish
          console.log(`[${uri}] DEBUG: Calling _publishCommand_noToken with command: "${addCmd}"`);
          this._publishCommand_noToken(addCmd, execution,
            isSuccess
              ? `Removed ${type} ${name}. Now adding...`
              : `${type} ${name} not found. Adding...`
          );
        } else if (isActualError) {
          console.log(`[${uri}] DEBUG: Remove Step - Failing due to isActualError.`); // Log failure decision
          
          // Check for parsing errors specifically (though less likely in remove step)
          const parsingError = this._parseParsingError(payload);
          if (parsingError.hasError) {
            console.log(`[${uri}] Parsing error detected in remove step: ${parsingError.message}`);
            const errorOutput = this._createParsingErrorOutput(parsingError, code);
            const item = new vscode.NotebookCellOutput([errorOutput]);
            execution.replaceOutput([item]);
            execution.end(false, Date.now());
            cellState.step = 'failed';
          } else {
            // Regular error handling
            const item = new vscode.NotebookCellOutput([this.createHtmlOutput(`Failed to remove ${type} ${name}. Output: ${payload}`, true)]);
            execution.replaceOutput([item]);
            execution.end(false, Date.now());
            cellState.step = 'failed';
          }
        } else {
          console.log(`[${uri}] DEBUG: Remove Step - Failing due to unknown output.`); // Log unknown output failure
          const item = new vscode.NotebookCellOutput([this.createHtmlOutput(`Unknown remove output for ${type} ${name}: ${payload}`, true)]);
          execution.replaceOutput([item]);
          execution.end(false, Date.now());
          cellState.step = 'failed';
        }
      } else if (cellState.step === 'add') {
        console.log(`[${uri}] DEBUG: Add Step Check. Payload: "${payload}"`); // Log payload for add step too
        console.log(`[${uri}] DEBUG: Add Step Check. Calculated Flags: isSuccess=${isSuccess}, isNotFound=${isNotFound}, isActualError=${isActualError}`); // Log flags for add step
        console.log(`[${uri}] Add Step: Checking conditions...`);
        if (isSuccess) {
          console.log(`[${uri}] Add Step: Condition (isSuccess) met. Transitioning to subscribe.`);
          cellState.step = 'subscribe';
          execution.replaceOutput([new vscode.NotebookCellOutput([this.createHtmlOutput(`Added ${type} ${name} successfully. Subscribing...`)])]);

          const inputTopics = this._parseInputTopics(type, code);
          const outputTopics = this._parseOutputTopics(type, code);
          cellState.subscribedTopics = [...inputTopics, ...outputTopics];
          // Subscribe to topics
          for (const t of cellState.subscribedTopics) {
            this._subscribeToTopic(t);
          }

          // Determine final state (live or done)
          if (cellState.stopRequested) {
            execution.replaceOutput([
              new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(`Subscribed to:\n${cellState.subscribedTopics.join('\n')}`),vscode.NotebookCellOutputItem.text(`STOP requested. Ending now.`)])]);
            execution.end(true, Date.now());
            cellState.step = 'done'; // Mark as done
          } else {
            cellState.step = 'live';
            execution.replaceOutput([new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(`Subscribed to:\n${cellState.subscribedTopics.join('\n')}`),vscode.NotebookCellOutputItem.text(`**LIVE MODE** - new messages will appear below.`)])]);
          }
        } else if (isActualError || isNotFound) {
          console.log(`[${uri}] Add Step: Condition (isActualError || isNotFound) met. Failing.`);
          
          // Check for parsing errors specifically
          const parsingError = this._parseParsingError(payload);
          if (parsingError.hasError) {
            console.log(`[${uri}] Parsing error detected: ${parsingError.message}`);
            const errorOutput = this._createParsingErrorOutput(parsingError, code);
            const item = new vscode.NotebookCellOutput([errorOutput]);
            execution.replaceOutput([item]);
            execution.end(false, Date.now());
            cellState.step = 'failed';
          } else {
            // Regular error handling
            const item = new vscode.NotebookCellOutput([this.createHtmlOutput(`Failed to add ${type} ${name}. Output: ${payload}`, true)]);
            execution.replaceOutput([item]);
            execution.end(false, Date.now());
            cellState.step = 'failed';
          }
        } else {
          console.log(`[${uri}] Add Step: No condition met. Treating as unknown/failure.`);
          const item = new vscode.NotebookCellOutput([this.createHtmlOutput(`Unknown add output for ${type} ${name}: ${payload}`, true)]);
          execution.replaceOutput([item]);
          execution.end(false, Date.now());
          cellState.step = 'failed';
        }
      }
    }

    if (!processed) {
      console.log('Command output received, but no relevant active cell state found to process it.');
    }

    // Cleanup logic might need adjustment if we break early
    // It might be better to clean up at the end of _doExecution or on explicit cancellation/error
    for (const [uri, st] of this._cellStates.entries()) {
      if (st.step === 'failed' || st.step === 'done') { // Check for done too
        console.log(`Cleaning up terminal state (${st.step}) for cell: ${uri}`);
        this._cellStates.delete(uri);
      }
    }
  }

  /** Temporary publish without token check - Used by _handleCommandOutput */
  private _publishCommand_noToken(command: string, execution: vscode.NotebookCellExecution, statusMsg: string) {
    // Only proceed if the execution hasn't already been ended (e.g., by cancellation)
    // This requires checking internal state of execution if possible, or rely on try/catch
    try {
      const cellUri = execution.cell.document.uri.toString();
      const cellState = this._cellStates.get(cellUri);
      // Double check if state is still valid before publishing next step
      if (!cellState || cellState.step === 'failed' || cellState.step === 'done') {
        console.log(`Skipping publish (no token) because cell state is terminal: ${cellUri}`);
        return;
      }

      const existingItems = execution.cell.outputs?.flatMap(o => o.items) || [];
      execution.clearOutput();
      const newOutputItems = [...existingItems, this.createHtmlOutput(statusMsg)];
      execution.replaceOutput([new vscode.NotebookCellOutput(newOutputItems)]);

      const topic = '$SYS/Coreflux/Command';
      this._client?.publish(topic, command, { qos: 1 }, err => {
        if (err) {
          console.error(`Failed to publish command (no token) '${command}':`, err);
          const errorItem = new vscode.NotebookCellOutput([this.createHtmlOutput(`Failed to publish command: ${command}`, true)]);
          try {
            execution.replaceOutput([errorItem]);
            execution.end(false, Date.now());
            if (cellState) cellState.step = 'failed'; // Mark as failed on error
            this._cellStates.delete(cellUri);
          } catch (e) { console.error("Error ending execution in publish_noToken callback:", e); }
        } else {
          console.log(`Published (no token check): ${command}`);
        }
      });
    } catch (e) {
      console.error("Error during publish_noToken (likely execution ended):", e);
    }
  }

  /**
   * Insert or update expansions in cellState
   */
  private _getCellTreeState(key: string, path: string): boolean {
    const cellState = this._cellStates.get(key);
    return cellState?.treeState[path] ?? false;
  }
  private _setCellTreeState(key: string, path: string, isExpanded: boolean): void {
    const cellState = this._cellStates.get(key);
    if (cellState) {
      cellState.treeState[path] = isExpanded;
    }
  }

  /**
   * Instead of HTML, we produce a JSON output with MIME type "application/lot-tree+json".
   * The custom renderer handles expansions in memory (or merges expansions from the data).
   */
  private _renderTreeInCell(cellState: CellState) {
    const data = {
      root: cellState.liveTree,
      expansions: cellState.treeState
    };
    const item = vscode.NotebookCellOutputItem.json(data, 'application/lot-tree+json');
    const output = new vscode.NotebookCellOutput([item]);
    cellState.execution.replaceOutput([output]);
  }

  /**
   * Called whenever a new MQTT message arrives.
   */
  private _handleMqttMessage(topic: string, payload: string): void {
    //console.log(`[MQTT Receiver] Received raw message on topic "${topic}": "${payload}"`);

    if (topic === '$SYS/Coreflux/Command/Output') {
      console.log(`[MQTT Receiver] Topic matched $SYS/Coreflux/Command/Output. Calling handlers...`);
      this._handleSysCommandOutput(payload);
      this._handleCommandOutput(payload);
      return;
    }

    // Handle non-command-output messages (e.g., live data for cells)
    this._payloadMap.set(topic, payload);
    this._topicProvider.addTopic(topic);

    for (const [uri, st] of this._cellStates.entries()) {
      if (st.step === 'live') {
        if (this._topicMatchesAny(topic, st.subscribedTopics)) {
          this._insertTopic(st.liveTree, topic.split('/'), payload);
          this._renderTreeInCell(st);
        }
      }
    }
  }

  /**
   * Handles output from the $SYS/Coreflux/Command/Output topic,
   * specifically looking for successful removeAll command responses.
   */
  private _handleSysCommandOutput(payload: string): void {
    const lowerPayload = payload.toLowerCase();
    let categoryToClear: 'Models' | 'Actions' | 'Routes' | 'Rules' | null = null;

    // Define patterns for successful removal
    // Adjust these patterns based on the *exact* success messages from the broker
    const patterns = {
      Models: /removed all models successfully/i,
      Actions: /removed all actions successfully/i,
      Routes: /removed all routes successfully/i,
      Rules: /removed all rules successfully/i // Add Rules if applicable
    };

    if (patterns.Models.test(lowerPayload)) {
      categoryToClear = 'Models';
    } else if (patterns.Actions.test(lowerPayload)) {
      categoryToClear = 'Actions';
    } else if (patterns.Routes.test(lowerPayload)) {
      categoryToClear = 'Routes';
    } else if (patterns.Rules.test(lowerPayload)) {
      categoryToClear = 'Rules';
    }

    if (categoryToClear) {
      console.log(`Detected successful removal of all ${categoryToClear}. Clearing provider category.`);
      this._entitiesProvider.clearCategory(categoryToClear);
    }
    // Ignore other command outputs here
  }

  private _topicMatchesAny(topic: string, patterns: string[]): boolean {
    const splitLevels = (str: string) => str.split('/');

    for (const pattern of patterns) {
      const patternLevels = splitLevels(pattern);
      const topicLevels = splitLevels(topic);

      let isMatch = true;

      for (let i = 0; i < patternLevels.length; i++) {
        const patternLevel = patternLevels[i];

        if (patternLevel === '#') {
          break;
        } else if (patternLevel === '+') {
          if (topicLevels[i] === undefined) {
            isMatch = false;
            break;
          }
        } else {
          if (patternLevel !== topicLevels[i]) {
            isMatch = false;
            break;
          }
        }
      }

      if (isMatch && topicLevels.length !== patternLevels.length) {
        if (patternLevels[patternLevels.length - 1] !== '#') {
          isMatch = false;
        }
      }

      if (isMatch) {
        return true;
      }
    }
    return false;
  }

  private _insertTopic(tree: any, pathParts: string[], payload: string) {
    if (pathParts.length === 0) return;
    const [head, ...rest] = pathParts;
    if (!tree[head]) {
      tree[head] = {};
    }
    if (rest.length === 0) {
      tree[head]._value = payload;
    } else {
      this._insertTopic(tree[head], rest, payload);
    }
  }

  /**
   * Builds the remove command for a given entity type.
   */
  private _buildRemoveCommand(type: EntityTypeString, name: string): string {
    switch (type) {
    case 'MODEL': return `-removeModel ${name}`;
    case 'ACTION': return `-removeAction ${name}`;
    case 'RULE': return `-removeRule ${name}`;
    case 'ROUTE': return `-removeRoute ${name}`;
    case 'VISU': return `-removeVisu ${name}`;
    }
  }

  /**
   * Builds the add command from the cell's code.
   */
  private _buildAddCommand(type: EntityTypeString, code: string): string {
    switch (type) {
    case 'MODEL': return `-addModel ${code}`;
    case 'ACTION': return `-addAction ${code}`;
    case 'RULE': return `-addRule ${code}`;
    case 'ROUTE': return `-addRoute ${code}`;
    case 'VISU': return `-addVisu ${code}`;
    }
  }

  /**
   * Parse code for "DEFINE MODEL <name>" or "DEFINE ACTION <name>" or "DEFINE RULE <name>".
   * Returns the specific EntityTypeString union.
   */
  private _parseEntityTypeAndName(code: string): { type: EntityTypeString; name: string } | null {
    const re = /\bDEFINE\s+(MODEL|ACTION|RULE|ROUTE|VISU)\s+"?([A-Za-z0-9_\-\/]+)"?/i;
    const match = code.match(re);
    if (!match) return null;

    const entityTypeStr = match[1].toUpperCase();
    const entityName = match[2];

    if (['MODEL', 'ACTION', 'RULE', 'ROUTE', 'VISU'].includes(entityTypeStr)) {
      return { type: entityTypeStr as EntityTypeString, name: entityName };
    } else {
      console.warn(`Parsed unknown entity type: ${entityTypeStr}`);
      return null;
    }
  }

  private _parseInputTopics(type: 'MODEL' | 'ACTION' | 'RULE' | 'ROUTE' | 'VISU' , code: string): string[] {
    let topics: string[] = [];

    const withTopicRegex = /\bWITH\s+TOPIC\s+"([^"]+)"/gi;
    let match: RegExpExecArray | null;

    while ((match = withTopicRegex.exec(code)) !== null) {
      let t = match[1];
      if (!t.endsWith('#')) t += '/#';
      topics.push(t);
    }

    const onTopicRegex = /\bON\s+TOPIC\s+"([^"]+)"/gi;
    while ((match = onTopicRegex.exec(code)) !== null) {
      topics.push(match[1]);
    }

    const getTopicRegex = /\bGET\s+TOPIC\s+"([^"]+)"/gi;
    while ((match = getTopicRegex.exec(code)) !== null) {
      topics.push(match[1]);
    }

    return Array.from(new Set(topics));
  }

  private _parseOutputTopics(type: 'MODEL' | 'ACTION' | 'RULE' | 'ROUTE' | 'VISU', code: string): string[] {
    let topics: string[] = [];
    const publishRegex = /\bPUBLISH\s+TOPIC\s+"([^"]+)"/gi;
    let match: RegExpExecArray | null;
    while ((match = publishRegex.exec(code)) !== null) {
      topics.push(match[1]);
    }
    return Array.from(new Set(topics));
  }

  /**
   * Disconnects the current MQTT client, clears cell states, and reconnects.
   * Called when credentials change.
   */
  public async disconnectAndReconnect(): Promise<boolean> {
    console.log('Disconnecting MQTT due to credential change...');
    await this._disconnectMqtt();
    this._clearAllCellStates();
    console.log('Reconnecting MQTT with new credentials...');
    try {
      const success = await this._connectMqtt();
      if (!success) {
        vscode.window.showErrorMessage('Failed to reconnect MQTT with new credentials.');
      }
      return success;
    } catch (error) {
      console.error('Error during reconnect:', error);
      vscode.window.showErrorMessage(`Failed to reconnect MQTT: ${error}`);
      this.emit('disconnected');
      return false;
    }
  }

  /**
   * Disconnects the MQTT client if connected.
   */
  private async _disconnectMqtt(): Promise<void> {
    if (this._client) {
      console.log('Disconnecting MQTT client...');
      const client = this._client;
      this._client = undefined;
      this._connected = false;
      this.currentBrokerUrl = null;
      client.removeAllListeners();

      await new Promise<void>(resolve => {
        client.end(false, {}, () => {
          console.log('MQTT client.end() callback received.');
          resolve();
        });
        setTimeout(() => {
          console.warn('MQTT client.end() timeout, resolving disconnect anyway.');
          resolve();
        }, 2000);
      });
      this.emit('disconnected');
    } else {
      if (this._connected) {
        this._connected = false;
        this.currentBrokerUrl = null;
        this.emit('disconnected');
      }
    }
  }

  /**
   * Clears the state and stops execution for all active cells.
   */
  private _clearAllCellStates(): void {
    console.log(`Clearing states for ${this._cellStates.size} cells.`);
    for (const [uri, cellState] of this._cellStates.entries()) {
      if (cellState.execution && (cellState.step !== 'done' && cellState.step !== 'failed')) {
        try {
          console.log(`Ending execution for cell ${uri}`);
          cellState.execution.end(false, Date.now());
        } catch (e) {
          console.warn(`Error ending execution for cell ${uri}: ${e}`);
        }
      }
      if (cellState.subscribedTopics && cellState.subscribedTopics.length > 0) {
        console.log(`Unsubscribing topics for cell ${uri}: ${cellState.subscribedTopics.join(', ')}`);
        this._unsubscribeFromTopics(cellState.subscribedTopics);
      }
    }
    this._cellStates.clear();
    console.log('All cell states cleared.');
  }

  /**
   * Returns the current MQTT client instance, if connected.
   */
  public getMqttClient(): mqtt.MqttClient | undefined {
    return this._client;
  }

  /**
   * Publishes a command to the system command topic.
   * Checks for connection first.
   * @param command The command string (e.g., "-removeAllModels")
   * @returns True if published, false otherwise.
   */
  public publishSysCommand(command: string): boolean {
    if (!this._client || !this._connected) {
      vscode.window.showErrorMessage('MQTT client not connected. Cannot publish command.');
      return false;
    }
    const topic = '$SYS/Coreflux/Command';
    console.log(`Publishing to ${topic}: ${command}`);
    this._client.publish(topic, command, { qos: 1 }, (err) => {
      if (err) {
        console.error(`Failed to publish command '${command}':`, err);
        vscode.window.showErrorMessage(`Failed to publish command '${command}': ${err.message}`);
      }
    });
    return true;
  }

  /**
   * Publishes a command to remove a specific entity.
   * @param entityType Type of the entity (Model, Action, etc.)
   * @param entityName Name of the entity.
   * @returns True if the publish command was attempted, false if not connected.
   */
  public publishRemoveEntityCommand(entityType: 'Model' | 'Action' | 'Rule' | 'Route', entityName: string): boolean {
    // Construct the command payload, e.g., "-removeModel MyModel"
    const commandPayload = `-remove${entityType} ${entityName}`;
    return this.publishSysCommand(commandPayload);
  }

  /**
   * Publishes a command to add or update an entity with its code.
   * @param entityType Type of the entity (Model, Action, etc.)
   * @param entityName Name of the entity.
   * @param code The code content for the entity.
   * @returns True if the publish command was attempted, false if not connected.
   */
  public publishUpdateEntityCommand(entityType: 'Model' | 'Action' | 'Rule' | 'Route', entityName: string, code: string): boolean {
    // Construct the command payload, e.g., "-addModel MyModel {\n code... \n}"
    // Note: Coreflux might expect the code directly after the name, or wrapped somehow.
    // Assuming simple concatenation for now. Adjust if Coreflux requires specific wrapping (like {}).
    const commandPayload = `-add${entityType} ${entityName} ${code}`;
    // Consider potential payload size limits if code is very large
    return this.publishSysCommand(commandPayload);
  }

  public static openInUserTerminal(cell: vscode.NotebookCell) {
    const code = cell.document.getText();
    const terminal = vscode.window.createTerminal({ name: 'LOT Terminal Cell' });
    terminal.show();
    terminal.sendText(code, true);
  }

  // --- Public Connection Management Methods ---

  /**
   * Disconnect from the current MQTT broker
   */
  public async disconnect(): Promise<void> {
    await this._disconnectMqtt();
    this._clearAllCellStates();
  }

  /**
   * Connect to an MQTT broker with credentials
   */
  public async connectWithCredentials(brokerUrl: string, username?: string, password?: string): Promise<void> {
    // Disconnect first if already connected
    if (this._connected) {
      await this._disconnectMqtt();
    }

    // Update credentials
    await this._context.secrets.store('mqttBrokerUrl', brokerUrl);
    
    if (username) {
      await this._context.secrets.store('mqttUsername', username);
    } else {
      await this._context.secrets.delete('mqttUsername');
    }
    
    if (password) {
      await this._context.secrets.store('mqttPassword', password);
    } else {
      await this._context.secrets.delete('mqttPassword');
    }

    // Emit connecting state
    this.emit('connecting');

    // Connect with new credentials
    try {
      const success = await this._connectMqtt();
      if (!success) {
        vscode.window.showErrorMessage('Failed to connect to MQTT broker.');
      }
    } catch (error) {
      console.error('Connection error:', error);
      vscode.window.showErrorMessage(`Failed to connect: ${error}`);
      this.emit('disconnected');
    }
  }

  /**
   * Get current connection status
   */
  public isConnected(): boolean {
    return this._connected;
  }

  /**
   * Get current broker URL
   */
  public getCurrentBrokerUrl(): string | null {
    return this.currentBrokerUrl;
  }
}
