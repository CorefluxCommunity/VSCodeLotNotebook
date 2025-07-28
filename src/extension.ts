// src/extension.ts
import * as vscode from 'vscode';
import LOTSerializer from './LOTSerializer';
import LOTController from './LOTController';
import { MqttTopicProvider } from './MqttTopicProvider';
import { changeBrokerCredentials } from './credentials';
import { CorefluxEntitiesProvider, EntityItem } from './CorefluxEntitiesProvider';
import { LOTCellStatusProvider } from './LOTCellStatusProvider';
import * as mqtt from 'mqtt';
import * as path from 'path'; // Needed for webview resource paths
import * as fs from 'fs'; // Needed for reading HTML file
import { LOTCompletionProvider } from './LOTCompletionProvider';
import { SCLController, SCLCommands } from './SCLController';
import { SCLCompletionProvider } from './SCLCompletionProvider';
import { LanguageTranslationHandler } from './LanguageTranslationHandler';
import { TranslationStatusProvider } from './TranslationStatusProvider';
import { TelemetryService } from './TelemetryService';
import { OnboardingService } from './OnboardingService';
import { OnboardingCommands } from './OnboardingCommands';
import { BrokerConnectionManager } from './BrokerConnectionManager';

const payloadMap = new Map<string, string>();
let corefluxEntitiesProvider: CorefluxEntitiesProvider;
let lotCellStatusProvider: LOTCellStatusProvider;
let connectionStatusBarItem: vscode.StatusBarItem;
let controller: LOTController;
let sclController: SCLController;
let anselmoPanel: vscode.WebviewPanel | undefined = undefined;
let anselmoSessionId: string | undefined = undefined;
let associatedNotebookUri: vscode.Uri | undefined = undefined;

export async function activate(context: vscode.ExtensionContext) {
  console.log('---> LOT Notebook Extension ACTIVATE function started! <---');
  console.log('LOT Notebook extension is now active!');

  // --- Status Bar Item ---
  connectionStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  connectionStatusBarItem.command = 'coreflux.handleBrokerStatusClick';
  context.subscriptions.push(connectionStatusBarItem);
  updateStatusBar('disconnected'); // Initial state

  // --- Telemetry & Onboarding Services ---
  const telemetryService = TelemetryService.getInstance(context);
  const onboardingService = OnboardingService.getInstance(context, telemetryService);
  const onboardingCommands = new OnboardingCommands(onboardingService, telemetryService);

  // Check for first run and show walkthrough
  await onboardingService.checkFirstRun();

  // Emit startup telemetry event
  await telemetryService.emitStartupEvent();

  // --- Tree Providers ---
  const topicProvider = new MqttTopicProvider(context, payloadMap);
  corefluxEntitiesProvider = new CorefluxEntitiesProvider(context);
  vscode.window.registerTreeDataProvider('corefluxEntitiesView', corefluxEntitiesProvider);

  // --- Cell Status Provider ---
  lotCellStatusProvider = new LOTCellStatusProvider(corefluxEntitiesProvider);
  context.subscriptions.push(
    vscode.notebooks.registerNotebookCellStatusBarItemProvider(
      'lot-notebook',
      lotCellStatusProvider
    )
  );
  context.subscriptions.push(lotCellStatusProvider);

  // --- Coreflux Entities Commands ---
  context.subscriptions.push(
    vscode.commands.registerCommand('corefluxEntities.refresh', () => {
      corefluxEntitiesProvider?.refresh();
      lotCellStatusProvider?.refreshAll();
      vscode.window.showInformationMessage('Coreflux Entities refreshed.');
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('corefluxEntities.copyCode', (item: EntityItem) => {
      if (item?.payload) {
        vscode.env.clipboard.writeText(item.payload);
        vscode.window.showInformationMessage(`${item.entityType} '${item.label}' code copied to clipboard.`);
      } else {
        vscode.window.showWarningMessage(`No code available to copy for this item.`);
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('corefluxEntities.viewDescription', (description: string | EntityItem) => {
      const descText = typeof description === 'string' ? description : description?.payload;
      if (descText) {
        vscode.window.showInformationMessage(`Description: ${descText}`, { modal: true });
      } else {
        vscode.window.showWarningMessage('No description available for this item.');
      }
    })
  );

  // --- MQTT Handling Setup Function ---
  const setupEntityProviderMqttHandlers = (client: mqtt.MqttClient | undefined) => {
    if (!client || !corefluxEntitiesProvider) {
      console.log('MQTT client or CorefluxEntitiesProvider not available for handler setup.');
      return;
    }

    console.log('Setting up MQTT handlers for CorefluxEntitiesProvider...');

    // Subscribe to entity topics
    const topics = [
      '$SYS/Coreflux/Models/#',
      '$SYS/Coreflux/Actions/#',
      '$SYS/Coreflux/Rules/#',
      '$SYS/Coreflux/Routes/#',
      '$SYS/Coreflux/Command/Output'
    ];
       
    const subscribeToEntityTopics = () => {
      client.subscribe(topics, { qos: 0 }, (err) => {
        if (err) {
          console.error('Failed to subscribe to Coreflux entity topics:', err);
        } else {
          console.log('Subscribed to Coreflux entity topics.');
          corefluxEntitiesProvider.refresh();
        }
      });
    };

    client.on('connect', () => {
      console.log('MQTT connected (entity handler). Subscribing to entity topics...');
      subscribeToEntityTopics();
    });

    client.on('message', (topic, payloadBuf) => {
      if (topic.startsWith('$SYS/Coreflux/')) {
        const payload = payloadBuf.toString();
        const parts = topic.split('/');
        if (parts.length >= 4 && ['Models', 'Actions', 'Rules', 'Routes'].includes(parts[2])) {
          corefluxEntitiesProvider.processMqttMessage(topic, payload);
        } 
      }    
    });

    client.on('close', () => {
      console.log('MQTT connection closed (entity handler). Clearing entities.');
      // Status bar is updated by the controller's disconnected event listener
      // corefluxEntitiesProvider.clearEntities(); // Clearing is handled by disconnected listener too
    });
        
    client.on('error', (err) => {
      console.error('MQTT error (entity handler). Clearing entities.', err);
      // Status bar is updated by the controller's disconnected event listener
      // corefluxEntitiesProvider.clearEntities(); // Clearing is handled by disconnected listener too
    });

    if (client.connected) {
      console.log('MQTT already connected (entity handler setup). Subscribing to entity topics...');
      subscribeToEntityTopics();
    }
  };
    
  const createNotebookCommand = vscode.commands.registerCommand('lot-notebook.create', async () => {
    const uri = vscode.Uri.parse('untitled:' + 'notebook.lotnb');
    await vscode.commands.executeCommand('vscode.openWith', uri, 'lot-notebook');
  });
  context.subscriptions.push(createNotebookCommand);

  // Legacy credentials command - now handled by BrokerConnectionManager
  const changeCredsCommand = vscode.commands.registerCommand(
    'lot-notebook.changeCredentials',
    () => brokerConnectionManager.showConnectionDialog()
  );
  
  context.subscriptions.push(changeCredsCommand);

  // --- Serializer & Controller ---
  context.subscriptions.push(
    vscode.workspace.registerNotebookSerializer('lot-notebook', new LOTSerializer())
  );

  controller = new LOTController(context, topicProvider, payloadMap, corefluxEntitiesProvider);
  context.subscriptions.push(controller);

  // --- Broker Connection Manager ---
  const brokerConnectionManager = BrokerConnectionManager.getInstance(controller);

  // --- SCL Controller ---
  sclController = new SCLController(controller);
  context.subscriptions.push(sclController);

  // --- Controller Event Listeners ---
  controller.on('connecting', () => {
    console.log('Extension received connecting event.');
    updateStatusBar('connecting');
  });

  controller.on('connected', async (client: mqtt.MqttClient, brokerUrl: string) => {
    console.log(`Extension received connected event for ${brokerUrl}`);
    setupEntityProviderMqttHandlers(client);
    updateStatusBar('connected', brokerUrl);
    lotCellStatusProvider?.refreshAll();
    
    // Emit telemetry for successful broker connection
    const tlsUsed = brokerUrl.startsWith('mqtts://') || brokerUrl.startsWith('wss://');
    const authenticationUsed = false; // TODO: Detect if authentication was used
    await telemetryService.emitBrokerConnectedEvent(brokerUrl, tlsUsed, authenticationUsed);
    
    // Complete onboarding step
    await onboardingService.completeStep('connect-broker');
  });

  controller.on('disconnected', () => {
    console.log('Extension received disconnected event.');
    updateStatusBar('disconnected');
    lotCellStatusProvider?.refreshAll();
  });

  // Attempt initial connection explicitly after setup
  setTimeout(() => {
    console.log('Attempting initial MQTT connection...');
    controller.connectMqttIfNeeded();
  }, 500);

  // --- Workspace Listeners for Cell Status Updates ---
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
    const notebook = vscode.workspace.notebookDocuments.find(notebook => 
      notebook.getCells().some(cell => cell.document === event.document)
    );
    if (notebook?.notebookType === 'lot-notebook') {
      const changedCell = notebook.getCells().find(cell => cell.document === event.document);
      if (changedCell) {
        lotCellStatusProvider?.refreshAll();
      }
    }
  }));
  context.subscriptions.push(vscode.workspace.onDidOpenNotebookDocument(() => lotCellStatusProvider?.refreshAll()));
  context.subscriptions.push(vscode.workspace.onDidCloseNotebookDocument(() => lotCellStatusProvider?.refreshAll()));
  context.subscriptions.push(vscode.workspace.onDidChangeNotebookDocument(e => {
    if (e.notebook.notebookType === 'lot-notebook') {
      lotCellStatusProvider?.refreshAll();
    }
  }));

  // ---> UPDATED: Workspace Listeners for Notebook Parsing <---
  const parseNotebook = (notebookDoc: vscode.NotebookDocument | undefined) => {
    // Check if it's a LOT notebook document
    if (notebookDoc && notebookDoc.notebookType === 'lot-notebook') {
      corefluxEntitiesProvider?.parseNotebookDocument(notebookDoc);
      corefluxEntitiesProvider?.refresh();
    }
  };

  // Helper to find the notebook document associated with a text document (usually a cell)
  const findNotebookForTextDocument = (textDoc: vscode.TextDocument): vscode.NotebookDocument | undefined => {
    if (textDoc.uri.scheme === 'vscode-notebook-cell') {
      return vscode.workspace.notebookDocuments.find(notebook =>
        notebook.getCells().some(cell => cell.document.uri.toString() === textDoc.uri.toString())
      );
    } else if (textDoc.fileName.endsWith('.lotnb')) {
      // If the text document itself IS the notebook file (e.g., opened as text)
      // We might need to find the corresponding NotebookDocument if it's already open as a notebook
      return vscode.workspace.notebookDocuments.find(notebook => notebook.uri.toString() === textDoc.uri.toString());
      // Note: If it's only open as text, we can't easily parse it as a notebook here.
      // Parsing should primarily happen when it's treated as a notebook.
    }
    return undefined;
  };

  // 1. Parse all open/existing .lotnb notebooks on activation
  vscode.workspace.notebookDocuments.forEach(notebookDoc => {
    parseNotebook(notebookDoc); // Parse already open notebooks
  });
  
  vscode.workspace.findFiles('**/*.lotnb').then(uris => {
    uris.forEach(uri => {
      vscode.workspace.openNotebookDocument(uri).then(doc => {
        parseNotebook(doc); // Requires opening, maybe defer?
      });
    });
  });
  

  // 2. Parse when a notebook document is opened
  context.subscriptions.push(vscode.workspace.onDidOpenNotebookDocument(notebookDoc => {
    console.log(`Notebook opened: ${notebookDoc.uri.fsPath}`);
    parseNotebook(notebookDoc);
  }));

  // 3. Parse when a notebook document is saved
  // Note: onDidSaveNotebookDocument exists and is better than onDidSaveTextDocument for this
  context.subscriptions.push(vscode.workspace.onDidSaveNotebookDocument(notebookDoc => {
    console.log(`Notebook saved: ${notebookDoc.uri.fsPath}`);
    parseNotebook(notebookDoc);
  }));

  // We might still need onDidSaveTextDocument if users edit the .lotnb file as raw text
  // but parsing a TextDocument as a NotebookDocument is tricky. Let's stick to notebook events.

  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
    const notebook = findNotebookForTextDocument(document);
    if(notebook) {
      console.log(`Notebook (via cell save): ${notebook.uri.fsPath}`);
      parseNotebook(notebook);
    }
  }));
  
  // ---> END UPDATED <---

  // --- Remove All Commands ---
  context.subscriptions.push(
    vscode.commands.registerCommand('coreflux.removeAllModels', async () => {
      handleRemoveAllCommand('Models', '-removeAllModels');
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('coreflux.removeAllActions', async () => {
      handleRemoveAllCommand('Actions', '-removeAllActions');
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('coreflux.removeAllRoutes', async () => {
      handleRemoveAllCommand('Routes', '-removeAllRoutes');
    })
  );

  // --- Other Commands ---
  const openPayloadCommand = vscode.commands.registerCommand('lot.openTopicPayload', async (topicName: string) => {
    const payload = payloadMap.get(topicName) ?? '';
    const newPayload = await vscode.window.showInputBox({
      value: payload,
      prompt: `Payload for topic '${topicName}' (edit and press Enter to update)`,
    });
    if (newPayload !== undefined && newPayload !== payload) {
      payloadMap.set(topicName, newPayload);
      vscode.window.showInformationMessage(`Updated payload for topic '${topicName}' to: ${newPayload}`);
    }
  });
  context.subscriptions.push(openPayloadCommand);

  // ---> UPDATED: Use this command to open the Anselmo Webview <---
  const openChatbotCmd = vscode.commands.registerCommand('lot.openChatbot', async () => {
    // Check if Anselmo is enabled in experimental features
    const config = vscode.workspace.getConfiguration('lotNotebook');
    const isAnselmoEnabled = config.get('experimentalFeatures.anselmoChatbot', false);
    
    if (!isAnselmoEnabled) {
      const enableAction = 'Enable Experimental Feature';
      const result = await vscode.window.showInformationMessage(
        'Anselmo ChatBot is an experimental feature. Would you like to enable it?',
        enableAction,
        'Cancel'
      );
      
      if (result === enableAction) {
        await config.update('experimentalFeatures.anselmoChatbot', true, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('Anselmo ChatBot enabled! The window will reload to show the new features.');
        return;
      }
      return;
    }
    const columnToShowIn = vscode.window.activeTextEditor 
      ? vscode.window.activeTextEditor.viewColumn 
      : vscode.ViewColumn.Beside;

    // --- NEW: Check active notebook and prepare initial context --- 
    const activeEditor = vscode.window.activeNotebookEditor;
    let initialNotebookContext: string | undefined = undefined;
    let initialQuery: string | undefined = undefined;
    let panelTitle = 'Anselmo ChatBot (beta preview)'; // Default title
    let currentNotebookUri: vscode.Uri | undefined = undefined;
    // ---> NEW: Define default interaction mode for initial opening
    const initialInteractionMode = 'ask'; 

    if (activeEditor && activeEditor.notebook.notebookType === 'lot-notebook') {
      const notebook = activeEditor.notebook;
      currentNotebookUri = notebook.uri;
      const filename = path.basename(notebook.uri.fsPath);
      panelTitle = `Anselmo: ${filename}`;
      console.log(`[openChatbot] Active LOT notebook found: ${filename}. Initial mode: ${initialInteractionMode}`);

      // Prepare context based on initial mode (e.g., 'ask')
      const cellContents: string[] = [];
      // --- NEW: Different initial prompt for 'ask' mode ---
      const askModeInstructions = `The user is interacting with the following LOT notebook content. Please use this content to formulate your answer. Do not refer to or use cell placeholders.`;
      
      notebook.getCells().forEach((cell) => {
        const languageId = cell.document.languageId || 'plaintext';
        const cellContent = cell.document.getText();
        // For 'ask' mode, just concatenate content, perhaps with language hint if useful
        cellContents.push(`[language=${languageId}]\n${cellContent}`); 
      });
      const rawNotebookContent = cellContents.join('\n---\n');

      initialNotebookContext = `vscode-webview context\n${askModeInstructions}`;
      initialNotebookContext += `\n\n--- NOTEBOOK CONTENT START ---\n${rawNotebookContent}\n--- NOTEBOOK CONTENT END ---`;
      initialQuery = "User opened chat panel for the provided notebook context. Provide a brief greeting or initial analysis based on the full content.";
      console.log('[openChatbot] Prepared initial context and query for mode:', initialInteractionMode);
    } else {
      console.log('[openChatbot] No active LOT notebook editor found.');
      currentNotebookUri = undefined;
    }

    if (anselmoPanel) {
      console.log('[openChatbot] Panel exists. Revealing and updating.');
      anselmoPanel.title = panelTitle;
      associatedNotebookUri = currentNotebookUri;
      anselmoPanel.reveal(columnToShowIn);

      if (currentNotebookUri) {
        anselmoPanel.webview.postMessage({ command: 'setDocumentContext', filename: path.basename(currentNotebookUri.fsPath) });
        if (initialQuery && initialNotebookContext) {
          anselmoPanel.webview.postMessage({ command: 'addMessage', text: 'Analyzing document (Ask mode)... ⏳', sender: 'assistant' });
          // Make initial API call using the new 'ask' mode context
          callAnselmoApi(initialQuery, initialNotebookContext, anselmoPanel);
        }
      } else {
        anselmoPanel.webview.postMessage({ command: 'clearDocumentContext' }); 
      }
      return; 
    }

    console.log('[openChatbot] Creating new panel.');
    anselmoSessionId = undefined;
    associatedNotebookUri = currentNotebookUri;
    anselmoPanel = vscode.window.createWebviewPanel(
      'anselmoChat',
      panelTitle, // Use dynamic or default title
      columnToShowIn || vscode.ViewColumn.Beside,
      {
        enableScripts: true, 
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview')],
        retainContextWhenHidden: true 
      }
    );

    anselmoPanel.webview.html = getWebviewContent(anselmoPanel.webview, context.extensionUri);

    // --- Send initial context message after HTML is set ---
    if (currentNotebookUri) {
      anselmoPanel.webview.postMessage({ command: 'setDocumentContext', filename: path.basename(currentNotebookUri.fsPath) });
    }
    // --- End initial context message --- 

    // Handle messages from the webview
    anselmoPanel.webview.onDidReceiveMessage(
      async message => {
        // Check panel existence before processing/posting
        if (!anselmoPanel) return;

        switch (message.command) {
        case 'webviewReady': // NEW: Webview signals it's ready
          console.log('[Webview->Ext] Webview is ready.');
          // Now make the initial API call if context was prepared
          if (initialQuery && initialNotebookContext && associatedNotebookUri) {
            anselmoPanel.webview.postMessage({ command: 'addMessage', text: 'Analyzing document (Ask mode)... ⏳', sender: 'assistant' });
            callAnselmoApi(initialQuery, initialNotebookContext, anselmoPanel);
          }
          return;
        case 'alert': 
          vscode.window.showErrorMessage(message.text);
          return;
        case 'sendMessage':
          // --- NEW: Expect 'mode' from webview message ---
          const userQuery = message.text;
          const themeColors = message.colors; // This was removed by your edit, will respect that.
          const interactionMode = message.mode || 'help'; // Default to 'help' if mode not provided

          console.log(`[Webview->Ext] Received sendMessage. Mode: ${interactionMode}, Query: ${userQuery}`);

          let sendMessageContext = '';

          // --- NEW: Switch logic based on interactionMode ---
          switch (interactionMode) {
          case 'ask':
            if (associatedNotebookUri) {
              try {
                const notebookDoc = await vscode.workspace.openNotebookDocument(associatedNotebookUri);
                if (notebookDoc.notebookType === 'lot-notebook') {
                  console.log(`[sendMessage - Ask Mode] Using associated notebook: ${associatedNotebookUri.fsPath}`);
                  const cellContents: string[] = [];
                  const askModeSystemPrompt = `The user is asking a question about the following LOT notebook content. Please use this content to formulate your answer. Do not refer to or use cell placeholders.`;
                    
                  notebookDoc.getCells().forEach((cell) => {
                    const languageId = cell.document.languageId || 'plaintext';
                    const cellContent = cell.document.getText();
                    cellContents.push(`[language=${languageId}]\n${cellContent}`);
                  });
                  const rawNotebookContent = cellContents.join('\n---\n');
                          
                  sendMessageContext = `vscode-webview context\n${askModeSystemPrompt}`;
                  sendMessageContext += `\n\n--- NOTEBOOK CONTENT START ---\n${rawNotebookContent}\n--- NOTEBOOK CONTENT END ---`;
                } else {
                  console.warn(`[sendMessage - Ask Mode] Associated URI ${associatedNotebookUri.fsPath} is not a LOT notebook.`);
                  // sendMessageContext = "Associated document context not available (not a LOT notebook). Please ensure a LOT notebook is active for 'Ask' mode.";
                  anselmoPanel?.webview.postMessage({ command: 'addMessage', text: "⚠️ To use 'Ask' mode, please ensure a LOT notebook is associated with the chat.", sender: 'assistant' });
                  return; 
                }
              } catch (error) {
                console.error(`[sendMessage - Ask Mode] Error opening associated notebook ${associatedNotebookUri.fsPath}:`, error);
                // sendMessageContext = "Error retrieving associated document context.";
                associatedNotebookUri = undefined; 
                anselmoPanel?.webview.postMessage({ command: 'clearDocumentContext' }); 
                anselmoPanel?.webview.postMessage({ command: 'addMessage', text: "⚠️ Error accessing the notebook for 'Ask' mode.", sender: 'assistant' });
                return;
              }
            } else {
              console.log('[sendMessage - Ask Mode] No associated LOT notebook.');
              // sendMessageContext = "No associated LOT notebook context available. Please open a LOT notebook to use 'Ask' mode.";
              anselmoPanel?.webview.postMessage({ command: 'addMessage', text: "⚠️ To use 'Ask' mode, please open and associate a LOT notebook with the chat.", sender: 'assistant' });
              return; 
            }
            break; 

          case 'help':
            console.log('[sendMessage - Help Mode] Using general help context.');
            sendMessageContext = "The user is asking for general help or has a question not specific to a document. Please provide a helpful, general response.";
            break;

          case 'edit': 
            console.log('[sendMessage - Edit Mode] Activated.');
            if (associatedNotebookUri) {
              try {
                const notebookDoc = await vscode.workspace.openNotebookDocument(associatedNotebookUri);
                if (notebookDoc.notebookType === 'lot-notebook') {
                  console.log(`[sendMessage - Edit Mode] Using associated notebook: ${associatedNotebookUri.fsPath}`);
                  const cellContents: string[] = [];
                  const placeholderInstructions = `The user is interacting with the following LOT notebook content. Each cell is marked with a placeholder like <!-- CELL_INDEX_N -->. When referring to or suggesting modifications for specific cells, please use these exact placeholders in your response. IMPORTANT: To suggest replacing the entire content of a cell, provide the placeholder on its own line, followed by the complete new content for that cell, like this:\n<!-- CELL_INDEX_N -->\n[new full content for cell N]`;
                  
                  notebookDoc.getCells().forEach((cell, index) => {
                    const placeholder = `<!-- CELL_INDEX_${index} -->\n`;
                    const languageId = cell.document.languageId || 'plaintext';
                    const cellContent = cell.document.getText();
                    cellContents.push(`${placeholder}[language=${languageId}]\n${cellContent}`);
                  });
                  const notebookContentWithPlaceholders = cellContents.join('\n---\n');
                        
                  sendMessageContext = `vscode-webview context\n${placeholderInstructions}`;
                  sendMessageContext += `\n\n--- NOTEBOOK CONTENT START ---\n${notebookContentWithPlaceholders}\n--- NOTEBOOK CONTENT END ---`;
                } else {
                  console.warn(`[sendMessage - Edit Mode] Associated URI ${associatedNotebookUri.fsPath} is not a LOT notebook.`);
                  anselmoPanel?.webview.postMessage({ command: 'addMessage', text: "⚠️ To use 'Edit (Cells)' mode, please ensure a LOT notebook is associated with the chat.", sender: 'assistant' });
                  return; 
                }
              } catch (error) {
                console.error(`[sendMessage - Edit Mode] Error opening associated notebook ${associatedNotebookUri.fsPath}:`, error);
                associatedNotebookUri = undefined; 
                anselmoPanel?.webview.postMessage({ command: 'clearDocumentContext' }); 
                anselmoPanel?.webview.postMessage({ command: 'addMessage', text: "⚠️ Error accessing the notebook for 'Edit (Cells)' mode.", sender: 'assistant' });
                return;
              }
            } else {
              console.log('[sendMessage - Edit Mode] No associated LOT notebook.');
              anselmoPanel?.webview.postMessage({ command: 'addMessage', text: "⚠️ To use 'Edit (Cells)' mode, please open and associate a LOT notebook with the chat.", sender: 'assistant' });
              return; 
            }
            break;
            
          default:
            console.warn(`[sendMessage] Unknown interaction mode: ${interactionMode}. Defaulting to help context.`);
            sendMessageContext = "Unknown interaction mode. Treating as a general help request.";
            break;
          }
          // --- End new context logic ---
            
          console.log(`[Ext - ${interactionMode} Mode] Using context for Anselmo API:`, sendMessageContext);
          callAnselmoApi(userQuery, sendMessageContext, anselmoPanel);
          return;
        case 'applyCellUpdate':
          console.log(`[Webview->Ext] Received applyCellUpdate for index: ${message.cellIndex}`);
          if (typeof message.cellIndex === 'number' && typeof message.newContent === 'string') {
            vscode.commands.executeCommand('lot.applyCellUpdate', message.cellIndex, message.newContent);
          } else {
            console.error('[Ext] Invalid payload for applyCellUpdate:', message);
            vscode.window.showErrorMessage('Received invalid data for cell update request.');
          }
          return;
        }
      },
      undefined,
      context.subscriptions
    );

    // Handle panel disposal
    anselmoPanel.onDidDispose(
      () => {
        console.log("Anselmo webview panel disposed.");
        anselmoPanel = undefined; 
        anselmoSessionId = undefined; 
        associatedNotebookUri = undefined; // Clear associated URI
      },
      null,
      context.subscriptions
    );
  });
  context.subscriptions.push(openChatbotCmd);

  // ---> NEW: Enable Experimental Features Command <---
  context.subscriptions.push(
    vscode.commands.registerCommand('lot-notebook.enableExperimentalFeatures', async () => {
      const config = vscode.workspace.getConfiguration('lotNotebook');
      const isAnselmoEnabled = config.get('experimentalFeatures.anselmoChatbot', false);
      
      if (isAnselmoEnabled) {
        vscode.window.showInformationMessage('Experimental features are already enabled!');
        return;
      }
      
      const result = await vscode.window.showWarningMessage(
        'This will enable experimental features including Anselmo ChatBot. These features are still in development and may be unstable. Continue?',
        'Enable Experimental Features',
        'Cancel'
      );
      
      if (result === 'Enable Experimental Features') {
        await config.update('experimentalFeatures.anselmoChatbot', true, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('Experimental features enabled! The window will reload to show the new features.');
      }
    })
  );

  // ---> NEW: Disable Experimental Features Command <---
  context.subscriptions.push(
    vscode.commands.registerCommand('lot-notebook.disableExperimentalFeatures', async () => {
      const config = vscode.workspace.getConfiguration('lotNotebook');
      const isAnselmoEnabled = config.get('experimentalFeatures.anselmoChatbot', false);
      
      if (!isAnselmoEnabled) {
        vscode.window.showInformationMessage('Experimental features are already disabled!');
        return;
      }
      
      const result = await vscode.window.showWarningMessage(
        'This will disable experimental features including Anselmo ChatBot. Continue?',
        'Disable Experimental Features',
        'Cancel'
      );
      
      if (result === 'Disable Experimental Features') {
        await config.update('experimentalFeatures.anselmoChatbot', false, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('Experimental features disabled! The window will reload to hide the experimental features.');
      }
    })
  );

  // ---> NEW HELPER FUNCTION for API call <--
  async function callAnselmoApi(query: string, context: string, panel: vscode.WebviewPanel) {
    if (!panel || !panel.visible) { // Check visibility too
      console.log("[API Call] Panel not visible, skipping API call.");
        
      return; 
    }

    const apiUrl = 'https://anselmo.coreflux.org/webhook/chat_lot_beta';
    const requestBody = {
        
      query: query,
      context: context,
      sessionId: anselmoSessionId
    };

    try {

      const fetch = (await import('node-fetch')).default;
      console.log(`[API Call] Calling ${apiUrl} with session ${anselmoSessionId}`);
        
      const apiResponse = await fetch(apiUrl, {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' }
      });

      console.log(`[API Resp] Status: ${apiResponse.status}`);

      if (!anselmoPanel || !anselmoPanel.visible) { 
        console.log("[API Resp] Panel closed or hidden before response received.");
        return; 
      } 

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error(`[API Resp] Error ${apiResponse.status}: ${errorText}`);
        panel.webview.postMessage({
          command: 'addMessage',
          text: `⚠️ Error ${apiResponse.status}: ${apiResponse.statusText}. Check console for details.`, 
          sender: 'assistant'
        });
        return;
      }

      const contentType = apiResponse.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const responseData = await apiResponse.json() as { raw_output?: string; sessionId?: string; lot_command?: string };
        console.log(`[API Resp] Received JSON. Session: ${responseData.sessionId}`);

        if (responseData.sessionId) {
          anselmoSessionId = responseData.sessionId;
          console.log(`[API Call] Updated session ID to: ${anselmoSessionId}`);
        }

        const anselmoText = responseData.raw_output || ''; // Default to empty string
        const anselmoLOT = responseData.lot_command; 
        const updates: { index: number; newContent: string }[] = [];
        const updateRegex = /<!--\s*CELL_INDEX_(\d+)\s*-->\r?\n([\s\S]*?)(?=<!--\s*CELL_INDEX_\d+\s*-->|$)/g;
        let match;
        while ((match = updateRegex.exec(anselmoText)) !== null) {
          const index = parseInt(match[1], 10);
          const newContent = match[2].trim(); 
          if (!isNaN(index)) {
            updates.push({ index, newContent });
            console.log(`[API Parse] Found potential update for cell ${index}`);
          }
        }


        let messageToSend = '';
        if (anselmoLOT && anselmoLOT.trim()) {
          messageToSend += `**LOT Command:**\n\`\`\`lot\n${anselmoLOT.trim()}\n\`\`\`\n\n`; 
        }
        messageToSend += anselmoText;

        if (messageToSend.trim() || updates.length > 0) { 
          panel.webview.postMessage({
            command: 'addMessage', 
            text: messageToSend, 
            sender: 'assistant',
            updates: updates 
          });
        } else {
          panel.webview.postMessage({
            command: 'addMessage',
            text: '⚠️ Received an empty response content from Anselmo.',
            sender: 'assistant'
          });
        }
      } else {
        const textResponse = await apiResponse.text();
        console.log("[API Resp] Received non-JSON response:", textResponse);
        if (!anselmoPanel || !anselmoPanel.visible) { 
          console.log("[API Resp] Panel closed or hidden before non-JSON response processed.");
          return; 
        } 
        panel.webview.postMessage({
          command: 'addMessage',
          text: `⚠️ Received non-JSON response from Anselmo:\n\`\`\`\n${textResponse}\n\`\`\``, 
          sender: 'assistant'
        });
      }

    } catch (error: any) {
      console.error("[API Call] Error calling API or processing response:", error);
      if (!anselmoPanel || !anselmoPanel.visible) { 
        console.log("[API Call] Panel closed or hidden before error processed.");
        return; 
      } 
      panel.webview.postMessage({
        command: 'addMessage',
        text: `⚠️ Failed to communicate with Anselmo: ${error.message}`,
        sender: 'assistant'
      });
    }
  }
  // --- END HELPER FUNCTION --- 

  // ---> NEW: Explain Code Command <---
  context.subscriptions.push(
    vscode.commands.registerCommand('lot-notebook.explainCell', async (contextArg?: vscode.NotebookCell | vscode.Uri | unknown) => {
      // Check if Anselmo is enabled in experimental features
      const config = vscode.workspace.getConfiguration('lotNotebook');
      const isAnselmoEnabled = config.get('experimentalFeatures.anselmoChatbot', false);
      
      if (!isAnselmoEnabled) {
        const enableAction = 'Enable Experimental Feature';
        const result = await vscode.window.showInformationMessage(
          'Anselmo ChatBot is an experimental feature. Would you like to enable it?',
          enableAction,
          'Cancel'
        );
        
        if (result === enableAction) {
          await config.update('experimentalFeatures.anselmoChatbot', true, vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage('Anselmo ChatBot enabled! The window will reload to show the new features.');
          return;
        }
        return;
      }
      
      // Argument type could be NotebookCell (from inline button), Uri (maybe from context menu?), or unknown
      console.log('[explainCell] Command triggered. Arg:', contextArg ? JSON.stringify(contextArg) : 'No Arg provided.');
      let cell: vscode.NotebookCell | undefined;

      // --- UPDATED: Check argument type --- 
      if (contextArg && typeof contextArg === 'object' && 'kind' in contextArg && contextArg.kind === vscode.NotebookCellKind.Code) {
        // Argument looks like a NotebookCell object (likely from inline button)
        console.log('[explainCell] Argument appears to be a NotebookCell object.');
        cell = contextArg as vscode.NotebookCell;
      } else if (contextArg instanceof vscode.Uri) {
        // Argument is a Uri (maybe from context menu - keep existing logic just in case)
        console.log('[explainCell] Argument is a Uri. Attempting to resolve cell from Uri...');
        const cellUri = contextArg; 
        // --- Previous URI parsing logic (wrapped in try/catch) ---
        try {
          if (typeof cellUri.fragment === 'string' && typeof cellUri.with === 'function') {
            const parts = cellUri.fragment.match(/C(\d+)/);
            const cellIndex = parts ? parseInt(parts[1], 10) : undefined;
            const docUri = cellUri.with({ fragment: '' });
                  
            if (cellIndex !== undefined && docUri) {
              console.log(`[explainCell] Attempting to find notebook: ${docUri.toString()} and cell index: ${cellIndex}`);
              const notebookDoc = vscode.workspace.notebookDocuments.find(doc => doc.uri.toString() === docUri.toString());
              if (notebookDoc) {
                console.log(`[explainCell] Found matching notebook document. Cell count: ${notebookDoc.cellCount}`);
                if (cellIndex >= 0 && cellIndex < notebookDoc.cellCount) {
                  cell = notebookDoc.cellAt(cellIndex);
                  console.log('[explainCell] Found cell via URI at index:', cellIndex);
                } else {
                  console.warn('[explainCell] Cell index from URI out of bounds.');
                }
              } else {
                console.warn('[explainCell] No matching notebook document found for URI.');
              }
            } else {
              console.log('[explainCell] Could not extract valid cell index or doc URI from provided cellUri object.');
            }
          } else {
            console.warn('[explainCell] Received cellUri object does not look like a valid vscode.Uri based on properties.');
          }
        } catch (error) {
          console.error('[explainCell] Error during cell finding via URI:', error);
        }
        // --- End Previous URI parsing logic ---
      }
      // --- END Argument Type Check --- 

      // Fallback: Try to get the active notebook cell if no cell identified yet
      if (!cell && vscode.window.activeNotebookEditor) {
        console.log('[explainCell] No cell found via argument, trying active editor...');
        const activeEditor = vscode.window.activeNotebookEditor;
        // Ensure the active editor is actually for a notebook (belt-and-suspenders)
        if (activeEditor.notebook.uri.scheme.startsWith('vscode-notebook') && activeEditor.selections.length > 0) {
          const selectedCellIndex = activeEditor.selections[0].start; // Use the first selected cell
          cell = activeEditor.notebook.cellAt(selectedCellIndex);
          console.log('[explainCell] Found cell via active editor selection at index:', selectedCellIndex);
        } else {
          console.log('[explainCell] Active editor is not a notebook or no cell selected.');
        }
      }
      
      // --- Checks and rest of command logic --- 
      if (!cell) {
        console.error('[explainCell] Could not determine target cell from argument or active editor.');
        vscode.window.showWarningMessage('Could not determine the target cell to explain.');
        return;
      }

      // Check cell kind (language check removed earlier based on your package.json change)
      if (cell.kind !== vscode.NotebookCellKind.Code) {
        console.warn('[explainCell] Target cell is not a Code cell.', `Kind: ${cell.kind}`);
        vscode.window.showWarningMessage('Cannot explain non-Code cells.'); 
        return;
      }

      const cellContent = cell.document.getText();
      if (!cellContent.trim()) {
        console.warn('[explainCell] Selected cell is empty.');
        vscode.window.showWarningMessage('Selected cell is empty.');
        return;
      }

      // Construct the query and context for Explain Cell
      const explainQuery = `Explain the following code:`; // Simple query
      const explainContext = `Language: ${cell.document.languageId}\nTheme Colors: ... \n---\n${cellContent}`; // Placeholder for colors, add cell content
      console.log('[explainCell] Constructed Query:', explainQuery); 
      console.log('[explainCell] Constructed Context:', explainContext); 

      // Ensure the panel is open and visible
      if (!anselmoPanel) {
        console.log('[explainCell] Anselmo panel not found, attempting to open...');
        await vscode.commands.executeCommand('lot.openChatbot');
        await new Promise(resolve => setTimeout(resolve, 300)); 
        console.log('[explainCell] Panel should be open now.');
      } else {
        console.log('[explainCell] Anselmo panel already open, revealing...');
        const columnToShowIn = vscode.window.activeTextEditor 
          ? vscode.window.activeTextEditor.viewColumn 
          : vscode.ViewColumn.Beside;
        anselmoPanel.reveal(columnToShowIn);
      }

      // --- Directly call API for Explain, don't post prompt to webview ---
      if (anselmoPanel) {
        // Add a temporary "Thinking" message to the webview
        anselmoPanel.webview.postMessage({ command: 'addMessage', text: 'Asking Anselmo to explain... ⏳', sender: 'assistant' });

        // Define the API call parameters
        const apiUrl = 'https://anselmo.coreflux.org/webhook/chat_lot_beta';
        const requestBody = {
          query: explainQuery,
          context: explainContext, // Send cell content in context
          sessionId: anselmoSessionId // Include session ID
        };

        // Make the API call (similar logic as in sendMessage handler)
        try {
          const fetch = (await import('node-fetch')).default;
          console.log(`[Explain->API] Calling ${apiUrl} with body: ${JSON.stringify(requestBody)}`);
          const apiResponse = await fetch(apiUrl, { method: 'POST', body: JSON.stringify(requestBody), headers: { 'Content-Type': 'application/json' } });
          console.log(`[API->Explain] Response Status: ${apiResponse.status}`);


          if (!apiResponse.ok) {

            const errorText = await apiResponse.text();
            anselmoPanel?.webview.postMessage({ command: 'addMessage', text: `⚠️ Error explaining code: ${apiResponse.statusText}`, sender: 'assistant' });
            return;
          }

          const contentType = apiResponse.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const responseData = await apiResponse.json() as { raw_output?: string; sessionId?: string; lot_command?: string }; 
            console.log(`[API->Explain] Received JSON:`, responseData);
                  
            if (responseData.sessionId) { anselmoSessionId = responseData.sessionId; /* log */ }
            const anselmoText = responseData.raw_output; 
            if (anselmoText) {
              anselmoPanel?.webview.postMessage({ command: 'addMessage', text: anselmoText, sender: 'assistant' });
            } else {
              anselmoPanel?.webview.postMessage({ command: 'addMessage', text: '⚠️ Anselmo returned an empty explanation.', sender: 'assistant' });
            }     
          } else {
            const textResponse = await apiResponse.text();
            anselmoPanel?.webview.postMessage({ command: 'addMessage', text: `⚠️ Received non-JSON explanation: ${textResponse}`, sender: 'assistant' });
          }
        } catch (error: any) {

          anselmoPanel?.webview.postMessage({ command: 'addMessage', text: `⚠️ Error contacting Anselmo: ${error.message}`, sender: 'assistant' });
        }
      } else {
        vscode.window.showErrorMessage('Could not open or find the Anselmo Chat panel.');
      }
      // --- End Direct API Call ---
    })
  );

  // Command to navigate to or create a notebook cell for an entity
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'coreflux.goToOrCreateEntityCell',
      async (entityType: 'Model' | 'Action' | 'Rule' | 'Route', entityName: string) => {

        // ---> UPDATED: Prioritize navigating to the definition in the notebook file
        const definitionLocation = corefluxEntitiesProvider.getEntityLocation(entityType, entityName);
        if (definitionLocation) {
          try {
            // 1. Open the specific notebook document
            const notebookDoc = await vscode.workspace.openNotebookDocument(definitionLocation.notebookUri);
            // 2. Show the notebook editor
            const editor = await vscode.window.showNotebookDocument(notebookDoc, { viewColumn: vscode.ViewColumn.Active });
            // 3. Reveal the specific cell
            const rangeToReveal = new vscode.NotebookRange(definitionLocation.cellIndex, definitionLocation.cellIndex + 1);
            editor.revealRange(rangeToReveal, vscode.NotebookEditorRevealType.InCenterIfOutsideViewport);
            // 4. Focus the text editor of the cell and select the range
            const cell = notebookDoc.cellAt(definitionLocation.cellIndex);
            await vscode.window.showTextDocument(cell.document, {
              viewColumn: editor.viewColumn, // Show in the same view column
              selection: definitionLocation.rangeInCell,
              preserveFocus: false,
              preview: false
            });

            console.log(`Navigated to definition of ${entityType} ${entityName} in ${definitionLocation.notebookUri.fsPath}, cell index ${definitionLocation.cellIndex}`);
            return; // Navigation successful, exit command
          } catch (error) {
            console.error(`Error navigating to entity definition for ${entityType} ${entityName}:`, error);
            vscode.window.showErrorMessage(`Failed to open or navigate to the definition for ${entityType} ${entityName}.`);
            // Fall through to try finding/creating a cell as a fallback
          }
        }
        // <--- END UPDATED

        // ---> EXISTING LOGIC (Fallback if definition not found in parsed files)
        console.log(`Definition location not found for ${entityType} ${entityName}. Searching for existing cell...`);
        let foundEditor: vscode.NotebookEditor | undefined = undefined;
        let foundCellIndex: number = -1;
        let foundNotebookUri: vscode.Uri | undefined = undefined;

        // Search across ALL open lot-notebooks
        for (const notebookDoc of vscode.workspace.notebookDocuments) {
          if (notebookDoc.notebookType === 'lot-notebook') {
            for (let i = 0; i < notebookDoc.cellCount; i++) {
              const cell = notebookDoc.cellAt(i);
              if (
                cell.metadata?.custom?.corefluxEntity?.type === entityType &&
                cell.metadata?.custom?.corefluxEntity?.name === entityName
              ) {
                // Found the cell!
                foundCellIndex = i;
                foundNotebookUri = notebookDoc.uri;
                // Find the editor associated with this document
                foundEditor = vscode.window.visibleNotebookEditors.find(editor => editor.notebook.uri.toString() === notebookDoc.uri.toString());
                break; // Stop searching cells in this notebook
              }
            }
          }
          if (foundNotebookUri) {
            break; // Stop searching notebooks
          }
        }

        if (foundEditor && foundCellIndex !== -1) {
          // Cell found in a visible editor: Reveal it
          await vscode.window.showNotebookDocument(foundEditor.notebook, { viewColumn: foundEditor.viewColumn }); // Ensure editor is focused
          const range = new vscode.NotebookRange(foundCellIndex, foundCellIndex + 1);
          foundEditor.revealRange(range, vscode.NotebookEditorRevealType.InCenterIfOutsideViewport);
          // Focus the cell editor might need a slight delay if switching documents
          setTimeout(() => {
            if (foundEditor) {
              vscode.window.showTextDocument(foundEditor.notebook.cellAt(foundCellIndex).document);
            }
          }, 100);
          console.log(`Navigated to existing cell for ${entityType} ${entityName} in ${foundNotebookUri?.fsPath}`);

        } else if (foundNotebookUri && foundCellIndex !== -1) {
          // Cell found, but editor wasn't visible. Open/show the document and reveal.
          const notebookDoc = await vscode.workspace.openNotebookDocument(foundNotebookUri);
          const editor = await vscode.window.showNotebookDocument(notebookDoc, { 
            selections: [new vscode.NotebookRange(foundCellIndex, foundCellIndex + 1)] // Use 'selections' (plural) and provide an array
          });
          // editor.revealRange(range, vscode.NotebookEditorRevealType.InCenterIfOutsideViewport); // No longer needed, handled by showNotebookDocument options
          // Focus the cell editor might need a slight delay if switching documents
          setTimeout(() => {
            vscode.window.showTextDocument(editor.notebook.cellAt(foundCellIndex).document);
          }, 100);
          console.log(`Opened and navigated to existing cell for ${entityType} ${entityName} in ${foundNotebookUri?.fsPath}`);

        } else {
          // Cell not found in any open notebook: Try to create it in the active one
          const activeEditor = vscode.window.activeNotebookEditor;
          if (!activeEditor || activeEditor.notebook.notebookType !== 'lot-notebook') {
            vscode.window.showInformationMessage('Cell not found in open notebooks. Please open and focus the target LOT Notebook (.lotnb) first to create the cell.');
            return;
          }

          const notebook = activeEditor.notebook;
          const entityCode = corefluxEntitiesProvider.getEntityCode(entityType, entityName);
          if (entityCode === undefined) {
            vscode.window.showWarningMessage(`Could not find code for ${entityType} '${entityName}'. Refreshing the view might help.`);
            corefluxEntitiesProvider.refresh(); // Try refreshing
            return;
          }

          const languageId = 'lot'; // Use 'lot' language ID

          const newCell = new vscode.NotebookCellData(
            vscode.NotebookCellKind.Code,
            entityCode,
            languageId
          );
          newCell.metadata = {
            custom: {
              corefluxEntity: { type: entityType, name: entityName },
              runnable: true, // Assuming new cells are runnable
              // topic: `$SYS/Coreflux/${entityType}s/${entityName}` // Optionally add topic if needed
            }
          };

          const notebookEdit = vscode.NotebookEdit.insertCells(notebook.cellCount, [newCell]);
          const edit = new vscode.WorkspaceEdit();
          edit.set(notebook.uri, [notebookEdit]);

          await vscode.workspace.applyEdit(edit);
          vscode.window.showInformationMessage(`Created new cell for ${entityType} '${entityName}'.`);

          // Reveal the new cell (last cell)
          const newCellIndex = notebook.cellCount - 1; // This might be slightly off if applyEdit is slow, but usually works
          const range = new vscode.NotebookRange(newCellIndex, newCellIndex + 1);
          activeEditor.revealRange(range, vscode.NotebookEditorRevealType.InCenter);
          // Slight delay to ensure the cell is ready before focusing
          setTimeout(() => {
            vscode.window.showTextDocument(notebook.cellAt(newCellIndex).document);
          }, 100);
          
        }
      }
    )
  );

  // --- Register New Commands ---

  // (ii) Remove Entity Command
  context.subscriptions.push(vscode.commands.registerCommand('coreflux.removeEntity', 
    async (itemOrType: EntityItem | ('Model' | 'Action' | 'Rule' | 'Route'), nameArg?: string) => {
      let entityType: 'Model' | 'Action' | 'Rule' | 'Route';
      let entityName: string;

      // Handle arguments coming from tree item context menu OR direct command execution
      if (itemOrType instanceof EntityItem) {
        entityType = itemOrType.entityType as 'Model' | 'Action' | 'Rule' | 'Route'; // Type assertion
        entityName = itemOrType.entityName;
      } else if (nameArg) {
        entityType = itemOrType as 'Model' | 'Action' | 'Rule' | 'Route';
        entityName = nameArg;
      } else {
        vscode.window.showErrorMessage('Invalid arguments for removeEntity command.');
        return;
      }

      if (!controller) {
        vscode.window.showErrorMessage('LOT Controller not available.');
        return;
      }

      const confirmation = await vscode.window.showWarningMessage(
        `Are you sure you want to remove ${entityType} '${entityName}' from the broker? This action cannot be undone.`, 
        { modal: true }, 
        'Yes, Remove'
      );

      if (confirmation === 'Yes, Remove') {
        const published = controller.publishRemoveEntityCommand(entityType, entityName);
        if (published) {
          // Optimistically remove from provider's internal state
          const removedLocally = corefluxEntitiesProvider?.removeEntityData(entityType, entityName);
          if (removedLocally) {
            // Refresh the tree view immediately
            corefluxEntitiesProvider?.refresh(); 
          } else {
            console.warn(`[Extension] Failed to remove ${entityType} ${entityName} from provider state, but publish was attempted.`);
            // Still refresh, maybe it disappeared via MQTT coincidentally
            corefluxEntitiesProvider?.refresh();
          }
        } else {
          // Publish failed (likely not connected), error message already shown by controller
        }
      }
    }
  ));

  // (i) Create Definition Command
  context.subscriptions.push(vscode.commands.registerCommand('coreflux.createEntityDefinition', 
    async (item: EntityItem) => {
      if (!item || !(item instanceof EntityItem)) {
        vscode.window.showErrorMessage('Command must be run from a Coreflux Entity item.');
        return;
      }
      const entityType = item.entityType as 'Model' | 'Action' | 'Rule' | 'Route';
      const entityName = item.entityName;

      // Find active *text* editor (we insert into the cell's document)
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        vscode.window.showInformationMessage('Please open a LOT Notebook and place the cursor where you want to insert the definition.');
        return;
      }
      
      // Check if the active editor belongs to a notebook cell (optional but good practice)
      const notebook = vscode.workspace.notebookDocuments.find(notebook => 
        notebook.getCells().some(cell => cell.document === activeEditor.document)
      );

      if (!notebook || notebook.notebookType !== 'lot-notebook') {
        vscode.window.showInformationMessage('Please ensure the active editor is part of a LOT Notebook (.lotnb).');
        return;
      }

      const definitionText = `DEFINE ${entityType.toUpperCase()} ${entityName}\n\n`; // Add blank lines

      // Insert the text at the current cursor position(s)
      activeEditor.edit(editBuilder => {
        activeEditor.selections.forEach(selection => {
          editBuilder.insert(selection.active, definitionText);
        });
      }).then(success => {
        if (success) {
          vscode.window.showInformationMessage(`Inserted definition for ${entityType} ${entityName}.`);
          // Reveal the inserted position
          activeEditor.revealRange(new vscode.Range(activeEditor.selection.active, activeEditor.selection.active));
          // Saving the document will trigger the parser and update the tree status
          activeEditor.document.save(); 
        } else {
          vscode.window.showErrorMessage('Failed to insert entity definition.');
        }
      });
    }
  ));

  // (iii) Update Cell from Broker Command
  context.subscriptions.push(vscode.commands.registerCommand('coreflux.updateCellFromMqtt', 
    async (item: EntityItem) => {
      if (!item || !(item instanceof EntityItem) || !item.payload) {
        vscode.window.showErrorMessage('Command requires an entity item with a code payload from the broker.');
        return;
      }
      const entityType = item.entityType as 'Model' | 'Action' | 'Rule' | 'Route';
      const entityName = item.entityName;
      const mqttCode = item.payload; // Code from the broker

      const location = corefluxEntitiesProvider.getEntityLocation(entityType, entityName);
      if (!location) {
        vscode.window.showErrorMessage(`Could not find notebook location for ${entityType} ${entityName}. Try saving the notebook file.`);
        return;
      }

      const confirmation = await vscode.window.showWarningMessage(
        `Replace the code in notebook cell ${location.cellIndex + 1} for ${entityType} '${entityName}' with the code from the broker?`, 
        { modal: true }, 
        'Yes, Update Cell'
      );

      if (confirmation === 'Yes, Update Cell') {
        try {
          const notebookDoc = await vscode.workspace.openNotebookDocument(location.notebookUri);
          const cell = notebookDoc.cellAt(location.cellIndex);
          
          // Create a WorkspaceEdit to replace cell content
          const edit = new vscode.WorkspaceEdit();
          const fullCellRange = new vscode.Range(0, 0, cell.document.lineCount, 0); // Range covering the entire cell document
          edit.replace(cell.document.uri, fullCellRange, mqttCode);
          
          const success = await vscode.workspace.applyEdit(edit);
          if (success) {
            vscode.window.showInformationMessage(`Updated cell for ${entityType} ${entityName} from broker.`);
            // Saving will trigger parser and tree refresh
            await cell.document.save(); 
          } else {
            vscode.window.showErrorMessage('Failed to apply edit to update cell.');
          }
        } catch (error: any) {
          console.error(`Error updating cell for ${entityType} ${entityName}:`, error);
          vscode.window.showErrorMessage(`Error updating cell: ${error.message}`);
        }
      }
    }
  ));

  // (iv) Update Broker from Cell Command
  context.subscriptions.push(vscode.commands.registerCommand('coreflux.runEntityCell', 
    async (item: EntityItem) => {
      if (!item || !(item instanceof EntityItem)) {
        vscode.window.showErrorMessage('Command must be run from a Coreflux Entity item.');
        return;
      }
      const entityType = item.entityType as 'Model' | 'Action' | 'Rule' | 'Route';
      const entityName = item.entityName;

      if (!controller) {
        vscode.window.showErrorMessage('LOT Controller not available.');
        return;
      }

      const location = corefluxEntitiesProvider.getEntityLocation(entityType, entityName);
      if (!location) {
        vscode.window.showErrorMessage(`Could not find notebook location for ${entityType} ${entityName}. Try saving the notebook file.`);
        return;
      }
      
      const notebookCode = location.cellContent; // Use the full content stored during parsing

      const confirmation = await vscode.window.showWarningMessage(
        `Update the broker's code for ${entityType} '${entityName}' with the content from notebook cell ${location.cellIndex + 1}?`, 
        { modal: true }, 
        'Yes, Update Broker'
      );

      if (confirmation === 'Yes, Update Broker') {
        controller.publishUpdateEntityCommand(entityType, entityName, notebookCode);
        // Optionally: Add a small delay and refresh the tree view to show potential sync status change
        setTimeout(() => corefluxEntitiesProvider?.refresh(), 500);
      }
    }
  ));

  // --- SCL Commands (HIDDEN - Keep code for later activation) ---
  
  // TODO: Re-enable for onboarding procedures later
  const enableSCLFeatures = false; // Set to true to re-enable SCL functionality
  
  if (enableSCLFeatures) {
    // Initialize translation handlers
    const translationStatusProvider = new TranslationStatusProvider();
    const languageTranslationHandler = new LanguageTranslationHandler();
    context.subscriptions.push(translationStatusProvider);
    context.subscriptions.push(languageTranslationHandler);
    
    context.subscriptions.push(
      vscode.commands.registerCommand('scl.convertToLot', SCLCommands.convertSclToLot)
    );
    
    context.subscriptions.push(
      vscode.commands.registerCommand('scl.convertFromLot', SCLCommands.convertLotToScl)
    );
    
    context.subscriptions.push(
      vscode.commands.registerCommand('scl.translateCell', LanguageTranslationHandler.translateCurrentCell)
    );
    
    context.subscriptions.push(
      vscode.commands.registerCommand('scl.format', SCLCommands.formatScl)
    );
    
    context.subscriptions.push(
      vscode.commands.registerCommand('scl.validate', SCLCommands.validateScl)
    );
    
    context.subscriptions.push(
      vscode.commands.registerCommand('scl.createModel', SCLCommands.createSclModel)
    );
    
    context.subscriptions.push(
      vscode.commands.registerCommand('scl.createAction', SCLCommands.createSclAction)
    );
  }

  // ---> NEW: Register Apply Cell Update Command <---
  context.subscriptions.push(
    vscode.commands.registerCommand('lot.applyCellUpdate', applyCellUpdateHandler)
  );

  // Register LOT completion provider with higher priority
  const lotCompletionProvider = vscode.languages.registerCompletionItemProvider(
    { 
      scheme: 'file', 
      language: 'lot',
      pattern: '**/*.lotnb'  // Only trigger in LOT notebook files
    },
    new LOTCompletionProvider(),
    ' ', // Trigger on space
    'D', // Trigger on D for DEFINE
    'W', // Trigger on W for WITH
    'G', // Trigger on G for GET
    'P', // Trigger on P for PUBLISH
    'K', // Trigger on K for KEEP
    'C', // Trigger on C for COLLAPSED
    'I', // Trigger on I for IF
    'E', // Trigger on E for ELSE
    'T', // Trigger on T for THEN
    'O', // Trigger on O for ON
    'F'  // Trigger on F for FROM
  );
  context.subscriptions.push(lotCompletionProvider);

  // Register a second provider specifically for notebook cells
  const lotNotebookCompletionProvider = vscode.languages.registerCompletionItemProvider(
    { 
      scheme: 'vscode-notebook-cell',
      language: 'lot'
    },
    new LOTCompletionProvider(),
    ' ', // Trigger on space
    'D', // Trigger on D for DEFINE
    'W', // Trigger on W for WITH
    'G', // Trigger on G for GET
    'P', // Trigger on P for PUBLISH
    'K', // Trigger on K for KEEP
    'C', // Trigger on C for COLLAPSED
    'I', // Trigger on I for IF
    'E', // Trigger on E for ELSE
    'T', // Trigger on T for THEN
    'O', // Trigger on O for ON
    'F'  // Trigger on F for FROM
  );
  context.subscriptions.push(lotNotebookCompletionProvider);

  // SCL completion providers (HIDDEN - Keep code for later activation)
  if (enableSCLFeatures) {
    const sclCompletionProvider = vscode.languages.registerCompletionItemProvider(
      { 
        scheme: 'file', 
        language: 'scl',
        pattern: '**/*.lotnb'  // SCL can be used in LOT notebook files
      },
      new SCLCompletionProvider(),
      ' ', // Trigger on space
      'D', // Trigger on D for DEFINE
      'W', // Trigger on W for WITH
      'A', // Trigger on A for ADD
      'S', // Trigger on S for SET/STORE
      'P', // Trigger on P for PUBLISH
      'O', // Trigger on O for ON
      'I', // Trigger on I for IF
      'R', // Trigger on R for REPEAT
      'M'  // Trigger on M for MODEL
    );
    context.subscriptions.push(sclCompletionProvider);

    const sclNotebookCompletionProvider = vscode.languages.registerCompletionItemProvider(
      { 
        scheme: 'vscode-notebook-cell',
        language: 'scl'
      },
      new SCLCompletionProvider(),
      ' ', // Trigger on space
      'D', // Trigger on D for DEFINE
      'W', // Trigger on W for WITH
      'A', // Trigger on A for ADD
      'S', // Trigger on S for SET/STORE
      'P', // Trigger on P for PUBLISH
      'O', // Trigger on O for ON
      'I', // Trigger on I for IF
      'R', // Trigger on R for REPEAT
      'M'  // Trigger on M for MODEL
    );
    context.subscriptions.push(sclNotebookCompletionProvider);
  }

  // Command to create a new LOT Notebook
  context.subscriptions.push(
    vscode.commands.registerCommand('lot-notebook.new', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      let doc: vscode.NotebookDocument;
      let fileName: string;
      let createdIn: 'workspace' | 'untitled' | 'outside-workspace';
      
      if (workspaceFolder) {
        // Create walkthrough.lotnb in workspace
        const notebookUri = vscode.Uri.joinPath(workspaceFolder.uri, 'walkthrough.lotnb');
        const lotCell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, '', 'lot');
        const notebookData = new vscode.NotebookData([lotCell]);
        doc = await vscode.workspace.openNotebookDocument('lot-notebook', notebookData);
        
        // Create the file in the workspace
        await vscode.workspace.fs.writeFile(notebookUri, Buffer.from(''));
        doc = await vscode.workspace.openNotebookDocument(notebookUri);
        await vscode.window.showNotebookDocument(doc);
        
        fileName = 'walkthrough.lotnb';
        createdIn = 'workspace';
      } else {
        // Fallback to untitled
        const lotCell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, '', 'lot');
        const notebookData = new vscode.NotebookData([lotCell]);
        doc = await vscode.workspace.openNotebookDocument('lot-notebook', notebookData);
        await vscode.window.showNotebookDocument(doc);
        
        fileName = 'untitled.lotnb';
        createdIn = 'untitled';
      }
      
      // Complete onboarding step if this is from the walkthrough
      await onboardingService.completeStep('create-lot-notebook');
      
      // Emit telemetry for new file creation
      await telemetryService.emitNewFileEvent(fileName, createdIn);
    })
  );

  // --- Onboarding Commands ---
  context.subscriptions.push(
    vscode.commands.registerCommand('coreflux.openWalkthrough', () => onboardingCommands.openWalkthrough())
  );
  
  context.subscriptions.push(
    vscode.commands.registerCommand('coreflux.createMarkdownFile', () => onboardingCommands.createMarkdownFile())
  );
  
  context.subscriptions.push(
    vscode.commands.registerCommand('coreflux.connectBroker', () => onboardingCommands.connectBroker())
  );
  
  context.subscriptions.push(
    vscode.commands.registerCommand('coreflux.createTimerAction', () => onboardingCommands.createTimerAction())
  );
  
  context.subscriptions.push(
    vscode.commands.registerCommand('coreflux.uploadAction', () => onboardingCommands.uploadAction())
  );
  
  context.subscriptions.push(
    vscode.commands.registerCommand('coreflux.createModel', () => onboardingCommands.createModel())
  );
  
  context.subscriptions.push(
    vscode.commands.registerCommand('coreflux.createModelAction', () => onboardingCommands.createModelAction())
  );
  
  context.subscriptions.push(
    vscode.commands.registerCommand('coreflux.createDockerSetup', () => onboardingCommands.createDockerSetup())
  );
  
  context.subscriptions.push(
    vscode.commands.registerCommand('coreflux.setupGitRepo', () => onboardingCommands.setupGitRepo())
  );

  // Debug command to test telemetry
  context.subscriptions.push(
    vscode.commands.registerCommand('coreflux.testTelemetry', async () => {
      console.log('Testing telemetry connection...');
      console.log('Telemetry enabled:', telemetryService.isTelemetryEnabled());
      console.log('GUID:', telemetryService.getGUID());
      
      // Test startup event
      await telemetryService.emitStartupEvent();
      console.log('Startup event emitted');
      
      // Test new file event
      await telemetryService.emitNewFileEvent('test.lotnb', 'workspace');
      console.log('New file event emitted');
      
      vscode.window.showInformationMessage('Telemetry test completed. Check console for details.');
    })
  );

  // --- Broker Connection Commands ---
  context.subscriptions.push(
    vscode.commands.registerCommand('coreflux.handleBrokerStatusClick', () => brokerConnectionManager.handleStatusBarClick())
  );
  
  context.subscriptions.push(
    vscode.commands.registerCommand('coreflux.disconnectBroker', () => brokerConnectionManager.disconnect())
  );


  // Controller is already created and registered earlier in the activation

  // --- Configuration Change Listener for Experimental Features ---
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('lotNotebook.experimentalFeatures.anselmoChatbot')) {
        console.log('[Extension] Anselmo experimental feature configuration changed');
        // Refresh the UI to show/hide Anselmo buttons
        vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    })
  );
}

/**
 * Helper function to handle the confirmation and publishing for remove all commands.
 * @param entityType User-friendly name (e.g., "Models")
 * @param command The MQTT command string (e.g., "-removeAllModels")
 */
async function handleRemoveAllCommand(entityType: string, command: string) {
  if (!controller) {
    vscode.window.showErrorMessage('LOT Controller not available.');
    return;
  }

  const confirmation = await vscode.window.showWarningMessage(
    `Are you sure you want to remove ALL ${entityType} from the broker? This action cannot be undone.`,
    { modal: true }, // Make it modal
    'Yes, Remove All' // Confirmation button text
  );

  if (confirmation === 'Yes, Remove All') {
    const published = controller.publishSysCommand(command);
    if (published) {
      // Error message already shown by publishSysCommand if not connected
      // ---> NEW: Clear the corresponding category in the provider
      if (corefluxEntitiesProvider && (entityType === 'Models' || entityType === 'Actions' || entityType === 'Rules' || entityType === 'Routes')) {
        console.log(`[Extension] Remove All ${entityType}: Clearing provider category.`);
        corefluxEntitiesProvider.clearCategory(entityType);
      } else {
        console.warn(`[Extension] Could not clear category '${entityType}' - provider or type invalid.`);
      }
      // Provider's clearCategory already calls refresh()
    } else {
      // If publish failed, don't clear the local view
      console.log(`[Extension] Remove All ${entityType}: Publish failed, not clearing provider category.`);
    }
  } else {
    vscode.window.showInformationMessage(`Remove all ${entityType} cancelled.`);
  }
}

// --- Status Bar Update Function ---
function updateStatusBar(status: 'connected' | 'disconnected' | 'connecting', brokerUrl?: string | null): void {
  if (!connectionStatusBarItem) return;

  if (status === 'connected') {
    const urlToShow = brokerUrl ? ` to ${brokerUrl}` : '';
    connectionStatusBarItem.text = `$(vm-connect) MQTT: Connected${urlToShow}`;
    connectionStatusBarItem.tooltip = `Connected to MQTT broker: ${brokerUrl || 'Unknown'}\nClick to disconnect or change broker.`;
    connectionStatusBarItem.backgroundColor = undefined;
  } else if (status === 'disconnected') {
    connectionStatusBarItem.text = `$(vm-disconnected) MQTT: Disconnected`;
    connectionStatusBarItem.tooltip = 'MQTT broker disconnected. Click to connect to a broker.';
    connectionStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  } else { // connecting
    connectionStatusBarItem.text = `$(sync~spin) MQTT: Connecting...`;
    connectionStatusBarItem.tooltip = `Attempting to connect to MQTT broker...\nClick to cancel or change broker.`;
    connectionStatusBarItem.backgroundColor = undefined;
  }
  connectionStatusBarItem.show();
}

// --- UPDATED FUNCTION TO READ HTML AND INJECT RESOURCES --- 
function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const htmlPathOnDisk = vscode.Uri.joinPath(extensionUri, 'webview', 'chat.html');
  const scriptPathOnDisk = vscode.Uri.joinPath(extensionUri, 'webview', 'chat.js');
  const stylesPathOnDisk = vscode.Uri.joinPath(extensionUri, 'webview', 'chat.css');

  // Generate URIs to use in the webview
  const scriptUri = webview.asWebviewUri(scriptPathOnDisk);
  const stylesUri = webview.asWebviewUri(stylesPathOnDisk);

  // Generate nonce for inline scripts/styles (optional but recommended for security)
  const nonce = getNonce();

  try {
    let htmlContent = fs.readFileSync(htmlPathOnDisk.fsPath, 'utf8');

    // Replace placeholders with actual URIs and nonce
    htmlContent = htmlContent.replace('${stylesUri}', stylesUri.toString());
    htmlContent = htmlContent.replace('${scriptUri}', scriptUri.toString());
    htmlContent = htmlContent.replace('${nonce}', nonce);
    // Inject CSP meta tag (adjust default-src as needed for CDNs or other resources)
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource} https://cdn.jsdelivr.net; img-src ${webview.cspSource};">`;
    htmlContent = htmlContent.replace(
      '<!-- CSP Source MUST be specified in the meta tag -->',
      csp
    );
    htmlContent = htmlContent.replace(
      '<!-- <meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src ${webview.cspSource}; script-src \'nonce-${nonce}\';"> -->',
      '' // Remove placeholder comment
    );


    return htmlContent;
  } catch (err) {
    console.error("Error reading webview HTML file:", err);
    return `<html><body>Error loading webview content: ${err}</body></html>`;
  }
}

// Function to generate a random nonce value
function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// ---> NEW: Handler function for applying cell updates <---
async function applyCellUpdateHandler(cellIndex: number, newContent: string) {
  console.log(`[applyCellUpdate] Handler started for cell ${cellIndex}.`);
  if (associatedNotebookUri === undefined) {
    vscode.window.showErrorMessage('Cannot apply update: No associated notebook found for this chat panel.');
    console.error('[applyCellUpdate] Error: associatedNotebookUri is undefined.');
    return;
  }

  try {
    const notebookDoc = await vscode.workspace.openNotebookDocument(associatedNotebookUri);
        
    if (cellIndex < 0 || cellIndex >= notebookDoc.cellCount) {
      vscode.window.showErrorMessage(`Cannot apply update: Invalid cell index ${cellIndex} for notebook ${path.basename(associatedNotebookUri.fsPath)}.`);
      console.error(`[applyCellUpdate] Error: Invalid cell index ${cellIndex} (max: ${notebookDoc.cellCount - 1}) for URI ${associatedNotebookUri.fsPath}`);
      return;
    }

    const cell = notebookDoc.cellAt(cellIndex);
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(0, 0, cell.document.lineCount, 0); 
        
    console.log(`[applyCellUpdate] Preparing to replace content of cell ${cellIndex} in ${associatedNotebookUri.fsPath}`);
    edit.replace(cell.document.uri, fullRange, newContent);
        
    const success = await vscode.workspace.applyEdit(edit);

    if (success) {
      console.log(`[applyCellUpdate] Successfully applied edit for cell ${cellIndex}. Saving...`);
      await cell.document.save(); 
      vscode.window.showInformationMessage(`Successfully updated Cell ${cellIndex + 1}.`);
    } else {
      console.error(`[applyCellUpdate] Failed to apply WorkspaceEdit for cell ${cellIndex}.`);
      vscode.window.showErrorMessage(`Failed to apply update to Cell ${cellIndex + 1}.`);
    }

  } catch (error: any) {
    console.error(`[applyCellUpdate] Error during update process for cell ${cellIndex}:`, error);
    vscode.window.showErrorMessage(`An error occurred while trying to update Cell ${cellIndex + 1}: ${error.message}`);
  }
}

export function deactivate() {
  console.log('Deactivating LOT Notebook extension.');
  connectionStatusBarItem?.dispose();
  
  // Dispose telemetry service
  const telemetryService = TelemetryService.getInstance({} as vscode.ExtensionContext);
  telemetryService.dispose();
}