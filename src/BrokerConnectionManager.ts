// src/BrokerConnectionManager.ts
import * as vscode from 'vscode';
import * as path from 'path';
import LOTController from './LOTController';

export class BrokerConnectionManager {
  private static instance: BrokerConnectionManager;
  private controller: LOTController;
  private isConnected = false;
  private currentBrokerUrl: string | null = null;

  private constructor(controller: LOTController) {
    this.controller = controller;
    
    // Listen to controller events
    this.controller.on('connected', (client, brokerUrl) => {
      this.isConnected = true;
      this.currentBrokerUrl = brokerUrl;
    });
    
    this.controller.on('disconnected', () => {
      this.isConnected = false;
      this.currentBrokerUrl = null;
    });
  }

  public static getInstance(controller: LOTController): BrokerConnectionManager {
    if (!BrokerConnectionManager.instance) {
      BrokerConnectionManager.instance = new BrokerConnectionManager(controller);
    }
    return BrokerConnectionManager.instance;
  }

  public async handleStatusBarClick(): Promise<void> {
    if (this.isConnected) {
      // Show disconnect/change options
      const action = await vscode.window.showQuickPick([
        {
          label: '$(vm-disconnected) Disconnect',
          description: 'Disconnect from the current MQTT broker',
          action: 'disconnect'
        },
        {
          label: '$(vm-connect) Change Broker',
          description: 'Connect to a different MQTT broker',
          action: 'change'
        }
      ], {
        placeHolder: `Currently connected to ${this.currentBrokerUrl}`,
        title: 'MQTT Broker Connection'
      });

      if (action?.action === 'disconnect') {
        await this.disconnect();
      } else if (action?.action === 'change') {
        await this.showConnectionDialog();
      }
    } else if (this.controller.isConnecting()) {
      // Show cancel/change options when connecting
      const action = await vscode.window.showQuickPick([
        {
          label: '$(vm-disconnected) Cancel Connection',
          description: 'Stop the current connection attempt',
          action: 'cancel'
        },
        {
          label: '$(vm-connect) Change Broker',
          description: 'Connect to a different MQTT broker',
          action: 'change'
        }
      ], {
        placeHolder: 'Currently connecting...',
        title: 'MQTT Broker Connection'
      });

      if (action?.action === 'cancel') {
        await this.disconnect();
      } else if (action?.action === 'change') {
        await this.disconnect();
        await this.showConnectionDialog();
      }
    } else {
      // Show connection dialog
      await this.showConnectionDialog();
    }
  }

  public async disconnect(): Promise<void> {
    try {
      this.controller.disconnect();
      vscode.window.showInformationMessage('Disconnected from MQTT broker');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to disconnect: ${error}`);
    }
  }

  public async showConnectionDialog(): Promise<void> {
    try {
      // Get default broker URL from .broker file
      const defaultBrokerUrl = await this.getDefaultBrokerUrl();
      
      // Show broker URL input
      const brokerUrl = await vscode.window.showInputBox({
        prompt: 'Enter MQTT broker URL',
        placeHolder: 'mqtt://localhost:1883 or mqtts://broker.example.com:8883',
        value: defaultBrokerUrl,
        validateInput: (value) => {
          if (!value) return 'Broker URL is required';
          if (!value.startsWith('mqtt://') && !value.startsWith('mqtts://') && !value.startsWith('ws://') && !value.startsWith('wss://')) {
            return 'URL must start with mqtt://, mqtts://, ws://, or wss://';
          }
          return null;
        }
      });

      if (!brokerUrl) return;

      // Save broker URL to .broker file (without credentials)
      await this.saveBrokerUrl(brokerUrl);

      // Check if credentials are needed
      const needsCredentials = await vscode.window.showQuickPick([
        { label: 'No authentication', description: 'Connect without username/password', value: false },
        { label: 'Username and password', description: 'Connect with authentication', value: true }
      ], {
        placeHolder: 'Does this broker require authentication?'
      });

      if (needsCredentials === undefined) return;

      let username: string | undefined;
      let password: string | undefined;

      if (needsCredentials.value) {
        username = await vscode.window.showInputBox({
          prompt: 'Enter username',
          placeHolder: 'MQTT username'
        });

        if (username === undefined) return;

        password = await vscode.window.showInputBox({
          prompt: 'Enter password',
          placeHolder: 'MQTT password',
          password: true
        });

        if (password === undefined) return;
      }

      // Connect to broker
      await this.connect(brokerUrl, username, password);

    } catch (error) {
      vscode.window.showErrorMessage(`Connection failed: ${error}`);
    }
  }

  private async connect(brokerUrl: string, username?: string, password?: string): Promise<void> {
    // Use the existing controller connection method
    this.controller.connectWithCredentials(brokerUrl, username, password);
  }

  private async getDefaultBrokerUrl(): Promise<string> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return 'mqtt://localhost:1883'; // Default fallback
      }

      const brokerFilePath = vscode.Uri.joinPath(workspaceFolder.uri, '.broker');
      
      try {
        const brokerFileContent = await vscode.workspace.fs.readFile(brokerFilePath);
        const brokerUrl = new TextDecoder().decode(brokerFileContent).trim();
        
        if (brokerUrl && (brokerUrl.startsWith('mqtt://') || brokerUrl.startsWith('mqtts://') || 
                         brokerUrl.startsWith('ws://') || brokerUrl.startsWith('wss://'))) {
          return brokerUrl;
        }
      } catch (error) {
        // .broker file doesn't exist or can't be read, use default
      }

      return 'mqtt://localhost:1883';
    } catch (error) {
      return 'mqtt://localhost:1883';
    }
  }

  private async saveBrokerUrl(brokerUrl: string): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return; // Can't save without workspace
      }

      const brokerFilePath = vscode.Uri.joinPath(workspaceFolder.uri, '.broker');
      const content = new TextEncoder().encode(brokerUrl);
      
      await vscode.workspace.fs.writeFile(brokerFilePath, content);
      
      console.log(`Saved broker URL to .broker file: ${brokerUrl}`);
    } catch (error) {
      console.error('Failed to save broker URL to .broker file:', error);
      // Don't show error to user as this is not critical
    }
  }

  public isCurrentlyConnected(): boolean {
    return this.isConnected;
  }

  public getCurrentBrokerUrl(): string | null {
    return this.currentBrokerUrl;
  }
}