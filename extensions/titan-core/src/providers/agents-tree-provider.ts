// Agents Tree Provider
// extensions/titan-core/src/providers/agents-tree-provider.ts

import * as vscode from 'vscode';

export class AgentsTreeProvider implements vscode.TreeDataProvider<AgentItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<AgentItem | undefined | null | void> = 
    new vscode.EventEmitter<AgentItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<AgentItem | undefined | null | void> = 
    this._onDidChangeTreeData.event;

  private agents: AgentInfo[] = [
    {
      id: 'coordinator',
      name: 'Coordinator',
      description: 'Main orchestration agent',
      status: 'idle',
      icon: '🎯',
    },
    {
      id: 'security',
      name: 'Security Reviewer',
      description: 'Analyzes code for security issues',
      status: 'idle',
      icon: '🔒',
    },
    {
      id: 'refactor',
      name: 'Refactor Specialist',
      description: 'Suggests and applies refactorings',
      status: 'idle',
      icon: '🔧',
    },
    {
      id: 'test',
      name: 'Test Writer',
      description: 'Generates unit and integration tests',
      status: 'idle',
      icon: '🧪',
    },
    {
      id: 'docs',
      name: 'Documentation Writer',
      description: 'Writes and updates documentation',
      status: 'idle',
      icon: '📝',
    },
    {
      id: 'review',
      name: 'Code Reviewer',
      description: 'Reviews code for best practices',
      status: 'idle',
      icon: '👀',
    },
  ];

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AgentItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AgentItem): Thenable<AgentItem[]> {
    if (element) {
      return Promise.resolve([]);
    }

    return Promise.resolve(
      this.agents.map((agent) => new AgentItem(agent))
    );
  }

  setAgentStatus(agentId: string, status: AgentStatus): void {
    const agent = this.agents.find((a) => a.id === agentId);
    if (agent) {
      agent.status = status;
      this.refresh();
    }
  }
}

type AgentStatus = 'idle' | 'working' | 'completed' | 'error';

interface AgentInfo {
  id: string;
  name: string;
  description: string;
  status: AgentStatus;
  icon: string;
}

class AgentItem extends vscode.TreeItem {
  constructor(public readonly agent: AgentInfo) {
    super(agent.name, vscode.TreeItemCollapsibleState.None);
    
    this.tooltip = agent.description;
    this.description = this.getStatusText(agent.status);
    this.iconPath = new vscode.ThemeIcon(this.getStatusIcon(agent.status));
    
    this.contextValue = 'agent';
  }

  private getStatusText(status: AgentStatus): string {
    switch (status) {
      case 'idle':
        return 'Ready';
      case 'working':
        return 'Working...';
      case 'completed':
        return 'Done';
      case 'error':
        return 'Error';
      default:
        return '';
    }
  }

  private getStatusIcon(status: AgentStatus): string {
    switch (status) {
      case 'idle':
        return 'circle-outline';
      case 'working':
        return 'sync~spin';
      case 'completed':
        return 'pass-filled';
      case 'error':
        return 'error';
      default:
        return 'circle-outline';
    }
  }
}
