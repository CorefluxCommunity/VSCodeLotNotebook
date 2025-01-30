// src/extension.ts
import * as vscode from 'vscode';
import LOTSerializer from './LOTSerializer';
import LOTController from './LOTController';
import { MqttTopicProvider } from './MqttTopicProvider';
import { changeBrokerCredentials } from './credentials';
import { LotTopicTreeProvider } from './LOTTopicTreeProvider';
// We'll store topic => payload in a global Map, which the TreeView can access
const payloadMap = new Map<string, string>();

export function activate(context: vscode.ExtensionContext) {
  console.log('LOT Notebook extension is now active!');
  const treeProvider = new LotTopicTreeProvider();
  vscode.window.registerTreeDataProvider('lotLiveTree', treeProvider);
  // Create a TreeView for MQTT Topics, passing 'payloadMap'
  const topicProvider = new MqttTopicProvider(context, payloadMap);


  // Command to create a new .lnt notebook
  const createNotebookCommand = vscode.commands.registerCommand('lot-notebook.create', async () => {
    const uri = vscode.Uri.parse('untitled:' + 'notebook.lnt');
    await vscode.commands.executeCommand('vscode.openWith', uri, 'lot-notebook');
  });
  context.subscriptions.push(createNotebookCommand);

  // Command to manually change broker credentials
  const changeCredsCommand = vscode.commands.registerCommand(
    'lot-notebook.changeCredentials',
    async () => {
      try {
        await changeBrokerCredentials(context);
        vscode.window.showInformationMessage('MQTT credentials updated successfully!');
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to change credentials: ${err.message}`);
      }
    }
  );
  context.subscriptions.push(changeCredsCommand);

  // Register Notebook serializer
  context.subscriptions.push(
    vscode.workspace.registerNotebookSerializer('lot-notebook', new LOTSerializer())
  );

  // Create our Notebook controller, passing the context, the topicProvider & payloadMap
  const controller = new LOTController(context, topicProvider, payloadMap);
  context.subscriptions.push(controller);

  // Command used by the TreeView item to open payload
  const openPayloadCommand = vscode.commands.registerCommand('lot.openTopicPayload', async (topicName: string) => {
    const payload = payloadMap.get(topicName) ?? '';
    // Show the payload in an input box or a text document
    const newPayload = await vscode.window.showInputBox({
      value: payload,
      prompt: `Payload for topic '${topicName}' (edit and press Enter to update)`,
    });
    if (newPayload !== undefined && newPayload !== payload) {
      // user changed it, maybe we want to publish the update
      payloadMap.set(topicName, newPayload);
      // If connected, publish back?
      vscode.window.showInformationMessage(`Updated payload for topic '${topicName}' to: ${newPayload}`);
      // Optionally publish the new payload to the broker here if desired...
    }
  });
  context.subscriptions.push(openPayloadCommand);


  const openChatbotCmd = vscode.commands.registerCommand('lot.openChatbot', () => {
    // e.g. show a message
    vscode.window.showInformationMessage('Opening Chatbot...');

    // OR open a new WebviewPanel:
    /*
    const panel = vscode.window.createWebviewPanel(
      'chatbot',
      'Chatbot',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );
    panel.webview.html = `<!DOCTYPE html>
    <html>
    <body>
      <h3>Chatbot Panel</h3>
 <script async
  src="https://agent-5d3c727bd8b41955c59b-yrmfk.ondigitalocean.app/static/chatbot/widget.js"
  data-agent-id="5aedfc61-dcef-11ef-bf8f-4e013e2ddde4"
  data-chatbot-id="H0Q2GHxPQlOwujN7Y4Olq71gTPcFl7vo"
  data-name="agent-01272025 Chatbot"
  data-primary-color="#031B4E"
  data-secondary-color="#E5E8ED"
  data-button-background-color="#0061EB"
  data-starting-message="Hello! How can I help you today?"
  data-logo="/static/chatbot/icons/default-agent.svg">
</script>
    </body>
    </html>`;
    */

  });
  context.subscriptions.push(openChatbotCmd);
}

export function deactivate() {
  // ...
}
