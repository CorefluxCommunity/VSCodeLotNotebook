// src/LOTController.ts

import * as vscode from 'vscode';
import * as mqtt from 'mqtt';
import { getOrPromptBrokerCredentials } from './credentials';
import { MqttTopicProvider } from './MqttTopicProvider';

type CellStep = 'remove' | 'add' | 'subscribe' | 'live' | 'done' | 'failed';

interface CellState {
  step: CellStep;
  code: string;
  type: 'MODEL' | 'ACTION' | 'RULE' | 'ROUTE';
  name: string;
  execution: vscode.NotebookCellExecution;
  treeState: { [key: string]: boolean }; // Tracks expanded/collapsed state of topics
  stopRequested: boolean;
  liveTree: any; // Nested object for storing topics/payloads
  subscribedTopics: string[];
}

export default class LOTController {
  readonly controllerId = 'lot-notebook-controller-id';
  readonly notebookType = 'lot-notebook';
  readonly label = 'LOT Notebook';
  readonly supportedLanguages = ['lot'];

  private readonly _controller: vscode.NotebookController;
  private _executionOrder = 0;

  private _client?: mqtt.MqttClient;
  private _connected = false;

  private _cellStates = new Map<string, CellState>();

  private _context: vscode.ExtensionContext;
  private _topicProvider: MqttTopicProvider;
  private _payloadMap: Map<string, string>;

  constructor(
    context: vscode.ExtensionContext,
    topicProvider: MqttTopicProvider,
    payloadMap: Map<string, string>
  ) {
    this._context = context;
    this._topicProvider = topicProvider;
    this._payloadMap = payloadMap;

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
   * Handle interrupt requests for cells in 'live' state (i.e., unsubscribing from topics).
   */
  private async _handleInterrupt(notebook: vscode.NotebookDocument): Promise<void> {
    console.log(`Interrupt requested for notebook: ${notebook.uri.toString()}`);

    for (const [uri, cellState] of this._cellStates.entries()) {
      if (cellState.step !== 'live') continue;

      // Unsubscribe
      this._unsubscribeFromTopics(cellState.subscribedTopics);
      console.log(`Unsubscribed from topics for cell: ${uri}`);

      cellState.execution.replaceOutput([
        new vscode.NotebookCellOutput([
          this.createHtmlOutput('Execution interrupted. Unsubscribed from topics.')
        ])
      ]);
      cellState.execution.end(false, Date.now());
      cellState.step = 'done';
    }

    console.log('Interrupt handling complete.');
  }

  /**
   * Execution entrypoint for notebook cells.
   */
  private async _execute(
    cells: vscode.NotebookCell[],
    _notebook: vscode.NotebookDocument,
    _controller: vscode.NotebookController
  ): Promise<void> {
    for (const cell of cells) {
      await this._doExecution(cell);
    }
  }

  /**
   * Actual cell execution logic: parse code, remove old entity, add new one, subscribe to topics, etc.
   */
  private async _doExecution(cell: vscode.NotebookCell): Promise<void> {
    const execution = this._controller.createNotebookCellExecution(cell);
    execution.executionOrder = ++this._executionOrder;
    execution.start(Date.now());

    const code = cell.document.getText();

    // parse the code for "DEFINE MODEL <Name>", "DEFINE ACTION <Name>", or "DEFINE RULE <Name>"
    const parsed = this._parseEntityTypeAndName(code);
    if (!parsed) {
      execution.replaceOutput([
        new vscode.NotebookCellOutput([
          this.createHtmlOutput('Failed to parse entity type and name from code. Expected "DEFINE MODEL <Name>", "DEFINE ACTION <Name>", or "DEFINE RULE <Name".', true)
        ])
      ]);
      execution.end(false, Date.now());
      return;
    }
    const { type, name } = parsed;
    const stopRequested = code.toUpperCase().includes('STOP');

    // create cellState
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
    this._cellStates.set(cell.document.uri.toString(), cellState);

    // If not connected, connect to MQTT
    if (!this._connected) {
      const success = await this._connectMqtt();
      if (!success) {
        execution.replaceOutput([
          new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.stderr('Failed to connect to MQTT broker.')
          ])
        ]);
        execution.end(false, Date.now());
        this._cellStates.delete(cell.document.uri.toString());
        return;
      }
    }

    // Subscribe to command output
    this._subscribeToTopic('$SYS/Coreflux/Command/Output');

    // Begin the remove->add->subscribe->live steps
    const removeCmd = this._buildRemoveCommand(type, name);
    this._publishCommand(removeCmd, execution, `Removing ${type} ${name}...`);
  }

  private async _connectMqtt(): Promise<boolean> {
    if (this._connected) return true;
    try {
      const { brokerUrl, username, password } = await getOrPromptBrokerCredentials(this._context);

      this._client = mqtt.connect(brokerUrl, { username, password });
      this._client.on('message', (topic, payloadBuf) => {
        const payload = payloadBuf.toString();
        this._handleMqttMessage(topic, payload);
      });
      this._client.on('error', err => {
        console.error('MQTT connect error:', err);
      });

      return await new Promise<boolean>(resolve => {
        if (!this._client) {
          resolve(false);
          return;
        }

        this._client.on('connect', () => {
          this._connected = true;
          console.log(`MQTT connected to ${brokerUrl} as user: ${username}`);
          resolve(true);
        });
      });
    } catch (err) {
      console.error('Error connecting to MQTT:', err);
      return false;
    }
  }

  private _subscribeToTopic(topic: string) {
    if (!this._client || !this._connected) return;
    this._client.subscribe(topic, { qos: 1 }, err => {
      if (err) {
        console.error(`Failed to subscribe to ${topic}:`, err);
      } else {
        console.log(`Subscribed to ${topic}`);
      }
    });
  }

  private _publishCommand(command: string, execution: vscode.NotebookCellExecution, statusMsg: string) {
    const existingItems = execution.cell.outputs?.flatMap(o => o.items) || [];
    execution.clearOutput();
    const newOutputItems = [...existingItems, this.createHtmlOutput(statusMsg)];

    execution.replaceOutput([new vscode.NotebookCellOutput(newOutputItems)]);

    const topic = '$SYS/Coreflux/Command';
    this._client?.publish(topic, command, { qos: 1 }, err => {
      if (err) {
        execution.replaceOutput([
          new vscode.NotebookCellOutput([...existingItems, this.createHtmlOutput(`Failed to publish command: ${command}`, true)])
        ]);
        execution.end(false, Date.now());
      } else {
        console.log(`Published: ${command}`);
      }
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
   * Once we get output from the remove->add->subscribe steps, we decide how to progress.
   */
  private _handleCommandOutput(payload: string) {

    for (const [uri, cellState] of this._cellStates.entries()) {
      if (cellState.step === 'failed' || cellState.step === 'done' || cellState.step === 'live') {
        continue;
      }

      const exec = cellState.execution;
      const existingItems = exec.cell.outputs?.flatMap(o => o.items) || [];

      const isSuccess = payload.toLowerCase().includes('successfully');
      const isNotFound = payload.toLowerCase().includes('not found')
        || payload.toLowerCase().includes('does not exist');
      const isError = payload.toLowerCase().includes('error')
        || payload.toLowerCase().includes('failed');

      // If STOP requested, just bail out
      if (cellState.stopRequested) {
        this._unsubscribeFromTopics(cellState.subscribedTopics);
        exec.replaceOutput([
          new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.text('STOP requested. Unsubscribed from all topics.')
          ])
        ]);
        exec.end(true, Date.now());
        cellState.step = 'done';
      }

      if (cellState.step === 'remove') {
        if (isSuccess || isNotFound) {
          cellState.step = 'add';
          cellState.execution.clearOutput();

          const addCmd = this._buildAddCommand(cellState.type, cellState.code);
          this._publishCommand(addCmd, exec,
            isSuccess
              ? `Removed ${cellState.type} ${cellState.name} successfully. Now adding...`
              : `${cellState.type} ${cellState.name} not found, proceeding to add anyway...`
          );
        } else if (isError) {

          const item = new vscode.NotebookCellOutput([
            ...existingItems,
            this.createHtmlOutput(`Failed to remove ${cellState.type} ${cellState.name}. Output: ${payload}`, true)
          ])

          exec.replaceOutput([
            item
          ]);
          exec.end(false, Date.now());
          cellState.step = 'failed';
        }
      } else if (cellState.step === 'add') {
        if (isSuccess) {
          cellState.step = 'subscribe';
          exec.replaceOutput([
            new vscode.NotebookCellOutput([
              ...existingItems,
              this.createHtmlOutput(`Added ${cellState.type} ${cellState.name} successfully. Subscribing to topics...`)
            ])
          ]);

          const inputTopics = this._parseInputTopics(cellState.type, cellState.code);
          const outputTopics = this._parseOutputTopics(cellState.type, cellState.code);

          cellState.subscribedTopics = [...inputTopics, ...outputTopics];
          for (const t of cellState.subscribedTopics) {
            this._subscribeToTopic(t);
          }

          if (cellState.stopRequested) {
            exec.replaceOutput([
              new vscode.NotebookCellOutput([
                ...existingItems,
                vscode.NotebookCellOutputItem.text(`Subscribed to:\n${cellState.subscribedTopics.join('\n')}`),
                vscode.NotebookCellOutputItem.text(`STOP requested. Ending now.`)
              ])
            ]);
            exec.end(true, Date.now());
            cellState.step = 'done';
          } else {
            cellState.step = 'live';
            exec.replaceOutput([
              new vscode.NotebookCellOutput([
                ...existingItems,
                vscode.NotebookCellOutputItem.text(`Subscribed to:\n${cellState.subscribedTopics.join('\n')}`),
                vscode.NotebookCellOutputItem.text(`**LIVE MODE** - new messages for these topics appear below.`)
              ])
            ]);
          }

        } else if (isNotFound) {

          const item = new vscode.NotebookCellOutput([
            ...existingItems,
            this.createHtmlOutput(`Failed to add ${cellState.type} ${cellState.name}. Output: ${payload}`, true)
          ])

          exec.replaceOutput([
            item
          ]);
          exec.end(true, Date.now());
          cellState.step = 'failed';

        } else if (isError) {
          const item = new vscode.NotebookCellOutput([
            ...existingItems,
            this.createHtmlOutput(`Failed to add ${cellState.type} ${cellState.name}. 
              Output: ${payload}`, true)
          ])

          exec.replaceOutput([
            item
          ]);
          exec.end(false, Date.now());
          cellState.step = 'failed';
        }
      }
    }

    // Cleanup: remove states that are done or failed
    for (const [uri, st] of this._cellStates.entries()) {
      if (st.step === 'done' || st.step === 'failed') {
        this._cellStates.delete(uri);
      }
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
   * If a cell is in 'live' mode and the topic matches subscribed patterns,
   * we insert that topic/payload into cellState.liveTree, then re-emit the JSON tree.
   */
  private _handleMqttMessage(topic: string, payload: string): void {
    if (topic === '$SYS/Coreflux/Command/Output') {
      this._handleCommandOutput(payload);
      return;
    }

    // store topic & payload
    this._payloadMap.set(topic, payload);
    this._topicProvider.addTopic(topic);

    console.log(`Received MQTT message on topic "${topic}": ${payload}`);

    // Now see if any cell wants it
    for (const [uri, st] of this._cellStates.entries()) {
      if (st.step === 'live') {
        if (this._topicMatchesAny(topic, st.subscribedTopics)) {
          this._insertTopic(st.liveTree, topic.split('/'), payload);
          // Instead of _renderHtmlTree, we produce JSON for our custom renderer:
          this._renderTreeInCell(st);
        }
      }
    }
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
          // multi-level wildcard => everything from here is matched
          break;
        } else if (patternLevel === '+') {
          // single-level wildcard => match exactly one level
          if (topicLevels[i] === undefined) {
            isMatch = false;
            break;
          }
        } else {
          // exact match required
          if (patternLevel !== topicLevels[i]) {
            isMatch = false;
            break;
          }
        }
      }

      // If pattern is shorter or longer than actual levels, handle that
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
      tree[head]._value = payload; // store payload at final level
    } else {
      this._insertTopic(tree[head], rest, payload);
    }
  }

  /**
   * Builds the remove command for a given entity type.
   */
  private _buildRemoveCommand(type: 'MODEL' | 'ACTION' | 'RULE' | 'ROUTE', name: string): string {
    switch (type) {
      case 'MODEL': return `-removeModel ${name}`;
      case 'ACTION': return `-removeAction ${name}`;
      case 'RULE': return `-removeRule ${name}`;
      case 'ROUTE': return `-removeRoute ${name}`;
    }
  }

  /**
   * Builds the add command from the cell's code.
   */
  private _buildAddCommand(type: 'MODEL' | 'ACTION' | 'RULE' | 'ROUTE', code: string): string {
    switch (type) {
      case 'MODEL': return `-addModel ${code}`;
      case 'ACTION': return `-addAction ${code}`;
      case 'RULE': return `-addRule ${code}`;
      case 'ROUTE': return `-addRoute ${code}`;
    }
  }

  /**
   * Parse code for "DEFINE MODEL <name>" or "DEFINE ACTION <name>" or "DEFINE RULE <name>".
   */
  private _parseEntityTypeAndName(code: string): { type: 'MODEL' | 'ACTION' | 'RULE' | 'ROUTE'; name: string } | null {
    const re = /\bDEFINE\s+(MODEL|ACTION|RULE|ROUTE)\s+"?([A-Za-z0-9_]+)"?/i;
    const match = code.match(re);
    if (!match) return null;
    const entityType = match[1].toUpperCase() as 'MODEL' | 'ACTION' | 'RULE' | 'ROUTE';
    const entityName = match[2];
    return { type: entityType, name: entityName };
  }

  private _parseInputTopics(type: 'MODEL' | 'ACTION' | 'RULE' | 'ROUTE', code: string): string[] {
    let topics: string[] = [];

    const withTopicRegex = /\bWITH\s+TOPIC\s+"([^"]+)"/gi;
    let match: RegExpExecArray | null;

    while ((match = withTopicRegex.exec(code)) !== null) {
      let t = match[1];
      if (!t.endsWith('#')) t += '/#'; // add wildcard for sub-levels
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

  private _parseOutputTopics(type: 'MODEL' | 'ACTION' | 'RULE' | 'ROUTE', code: string): string[] {
    let topics: string[] = [];
    const publishRegex = /\bPUBLISH\s+TOPIC\s+"([^"]+)"/gi;
    let match: RegExpExecArray | null;
    while ((match = publishRegex.exec(code)) !== null) {
      topics.push(match[1]);
    }
    return Array.from(new Set(topics));
  }
}
