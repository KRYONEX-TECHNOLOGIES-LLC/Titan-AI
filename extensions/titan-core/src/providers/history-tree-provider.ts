// History Tree Provider
// extensions/titan-core/src/providers/history-tree-provider.ts

import * as vscode from 'vscode';

export class HistoryTreeProvider implements vscode.TreeDataProvider<HistoryItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<HistoryItem | undefined | null | void> = 
    new vscode.EventEmitter<HistoryItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<HistoryItem | undefined | null | void> = 
    this._onDidChangeTreeData.event;

  private context: vscode.ExtensionContext;
  private history: HistoryEntry[] = [];
  private readonly STORAGE_KEY = 'titan.history';
  private readonly MAX_HISTORY = 50;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadHistory();
  }

  private loadHistory(): void {
    const stored = this.context.globalState.get<HistoryEntry[]>(this.STORAGE_KEY);
    this.history = stored || [];
  }

  private saveHistory(): void {
    this.context.globalState.update(this.STORAGE_KEY, this.history);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  addEntry(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): void {
    const newEntry: HistoryEntry = {
      ...entry,
      id: Date.now().toString(),
      timestamp: Date.now(),
    };

    this.history.unshift(newEntry);

    // Limit history size
    if (this.history.length > this.MAX_HISTORY) {
      this.history = this.history.slice(0, this.MAX_HISTORY);
    }

    this.saveHistory();
    this.refresh();
  }

  clearHistory(): void {
    this.history = [];
    this.saveHistory();
    this.refresh();
  }

  getTreeItem(element: HistoryItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: HistoryItem): Thenable<HistoryItem[]> {
    if (element) {
      return Promise.resolve([]);
    }

    if (this.history.length === 0) {
      return Promise.resolve([new EmptyHistoryItem()]);
    }

    return Promise.resolve(
      this.history.map((entry) => new HistoryItem(entry))
    );
  }
}

interface HistoryEntry {
  id: string;
  type: 'chat' | 'edit' | 'generate' | 'review' | 'fix';
  title: string;
  preview?: string;
  timestamp: number;
  file?: string;
}

class HistoryItem extends vscode.TreeItem {
  constructor(public readonly entry: HistoryEntry) {
    super(entry.title, vscode.TreeItemCollapsibleState.None);
    
    this.tooltip = entry.preview || entry.title;
    this.description = this.formatTimestamp(entry.timestamp);
    this.iconPath = new vscode.ThemeIcon(this.getIcon(entry.type));
    
    this.contextValue = 'historyEntry';
  }

  private formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - timestamp;

    if (diff < 60000) {
      return 'Just now';
    } else if (diff < 3600000) {
      const mins = Math.floor(diff / 60000);
      return `${mins}m ago`;
    } else if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  private getIcon(type: HistoryEntry['type']): string {
    switch (type) {
      case 'chat':
        return 'comment-discussion';
      case 'edit':
        return 'edit';
      case 'generate':
        return 'sparkle';
      case 'review':
        return 'eye';
      case 'fix':
        return 'wrench';
      default:
        return 'history';
    }
  }
}

class EmptyHistoryItem extends vscode.TreeItem {
  constructor() {
    super('No history yet', vscode.TreeItemCollapsibleState.None);
    this.description = 'Start using Titan AI';
    this.iconPath = new vscode.ThemeIcon('history');
  }
}
