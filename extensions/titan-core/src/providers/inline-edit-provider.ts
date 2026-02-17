// Inline Edit Provider
// extensions/titan-core/src/providers/inline-edit-provider.ts

import * as vscode from 'vscode';
import { AIService } from '../services/ai-service';

export class InlineEditProvider {
  private aiService: AIService;

  constructor(aiService: AIService) {
    this.aiService = aiService;
  }

  async performEdit(editor: vscode.TextEditor, instruction: string): Promise<void> {
    const selection = editor.selection;
    const document = editor.document;
    const language = document.languageId;

    // Get the code to edit
    let code: string;
    let targetRange: vscode.Range;

    if (selection.isEmpty) {
      // If no selection, use the entire document or smart selection
      const line = document.lineAt(selection.active.line);
      const blockRange = this.expandToBlock(document, selection.active.line);
      code = document.getText(blockRange);
      targetRange = blockRange;
    } else {
      code = document.getText(selection);
      targetRange = selection;
    }

    // Show progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Titan AI',
        cancellable: true,
      },
      async (progress, token) => {
        progress.report({ message: 'Processing your request...' });

        try {
          // Get the edited code from AI
          const editedCode = await this.aiService.refactor(code, instruction, language);

          if (token.isCancellationRequested) return;

          // Show diff and ask for confirmation
          const shouldApply = await this.showDiff(document, targetRange, editedCode);

          if (shouldApply) {
            await editor.edit((editBuilder) => {
              editBuilder.replace(targetRange, editedCode);
            });
            
            vscode.window.showInformationMessage('Edit applied successfully');
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to edit: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    );
  }

  private expandToBlock(document: vscode.TextDocument, startLine: number): vscode.Range {
    let start = startLine;
    let end = startLine;
    
    // Find the start of the block
    while (start > 0) {
      const line = document.lineAt(start - 1);
      if (line.isEmptyOrWhitespace) break;
      start--;
    }

    // Find the end of the block
    while (end < document.lineCount - 1) {
      const line = document.lineAt(end + 1);
      if (line.isEmptyOrWhitespace) break;
      end++;
    }

    return new vscode.Range(
      new vscode.Position(start, 0),
      document.lineAt(end).range.end
    );
  }

  private async showDiff(
    document: vscode.TextDocument,
    range: vscode.Range,
    newCode: string
  ): Promise<boolean> {
    // Create a temporary document with the new code
    const originalCode = document.getText(range);
    
    const result = await vscode.window.showQuickPick(
      [
        { label: '$(check) Apply', value: true, description: 'Apply the changes' },
        { label: '$(x) Cancel', value: false, description: 'Discard the changes' },
        { label: '$(diff) View Diff', value: 'diff', description: 'View changes before applying' },
      ],
      {
        placeHolder: 'Apply AI-generated changes?',
      }
    );

    if (!result) return false;

    if (result.value === 'diff') {
      // Show inline diff
      const originalUri = document.uri;
      const modifiedUri = vscode.Uri.parse(`titan-diff:${originalUri.path}?modified`);
      
      // Register content provider for diff
      const provider = new (class implements vscode.TextDocumentContentProvider {
        provideTextDocumentContent(): string {
          return newCode;
        }
      })();
      
      const disposable = vscode.workspace.registerTextDocumentContentProvider('titan-diff', provider);
      
      await vscode.commands.executeCommand(
        'vscode.diff',
        originalUri,
        modifiedUri,
        'Original ↔ Titan AI Edit'
      );
      
      // Ask again after showing diff
      const confirmResult = await vscode.window.showQuickPick(
        [
          { label: '$(check) Apply', value: true },
          { label: '$(x) Cancel', value: false },
        ],
        { placeHolder: 'Apply these changes?' }
      );
      
      disposable.dispose();
      return confirmResult?.value === true;
    }

    return result.value === true;
  }
}
