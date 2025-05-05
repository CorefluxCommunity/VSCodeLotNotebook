// src/credentials.ts
import * as vscode from 'vscode';

// Keys for storing credentials and settings
const KEY_BROKER_URL = 'mqttBrokerUrl';
const KEY_USERNAME = 'mqttUsername';
const KEY_PASSWORD = 'mqttPassword'; // Stored in secrets
const KEY_USE_TLS = 'mqttUseTls';
const KEY_CA_PATH = 'mqttCaPath';
const KEY_CERT_PATH = 'mqttCertPath';
const KEY_KEY_PATH = 'mqttKeyPath';
const KEY_REJECT_UNAUTHORIZED = 'mqttRejectUnauthorized';

/**
 * Represents the MQTT connection details, including TLS options.
 */
export interface MqttCredentials {
  brokerUrl: string;
  username: string;
  password?: string;
  useTls: boolean;
  caPath?: string | null; // Allow null to indicate not provided
  certPath?: string | null;
  keyPath?: string | null;
  rejectUnauthorized: boolean;
}

/**
 * Clears stored credentials and TLS settings, then re-prompts the user.
 */
export async function changeBrokerCredentials(context: vscode.ExtensionContext): Promise<MqttCredentials> {
  // Clear existing settings
  await context.globalState.update(KEY_BROKER_URL, undefined);
  await context.globalState.update(KEY_USERNAME, undefined);
  await context.secrets.delete(KEY_PASSWORD);
  await context.globalState.update(KEY_USE_TLS, undefined);
  await context.globalState.update(KEY_CA_PATH, undefined);
  await context.globalState.update(KEY_CERT_PATH, undefined);
  await context.globalState.update(KEY_KEY_PATH, undefined);
  await context.globalState.update(KEY_REJECT_UNAUTHORIZED, undefined);

  // Force prompting by passing true
  return getOrPromptBrokerCredentials(context, true);
}

/**
 * Retrieve credentials and TLS settings from storage, or prompt the user if missing or forced.
 * @param context - The extension context.
 * @param forcePrompt - If true, always prompt the user for all settings.
 */
export async function getOrPromptBrokerCredentials(context: vscode.ExtensionContext, forcePrompt: boolean = false): Promise<MqttCredentials> {
  let brokerUrl = context.globalState.get<string>(KEY_BROKER_URL);
  let username = context.globalState.get<string>(KEY_USERNAME);
  let password = await context.secrets.get(KEY_PASSWORD);
  let useTls = context.globalState.get<boolean>(KEY_USE_TLS);
  // Retrieve potentially null paths
  let caPath = context.globalState.get<string | null>(KEY_CA_PATH);
  let certPath = context.globalState.get<string | null>(KEY_CERT_PATH);
  let keyPath = context.globalState.get<string | null>(KEY_KEY_PATH);
  let rejectUnauthorized = context.globalState.get<boolean>(KEY_REJECT_UNAUTHORIZED);

  // Determine if prompting is needed
  const needsPrompting = forcePrompt || !brokerUrl || !username || password === undefined || useTls === undefined ||
                         (useTls && (caPath === undefined || certPath === undefined || keyPath === undefined || rejectUnauthorized === undefined));

  if (needsPrompting) {
    console.log('Prompting for MQTT credentials and TLS settings...');

    // --- Broker URL ---
    brokerUrl = await vscode.window.showInputBox({
      prompt: 'Enter MQTT broker address (e.g., mqtt://localhost:1883 or mqtts://secure.broker.com:8883)',
      placeHolder: 'mqtt://localhost:1883',
      value: brokerUrl || '',
      ignoreFocusOut: true,
    });
    if (!brokerUrl) throw new Error('MQTT broker URL not provided.');
    await context.globalState.update(KEY_BROKER_URL, brokerUrl);

    // --- Username ---
    username = await vscode.window.showInputBox({
      prompt: 'Enter MQTT username',
      placeHolder: 'user',
      value: username || '',
      ignoreFocusOut: true,
    });
    if (!username) throw new Error('MQTT username not provided.');
    await context.globalState.update(KEY_USERNAME, username);

    // --- Password ---
    password = await vscode.window.showInputBox({
      prompt: 'Enter MQTT password (leave blank if none)',
      placeHolder: 'password',
      password: true,
      value: password || '',
      ignoreFocusOut: true,
    });
    await context.secrets.store(KEY_PASSWORD, password || ''); // Store empty string if blank

    // --- Use TLS? ---
    const tlsChoiceItem = await vscode.window.showQuickPick<vscode.QuickPickItem & { value: boolean }>([
      { label: 'Yes', value: true },
      { label: 'No', value: false }
    ], {
      placeHolder: 'Use TLS/SSL connection?',
      ignoreFocusOut: true,
    });
    if (!tlsChoiceItem) throw new Error('TLS choice not made.');
    useTls = tlsChoiceItem.value;
    await context.globalState.update(KEY_USE_TLS, useTls);

    if (useTls) {
      // --- CA Certificate ---
      const provideCaItem = await vscode.window.showQuickPick<vscode.QuickPickItem & { value: boolean }>([
        { label: 'Yes', value: true },
        { label: 'No', value: false }
      ], {
        placeHolder: 'Provide CA certificate file? (Needed for private/self-signed server certs)',
        ignoreFocusOut: true,
      });
      if (provideCaItem?.value) {
        caPath = await promptForFilePath('Select CA Certificate File');
        await context.globalState.update(KEY_CA_PATH, caPath); // Stores path string or null
      } else {
        caPath = null;
        await context.globalState.update(KEY_CA_PATH, caPath);
      }

      // --- Client Certificate & Key ---
      const provideClientCertItem = await vscode.window.showQuickPick<vscode.QuickPickItem & { value: boolean }>([
        { label: 'Yes', value: true },
        { label: 'No', value: false }
      ], {
        placeHolder: 'Provide client certificate file? (For mutual TLS)',
        ignoreFocusOut: true,
      });
      if (provideClientCertItem?.value) {
        certPath = await promptForFilePath('Select Client Certificate File');
        await context.globalState.update(KEY_CERT_PATH, certPath);

        if (certPath) { // Only ask for key if cert was actually selected
          const provideClientKeyItem = await vscode.window.showQuickPick<vscode.QuickPickItem & { value: boolean }>([
            { label: 'Yes', value: true },
            { label: 'No', value: false }
          ], {
            placeHolder: 'Provide client key file? (Required with client certificate)',
            ignoreFocusOut: true,
          });
          if (provideClientKeyItem?.value) {
            keyPath = await promptForFilePath('Select Client Key File');
            await context.globalState.update(KEY_KEY_PATH, keyPath);
          } else {
            keyPath = null;
            await context.globalState.update(KEY_KEY_PATH, keyPath);
            vscode.window.showWarningMessage('Client certificate provided without a corresponding key file.');
          }
        } else { // Cert selection was cancelled
          keyPath = null;
          await context.globalState.update(KEY_KEY_PATH, keyPath);
        }
      } else { // Didn't want to provide client cert
        certPath = null;
        keyPath = null;
        await context.globalState.update(KEY_CERT_PATH, certPath);
        await context.globalState.update(KEY_KEY_PATH, keyPath);
      }

      // --- Server Validation ---
      const strictValidationItem = await vscode.window.showQuickPick<vscode.QuickPickItem & { value: boolean }>([
        { label: 'Yes', description: 'Recommended', value: true },
        { label: 'No', description: 'Less secure - only for self-signed certs without CA', value: false }
      ], {
        placeHolder: 'Strictly validate server certificate?',
        ignoreFocusOut: true,
      });
      if (!strictValidationItem) throw new Error('Server validation choice not made.');
      rejectUnauthorized = strictValidationItem.value;
      await context.globalState.update(KEY_REJECT_UNAUTHORIZED, rejectUnauthorized);

    } else { // Not using TLS
      // Clear TLS-specific settings from storage and local vars
      caPath = null;
      certPath = null;
      keyPath = null;
      rejectUnauthorized = true; // Default validation state (irrelevant without TLS)
      await context.globalState.update(KEY_CA_PATH, undefined);
      await context.globalState.update(KEY_CERT_PATH, undefined);
      await context.globalState.update(KEY_KEY_PATH, undefined);
      await context.globalState.update(KEY_REJECT_UNAUTHORIZED, undefined);
    }
  } else {
    // Loaded from storage, ensure defaults for potentially missing values
    if (rejectUnauthorized === undefined) rejectUnauthorized = true;
    // Convert empty string password back to undefined
    if (password === '') password = undefined;
  }

  return {
    brokerUrl: brokerUrl!,
    username: username!,
    password: password || undefined,
    useTls: useTls!,
    caPath: caPath,
    certPath: certPath,
    keyPath: keyPath,
    rejectUnauthorized: rejectUnauthorized,
  };
}

/**
 * Helper function to prompt user to select a file.
 * Returns the file path as a string, or null if cancelled.
 */
async function promptForFilePath(title: string): Promise<string | null> {
  const options: vscode.OpenDialogOptions = {
    canSelectMany: false,
    openLabel: title,
    canSelectFiles: true,
    canSelectFolders: false
  };

  const fileUris = await vscode.window.showOpenDialog(options); // Returns Uri[] or undefined
  if (fileUris && fileUris.length > 0) {
    return fileUris[0].fsPath; // Return the path of the first selected file
  }
  return null; // Return null if no file was selected or dialog was cancelled
}
