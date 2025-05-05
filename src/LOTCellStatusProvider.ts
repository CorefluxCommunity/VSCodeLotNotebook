import * as vscode from 'vscode';
import { CorefluxEntitiesProvider } from './CorefluxEntitiesProvider'; // Needed to check entities

// Re-define status types or import from LOTController if moved
type CellSyncStatus = 'synced' | 'unsynced' | 'missing' | 'unknown' | 'invalid';

type EntityType = 'Model' | 'Action' | 'Rule' | 'Route' | 'Visu';

export class LOTCellStatusProvider implements vscode.NotebookCellStatusBarItemProvider {

  private _cellStatusBarItems = new Map<string, vscode.NotebookCellStatusBarItem>(); // Key: cell URI
  private readonly _onDidChangeCellStatusBarItems = new vscode.EventEmitter<void>();
  readonly onDidChangeCellStatusBarItems: vscode.Event<void> = this._onDidChangeCellStatusBarItems.event;

  constructor(private _entitiesProvider: CorefluxEntitiesProvider) {
    console.log('LOTCellStatusProvider initialized.');
    // Listen for entity updates to trigger status re-calculation
    this._entitiesProvider.on('entitiesUpdated', () => {
      console.log('Entities updated, signaling status bar refresh...');
      this._onDidChangeCellStatusBarItems.fire();
    });
  }

  /**
     * VS Code calls this method to get the status bar items for a cell.
     * This is where we calculate the status *on demand*.
     */
  provideCellStatusBarItems(cell: vscode.NotebookCell, token: vscode.CancellationToken): vscode.ProviderResult<vscode.NotebookCellStatusBarItem | vscode.NotebookCellStatusBarItem[]> {
    if (cell.document.languageId !== 'lot' || cell.kind !== vscode.NotebookCellKind.Code) {
      return []; // No item for non-LOT code cells
    }

    const cellCode = cell.document.getText().trim(); // Trim cell code for comparison
    const parsed = this.parseEntityTypeAndName(cellCode);

    let status: CellSyncStatus;
    let tooltip: string;

    if (!parsed) {
      status = 'invalid';
      tooltip = 'Invalid LOT definition format';
    } else {
      const { type, name } = parsed;
      const providerType = (type.charAt(0) + type.slice(1).toLowerCase()) as EntityType;

      if (['Model', 'Action', 'Rule', 'Route', 'Visu'].includes(providerType)) {
        const entityTypeForProvider = providerType as 'Model' | 'Action' | 'Rule' | 'Route'; // Cast for provider methods
        const existsOnBroker = this._entitiesProvider.hasEntity(entityTypeForProvider, name);

        if (existsOnBroker) {
          const brokerCode = this._entitiesProvider.getEntityCode(entityTypeForProvider, name)?.trim(); // Trim broker code

          // Compare trimmed code (basic comparison)
          if (brokerCode && this.normalizeCode(cellCode) === this.normalizeCode(brokerCode)) {
            status = 'synced';
            tooltip = `Entity '${name}' (${type}) is synced with the broker.`;
          } else if (brokerCode) {
            status = 'unsynced';
            tooltip = `Entity '${name}' (${type}) found on broker, but code differs from the cell content.`;
            // Optional: Add a diff command here later?
          } else {
            // Exists but no code? Should be rare.
            status = 'unknown';
            tooltip = `Entity '${name}' (${type}) exists on broker, but code is unavailable or empty.`;
          }
        } else {
          status = 'missing';
          tooltip = `Entity '${name}' (${type}) not found on broker.`;
        }
      } else {
        status = 'invalid';
        tooltip = `Unknown entity type: ${type}`;
      }
    }

    // Create the item with text + icon
    const statusText = this.getStatusTextWithIcon(status);
    const item = new vscode.NotebookCellStatusBarItem(statusText, vscode.NotebookCellStatusBarAlignment.Left);
    item.tooltip = tooltip;
    return [item];
  }
  
  /**
  * Signals that all status items potentially need refreshing.
  */
  public refreshAll(): void {
    this._onDidChangeCellStatusBarItems.fire();
  }

  /** Helper to get icon based on status */
  private getStatusIcon(status: CellSyncStatus): string {
    switch (status) {
    case 'synced': return '$(check)';
    case 'unsynced': return '$(warning)';
    case 'missing': return '$(error)';
    case 'invalid': return '$(circle-slash)';
    case 'unknown':
    default: return '$(question)';      
    }
  }

  /** Helper to get text + icon based on status */
  private getStatusTextWithIcon(status: CellSyncStatus): string {
    switch (status) {
    case 'synced': return `Synced $(check)`;
    case 'unsynced': return `Unsynced $(warning)`;
    case 'missing': return `Missing $(error)`;
    case 'invalid': return `Invalid $(circle-slash)`;
    case 'unknown':
    default: return `Unknown $(question)`;
    }
  }

  /** Normalizes code for comparison (removes extra whitespace, potentially comments) */
  private normalizeCode(code: string): string {
    // Simple normalization: remove leading/trailing whitespace and collapse multiple spaces/newlines
    return code.trim().replace(/\s\s+/g, ' ').replace(/\r\n/g, '\n').replace(/\n+/g, '\n');
    // TODO: Consider removing comments for a more robust comparison
  }

  /**
     * Simple parser duplicate from LOTController (ideally share or move to utils).
     */
  private parseEntityTypeAndName(code: string): { type: string; name: string } | null {
    // Regex might need refinement based on actual LOT grammar nuances
    const re = /\bDEFINE\s+(MODEL|ACTION|RULE|ROUTE|VISU)\s+"?([A-Za-z0-9_\-\/]+)"?/i;
    const match = code.match(re);
    if (!match) return null;
    const entityType = match[1].toUpperCase(); // Keep as uppercase string
    const entityName = match[2];
    return { type: entityType, name: entityName };
  }

  dispose(): void {
    this._onDidChangeCellStatusBarItems.dispose();
  }
} 