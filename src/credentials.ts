// src/credentials.ts
import * as vscode from 'vscode';

/**
 * Prompt the user for broker credentials (URL & password),
 * store them in globalState & secrets, and return them.
 */
export async function changeBrokerCredentials(context: vscode.ExtensionContext) {
  // Clear existing so we definitely re-prompt
  await context.globalState.update('mqttBrokerUrl', undefined);
  await context.secrets.delete('mqttPassword');

  return getOrPromptBrokerCredentials(context);
}

/**
 * Retrieve the broker credentials from globalState/secrets, or prompt if missing.
 */
export async function getOrPromptBrokerCredentials(context: vscode.ExtensionContext): Promise<{
  brokerUrl: string;
  username: string;
  password: string;
}> {
  let brokerUrl = context.globalState.get<string>('mqttBrokerUrl');
  let password = await context.secrets.get('mqttPassword');
  const username = 'root';

  if (!brokerUrl) {
    brokerUrl = await vscode.window.showInputBox({
      prompt: 'Enter MQTT broker address (e.g. mqtt://localhost:1883)',
      placeHolder: 'mqtt://localhost:1883'
    });
    if (!brokerUrl) {
      throw new Error('MQTT broker URL not provided.');
    }
    await context.globalState.update('mqttBrokerUrl', brokerUrl);
  }

  if (!password) {
    password = await vscode.window.showInputBox({
      prompt: 'Enter MQTT password',
      placeHolder: 'secretpass',
      password: true
    });
    if (!password) {
      throw new Error('MQTT password not provided.');
    }
    await context.secrets.store('mqttPassword', password);
  }

  return {
    brokerUrl,
    username,
    password
  };
}
