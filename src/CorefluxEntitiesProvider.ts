// src/CorefluxEntitiesProvider.ts
import * as vscode from 'vscode';
import { EventEmitter } from 'events'; // Import EventEmitter

/**
 * Represents an entity (Model, Action, Rule, Route) or a description in the tree.
 */
export class EntityItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly entityType: 'Model' | 'Action' | 'Rule' | 'Route' | 'Description' | 'Category',
    public readonly entityName: string, // e.g., MyModel, MyAction
    public readonly topic: string | null, // Full topic for this item, null for categories
    public readonly payload: string | null, // Code or description payload, null for categories
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command // Command for clicking the item
  ) {
    super(label, collapsibleState);
    this.tooltip = topic ? `${this.entityType}: ${this.label}\nTopic: ${topic}` : `${this.entityType}: ${this.label}`;
    this.description = entityType === 'Description' ? '(Description)' : '';

    // Define context value for enabling commands in package.json
    if (entityType !== 'Category' && entityType !== 'Description') {
      this.contextValue = 'corefluxEntityItem'; // Can be used for 'when' clauses
    } else if (entityType === 'Description') {
      this.contextValue = 'corefluxEntityDescriptionItem';
    } else {
      this.contextValue = 'corefluxEntityCategory';
    }

  }

  // Optional: Add icons based on type
  // iconPath = {
  //   light: path.join(__filename, '..', '..', 'resources', 'light', `${this.entityType.toLowerCase()}.svg`),
  //   dark: path.join(__filename, '..', '..', 'resources', 'dark', `${this.entityType.toLowerCase()}.svg`)
  // };
}

/**
 * Represents the location of an entity definition within a notebook cell.
 */
interface EntityNotebookLocation {
  notebookUri: vscode.Uri;
  cellIndex: number;
  rangeInCell: vscode.Range;
  cellContent: string; // Add content of the cell where definition was found
}

/**
 * TreeDataProvider for Coreflux entities (Models, Actions, Rules, Routes).
 */
export class CorefluxEntitiesProvider extends EventEmitter implements vscode.TreeDataProvider<EntityItem> { // Extend EventEmitter

  private _onDidChangeTreeData: vscode.EventEmitter<EntityItem | undefined | void> = new vscode.EventEmitter<EntityItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<EntityItem | undefined | void> = this._onDidChangeTreeData.event;

  // Internal data structure to hold entities from MQTT
  private entities: {
    Models: Map<string, { code?: string; description?: string }>;
    Actions: Map<string, { code?: string; description?: string }>;
    Rules: Map<string, { code?: string; description?: string }>;
    Routes: Map<string, { code?: string; description?: string }>;
  } = {
      Models: new Map(),
      Actions: new Map(),
      Rules: new Map(),
      Routes: new Map(),
    };

  // Structure to hold entity locations parsed from notebook files
  // Key: document.uri.toString(), Value: Map<string, EntityNotebookLocation> (Inner Key: "Model/MyModel")
  private entityLocations: Map<string, Map<string, EntityNotebookLocation>> = new Map();

  constructor(private context: vscode.ExtensionContext) {
    super(); // Call EventEmitter constructor
    // Placeholder: Initialize MQTT subscription here or via a separate method
    console.log('CorefluxEntitiesProvider initialized.');
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
    this.emit('entitiesUpdated'); // Emit event on manual refresh too
  }

  getTreeItem(element: EntityItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: EntityItem): Thenable<EntityItem[]> {
    if (!element) {
      // Root level: Show categories with inline command icon
      const categories = ['Models', 'Actions', 'Rules', 'Routes'];
      const items: EntityItem[] = categories.map(catLabel => {
        let commandId: string | undefined;
        let tooltipSuffix = '';
        switch (catLabel) {
        case 'Models':
          commandId = 'coreflux.removeAllModels';
          tooltipSuffix = 'Click 🗑️ to remove all models';
          break;
        case 'Actions':
          commandId = 'coreflux.removeAllActions';
          tooltipSuffix = 'Click 🗑️ to remove all actions';
          break;
        case 'Routes':
          commandId = 'coreflux.removeAllRoutes';
          tooltipSuffix = 'Click 🗑️ to remove all routes';
          break;
          // Add case for 'Rules' if needed
        }

        const itemCommand: vscode.Command | undefined = commandId ? {
          command: commandId,
          title: `Remove All ${catLabel}`, // Title for the command execution
          // No arguments needed here, command handler knows what to do
        } : undefined;

        // Add icon to label if command exists
        const labelWithIcon = commandId ? `${catLabel}  🗑️` : catLabel;
        const fullTooltip = itemCommand ? `${catLabel}\n${tooltipSuffix}` : catLabel;

        const item = new EntityItem(
          labelWithIcon,
          'Category',
          catLabel, // Original name without icon
          null,
          null,
          vscode.TreeItemCollapsibleState.Collapsed,
          itemCommand // Assign the command here
        );
        item.tooltip = fullTooltip; // Set custom tooltip
        return item;
      });

      return Promise.resolve(items.filter(cat => this.entities[cat.entityName as keyof typeof this.entities].size > 0));

    } else if (element.entityType === 'Category') {
      // Children of a category: Show entity names with status and commands
      const entityMap = this.entities[element.entityName as keyof typeof this.entities];
      const items = Array.from(entityMap.entries()).map(([name, data]) => {
        const topic = `$SYS/Coreflux/${element.entityName}/${name}`;
        const collapsible = data.description ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
        const singleEntityType = element.entityName.slice(0, -1) as 'Model' | 'Action' | 'Rule' | 'Route';

        // --- Determine Status (Missing, Synced, Unsynced) ---
        const location = this.getEntityLocation(singleEntityType, name);
        let status: 'missing' | 'synced' | 'unsynced';
        let statusDescription: string;
        let iconName: string;
        let iconColorId: string; // Theme color ID
        let contextValue: string;

        if (!location) {
          status = 'missing';
          statusDescription = 'Missing from notebook';
          iconName = 'error';
          iconColorId = 'errorForeground'; // Standard error color
          contextValue = 'corefluxEntityItemMissing,corefluxEntityItemBase';
        } else {
          // Found in notebook, check if synced
          const notebookCode = location.cellContent; // Get stored cell content
          const mqttCode = data.code;

          // Normalize code for comparison (e.g., trim whitespace, line endings?)
          // Simple trim for now, might need more robust normalization
          const normalizedNotebookCode = notebookCode?.trim();
          const normalizedMqttCode = mqttCode?.trim();

          if (normalizedNotebookCode === normalizedMqttCode) {
            status = 'synced';
            statusDescription = 'Synced with notebook';
            iconName = 'notebook'; // Use notebook icon for synced
            iconColorId = 'list.highlightForeground'; // Standard selection/info color
            contextValue = 'corefluxEntityItemSynced,corefluxEntityItemBase';
          } else {
            status = 'unsynced';
            statusDescription = 'Differs from notebook code';
            iconName = 'warning'; // Use warning icon for unsynced
            iconColorId = 'list.warningForeground'; // Standard warning color
            contextValue = 'corefluxEntityItemUnsynced,corefluxEntityItemBase';
          }
        }

        // --- Item Label (Just the name) ---
        const finalLabel = name;

        // --- Tooltip with Status ---
        const tooltip = `${singleEntityType}: ${name}\nTopic: ${topic}\nStatus: ${statusDescription}`;

        // --- Command for primary click action (Go to Definition/Cell) ---
        const goToCommand: vscode.Command = {
          command: 'coreflux.goToOrCreateEntityCell',
          title: 'Go to Definition or Cell',
          arguments: [singleEntityType, name]
        };

        // Revert to using EntityItem constructor
        const entityItem = new EntityItem(
          finalLabel,
          singleEntityType,
          name,
          topic,
          data.code || null, // MQTT code is still the primary payload for copy etc.
          collapsible,
          goToCommand
        );

        // --- Set Icon based on Status ---
        entityItem.iconPath = new vscode.ThemeIcon(iconName, new vscode.ThemeColor(iconColorId));

        // --- Set Tooltip and Context Value ---
        entityItem.tooltip = tooltip;
        // Set context including status and a base identifier for entities
        entityItem.contextValue = status + ',corefluxEntityItem'; 

        // --- Set ID ---
        entityItem.id = topic; // Use the topic as a reasonably unique ID

        // ---> DEBUG: Log the final context value right before returning
        console.log(`[CorefluxEntitiesProvider] Returning item: ${entityItem.label}, ID: ${entityItem.id}, ContextValue: ${entityItem.contextValue}`);

        return entityItem; // Return the EntityItem
      });
      // Revert the cast here too if needed (depends on previous exact state)
      return Promise.resolve(items); // Assuming items are now EntityItem[] again

    } else if (element.entityType !== 'Description' && element.collapsibleState !== vscode.TreeItemCollapsibleState.None) {
      // Children of an entity item (only if it's collapsible, meaning it has a description)
      const entityCategory = (element.entityType + 's') as keyof typeof this.entities;
      const entityData = this.entities[entityCategory]?.get(element.entityName);
      if (entityData?.description) {
        const descriptionTopic = `${element.topic}/Description`;
        const descriptionItem = new EntityItem(
          'Description',
          'Description',
          element.entityName,
          descriptionTopic,
          entityData.description,
          vscode.TreeItemCollapsibleState.None,
          { // Command to view description
            command: 'coreflux.viewDescription',
            title: "View Description",
            arguments: [entityData.description]
          }
        );
        return Promise.resolve([descriptionItem]);
      }
    }

    // No children
    return Promise.resolve([]);
  }

  // --- Methods to be called by MQTT handler ---

  public processMqttMessage(topic: string, payload: string): void {
    const parts = topic.split('/');
    if (parts.length < 4 || parts[0] !== '$SYS' || parts[1] !== 'Coreflux') {
      console.warn(`Ignoring malformed topic: ${topic}`);
      return;
    }

    const category = parts[2] as keyof typeof this.entities;
    const entityName = parts[3];
    const isDescription = parts.length > 4 && parts[4] === 'Description';

    if (!(category in this.entities)) {
      console.warn(`Ignoring message for unknown category: ${category} in topic ${topic}`);
      return;
    }

    let entityMap = this.entities[category];
    let entityData = entityMap.get(entityName);

    if (!entityData) {
      entityData = {};
      entityMap.set(entityName, entityData);
    }

    let updated = false;
    if (isDescription) {
      if (entityData.description !== payload) {
        entityData.description = payload;
        updated = true;
        console.log(`Updated description for ${category}/${entityName}`);
      }
    } else {
      if (entityData.code !== payload) {
        entityData.code = payload;
        updated = true;
        console.log(`Updated code for ${category}/${entityName}`);
      }
    }

    if (updated) {
      this.refresh(); // This will now also emit 'entitiesUpdated'
      // Explicitly emit here too? Redundant if refresh emits.
      // this.emit('entitiesUpdated');
    }
  }

  public clearEntities(): void {
    this.entities.Models.clear();
    this.entities.Actions.clear();
    this.entities.Rules.clear();
    this.entities.Routes.clear();
    this.refresh();
    console.log('Cleared all Coreflux entities from the tree.');
  }

  /**
   * Clears entities for a specific category.
   * @param category The category name (e.g., 'Models', 'Actions')
   */
  public clearCategory(category: 'Models' | 'Actions' | 'Rules' | 'Routes'): void {
    if (category in this.entities) {
      console.log(`Clearing entities for category: ${category}`);
      this.entities[category].clear();
      this.refresh(); // Trigger tree update
    } else {
      console.warn(`Attempted to clear unknown category: ${category}`);
    }
  }

  /**
   * Checks if a specific entity exists based on the MQTT data.
   */
  public hasEntity(entityType: 'Model' | 'Action' | 'Rule' | 'Route', entityName: string): boolean {
    const category = (entityType + 's') as keyof typeof this.entities;
    return this.entities[category]?.has(entityName) ?? false;
  }

  public getEntityCode(entityType: 'Model' | 'Action' | 'Rule' | 'Route', entityName: string): string | undefined {
    const category = (entityType + 's') as keyof typeof this.entities;
    return this.entities[category]?.get(entityName)?.code;
  }

  /**
   * Removes entity data from the internal map.
   * Called after successfully sending a remove command to the broker.
   * @param entityType Type of the entity (Model, Action, etc.)
   * @param entityName Name of the entity.
   * @returns True if an entity was removed, false otherwise.
   */
  public removeEntityData(entityType: 'Model' | 'Action' | 'Rule' | 'Route', entityName: string): boolean {
    const category = (entityType + 's') as keyof typeof this.entities;
    if (this.entities[category]?.has(entityName)) {
      const deleted = this.entities[category].delete(entityName);
      if (deleted) {
        console.log(`[CorefluxEntitiesProvider] Removed ${entityType} '${entityName}' from internal map.`);
      }
      // No need to refresh here, the caller (extension.ts) should do it.
      return deleted;
    }
    return false;
  }

  // --- Methods related to notebook parsing ---

  /**
   * Parses a notebook document to find entity definitions within its cells.
   * @param notebookDoc The VS Code notebook document to parse.
   */
  public parseNotebookDocument(notebookDoc: vscode.NotebookDocument): void {
    // Only parse LOT notebooks
    if (notebookDoc.notebookType !== 'lot-notebook') {
      return;
    }

    const notebookUriString = notebookDoc.uri.toString();
    console.log(`Parsing notebook: ${notebookDoc.uri.fsPath}`);

    // Get or create the map for this specific notebook URI and clear its previous entries
    const locationsInNotebook = new Map<string, EntityNotebookLocation>();
    this.entityLocations.set(notebookUriString, locationsInNotebook);
    let definitionsFoundCount = 0;

    const defineRegex = /^\s*DEFINE\s+(MODEL|ACTION|RULE|ROUTE)\s+(\S+)/i;

    // Iterate through cells in the notebook
    for (let cellIndex = 0; cellIndex < notebookDoc.cellCount; cellIndex++) {
      const cell = notebookDoc.cellAt(cellIndex);
      // Only parse code cells with the 'lot' language
      if (cell.kind !== vscode.NotebookCellKind.Code || cell.document.languageId !== 'lot') {
        continue;
      }

      const cellDocument = cell.document;
      const cellFullContent = cellDocument.getText(); // Get cell content once
      let definitionFoundInCell = false; // Flag to avoid multiple stores per cell if DEFINE appears twice

      // Iterate through lines within the cell
      for (let lineIndex = 0; lineIndex < cellDocument.lineCount; lineIndex++) {
        if (definitionFoundInCell) break; // Only find the first DEFINE in a cell

        const line = cellDocument.lineAt(lineIndex);
        const match = line.text.match(defineRegex);
        if (match) {
          const typeUpper = match[1].toUpperCase();
          let type: 'Model' | 'Action' | 'Rule' | 'Route' | null = null;
          if (typeUpper === 'MODEL') type = 'Model';
          else if (typeUpper === 'ACTION') type = 'Action';
          else if (typeUpper === 'RULE') type = 'Rule';
          else if (typeUpper === 'ROUTE') type = 'Route';

          if (type) {
            const name = match[2];
            const key = `${type}/${name}`;
            const location: EntityNotebookLocation = {
              notebookUri: notebookDoc.uri,
              cellIndex: cellIndex,
              rangeInCell: line.range, // Range relative to the start of the cell
              cellContent: cellFullContent // Store the whole cell's content
            };
            locationsInNotebook.set(key, location);
            definitionsFoundCount++;
            definitionFoundInCell = true; // Mark as found for this cell
            console.log(`Found entity definition in notebook ${notebookDoc.uri.fsPath}, cell ${cellIndex}: ${key} at line ${lineIndex + 1}`);
          }
        }
      }
    }

    console.log(`Finished parsing ${notebookDoc.uri.fsPath}. Found ${definitionsFoundCount} entity definitions in this notebook.`);
    this.entityLocations.set(notebookUriString, locationsInNotebook); // Update the map for this notebook URI
    this.emit('notebookParsed');
  }

  /**
   * Retrieves the location (URI, cell index, Range) of an entity definition found in ANY parsed notebook.
   * @param entityType The type of the entity (e.g., 'Model').
   * @param entityName The name of the entity.
   * @returns The location object { notebookUri: vscode.Uri, cellIndex: number, rangeInCell: vscode.Range } or undefined.
   */
  public getEntityLocation(entityType: 'Model' | 'Action' | 'Rule' | 'Route', entityName: string): EntityNotebookLocation | undefined {
    const searchKey = `${entityType}/${entityName}`;
    // Iterate through all notebooks we've parsed
    for (const locationsInNotebook of this.entityLocations.values()) {
      const locationData = locationsInNotebook.get(searchKey);
      if (locationData) {
        // Found it!
        return locationData;
      }
    }
    // Not found in any parsed notebook
    return undefined;
  }

} 