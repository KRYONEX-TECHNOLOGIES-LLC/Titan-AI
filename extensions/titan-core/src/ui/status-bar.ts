// Status Bar Manager
// extensions/titan-core/src/ui/status-bar.ts

import * as vscode from 'vscode';

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private currentStatus: StatusType = 'ready';
  private currentModel: string = 'Claude 3.5 Sonnet';

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'titan.selectModel';
    this.update();
  }

  show(): void {
    this.statusBarItem.show();
  }

  hide(): void {
    this.statusBarItem.hide();
  }

  setStatus(status: StatusType): void {
    this.currentStatus = status;
    this.update();
  }

  setModel(model: string): void {
    this.currentModel = model;
    this.update();
  }

  private update(): void {
    const statusConfig = this.getStatusConfig(this.currentStatus);
    
    this.statusBarItem.text = `$(${statusConfig.icon}) ${statusConfig.text}`;
    this.statusBarItem.tooltip = `Titan AI: ${statusConfig.tooltip}\nModel: ${this.currentModel}\nClick to change model`;
    this.statusBarItem.backgroundColor = statusConfig.background;
  }

  private getStatusConfig(status: StatusType): StatusConfig {
    switch (status) {
      case 'initializing':
        return {
          icon: 'sync~spin',
          text: 'Titan AI',
          tooltip: 'Initializing...',
          background: undefined,
        };
      case 'ready':
        return {
          icon: 'sparkle',
          text: 'Titan AI',
          tooltip: 'Ready',
          background: undefined,
        };
      case 'thinking':
        return {
          icon: 'loading~spin',
          text: 'Thinking...',
          tooltip: 'Processing your request',
          background: new vscode.ThemeColor('statusBarItem.warningBackground'),
        };
      case 'generating':
        return {
          icon: 'rocket',
          text: 'Generating...',
          tooltip: 'Generating code',
          background: new vscode.ThemeColor('statusBarItem.warningBackground'),
        };
      case 'indexing':
        return {
          icon: 'database',
          text: 'Indexing...',
          tooltip: 'Indexing workspace',
          background: undefined,
        };
      case 'error':
        return {
          icon: 'error',
          text: 'Titan AI',
          tooltip: 'Error - click for details',
          background: new vscode.ThemeColor('statusBarItem.errorBackground'),
        };
      case 'offline':
        return {
          icon: 'debug-disconnect',
          text: 'Titan AI (Offline)',
          tooltip: 'Not connected to AI service',
          background: undefined,
        };
      default:
        return {
          icon: 'sparkle',
          text: 'Titan AI',
          tooltip: 'Ready',
          background: undefined,
        };
    }
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}

type StatusType = 
  | 'initializing' 
  | 'ready' 
  | 'thinking' 
  | 'generating' 
  | 'indexing' 
  | 'error' 
  | 'offline';

interface StatusConfig {
  icon: string;
  text: string;
  tooltip: string;
  background: vscode.ThemeColor | undefined;
}
