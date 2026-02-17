// Code Actions Provider
// extensions/titan-core/src/providers/code-actions-provider.ts

import * as vscode from 'vscode';
import { AIService } from '../services/ai-service';

export class CodeActionsProvider implements vscode.CodeActionProvider {
  private aiService: AIService;

  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.Refactor,
  ];

  constructor(aiService: AIService) {
    this.aiService = aiService;
  }

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.CodeAction[] | undefined {
    const actions: vscode.CodeAction[] = [];

    // Add Titan AI actions for errors
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
        const fixAction = new vscode.CodeAction(
          `Titan AI: Fix "${diagnostic.message.slice(0, 50)}..."`,
          vscode.CodeActionKind.QuickFix
        );
        fixAction.command = {
          command: 'titan.fixErrors',
          title: 'Fix with Titan AI',
        };
        fixAction.isPreferred = true;
        actions.push(fixAction);
      }
    }

    // Add refactor actions if there's a selection
    if (!range.isEmpty) {
      const refactorAction = new vscode.CodeAction(
        'Titan AI: Refactor Selection',
        vscode.CodeActionKind.Refactor
      );
      refactorAction.command = {
        command: 'titan.refactorCode',
        title: 'Refactor with Titan AI',
      };
      actions.push(refactorAction);

      const explainAction = new vscode.CodeAction(
        'Titan AI: Explain Code',
        vscode.CodeActionKind.Empty
      );
      explainAction.command = {
        command: 'titan.explainCode',
        title: 'Explain with Titan AI',
      };
      actions.push(explainAction);

      const docAction = new vscode.CodeAction(
        'Titan AI: Add Documentation',
        vscode.CodeActionKind.Refactor
      );
      docAction.command = {
        command: 'titan.addDocumentation',
        title: 'Document with Titan AI',
      };
      actions.push(docAction);

      const testAction = new vscode.CodeAction(
        'Titan AI: Generate Tests',
        vscode.CodeActionKind.Empty
      );
      testAction.command = {
        command: 'titan.generateTests',
        title: 'Generate tests with Titan AI',
      };
      actions.push(testAction);
    }

    return actions;
  }
}
