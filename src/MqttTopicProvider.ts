// src/MqttTopicProvider.ts
import * as vscode from 'vscode';
import * as path from 'path';

export class TopicItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly topic: string,
    private context: vscode.ExtensionContext
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);

    this.iconPath = {
      light: vscode.Uri.file(path.join(context.extensionPath, 'images', 'CF_icon.svg')),
      dark: vscode.Uri.file(path.join(context.extensionPath, 'images', 'CF_icon.svg'))
    };

    // The user can click this item in the tree to open the payload
    this.command = {
      command: 'lot.openTopicPayload',
      title: 'Open Topic Payload',
      arguments: [this.topic]
    };

    this.contextValue = 'mqttTopicItem';
  }
}

export class MqttTopicProvider implements vscode.TreeDataProvider<TopicItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TopicItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private topics: Set<string> = new Set();

  constructor(
    private context: vscode.ExtensionContext,
    private payloadMap: Map<string, string>
  ) { }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  addTopic(topic: string): void {
    if (!this.topics.has(topic)) {
      this.topics.add(topic);
      this.refresh();
    }
  }

  clearTopics(): void {
    this.topics.clear();
    this.refresh();
  }

  getTreeItem(element: TopicItem): vscode.TreeItem {
    return element;
  }

  getChildren(): Thenable<TopicItem[]> {
    const items = Array.from(this.topics).map(
      t => new TopicItem(t, t, this.context)
    );
    return Promise.resolve(items);
  }
}
