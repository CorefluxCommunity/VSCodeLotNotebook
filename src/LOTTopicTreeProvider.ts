// src/LotTopicTreeProvider.ts

import * as vscode from 'vscode';

/**
 * Represents a node in the tree: either a folder/branch or a leaf with a payload.
 */
export class TreeNode {
  public children: Map<string, TreeNode> = new Map();
  public payload?: string; // For leaf nodes that store a payload
  constructor(
    public readonly label: string,
    public readonly id: string, // Unique ID to preserve expansion
  ) {}
}

export class LotTopicTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined> = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined> = this._onDidChangeTreeData.event;

  // Root node can represent the entire tree
  private _root = new TreeNode('root', 'root-id');

  getTreeItem(element: TreeNode): vscode.TreeItem {
    const hasChildren = element.children.size > 0;

    const treeItem = new vscode.TreeItem(
      element.label,
      hasChildren
        ? vscode.TreeItemCollapsibleState.Expanded // default to expanded
        : vscode.TreeItemCollapsibleState.None
    );
    treeItem.id = element.id; // preserve expansions
    treeItem.contextValue = 'lotTopic'; // For any right-click commands if needed

    // If it's a leaf with a payload, show it as a description or tooltip
    if (element.payload) {
      treeItem.description = element.payload; 
      // or: treeItem.tooltip = `Payload: ${element.payload}`;
    }

    return treeItem;
  }

  getChildren(element?: TreeNode): Thenable<TreeNode[]> {
    if (!element) {
      // Return children of the root
      return Promise.resolve(Array.from(this._root.children.values()));
    } else {
      // Return this node's children
      return Promise.resolve(Array.from(element.children.values()));
    }
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Insert or update a topic with its payload in the tree.
   * E.g., "sensors/home/livingroom" => split by '/'
   */
  public insertTopic(topic: string, payload: string): void {
    const parts = topic.split('/');

    let current: TreeNode = this._root;
    let currPath = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currPath = currPath ? `${currPath}/${part}` : part;

      let child = current.children.get(part);
      if (!child) {
        child = new TreeNode(part, currPath);
        current.children.set(part, child);
      }
      current = child;
    }
    // At the end, store the payload
    current.payload = payload;

    // Trigger a tree refresh
    this.refresh();
  }
}
