// Titan AI Core Extension
// extensions/titan-core/src/extension.ts

import * as vscode from 'vscode';
import { ChatViewProvider } from './providers/chat-view-provider';
import { InlineEditProvider } from './providers/inline-edit-provider';
import { CompletionProvider } from './providers/completion-provider';
import { CodeActionsProvider } from './providers/code-actions-provider';
import { IndexingService } from './services/indexing-service';
import { AIService } from './services/ai-service';
import { StatusBarManager } from './ui/status-bar';
import { AgentsTreeProvider } from './providers/agents-tree-provider';
import { HistoryTreeProvider } from './providers/history-tree-provider';

let aiService: AIService;
let indexingService: IndexingService;
let statusBar: StatusBarManager;

export async function activate(context: vscode.ExtensionContext) {
  console.log('Titan AI is activating...');

  // Initialize services
  aiService = new AIService(context);
  indexingService = new IndexingService(context);
  statusBar = new StatusBarManager();

  // Initialize status bar
  statusBar.show();
  statusBar.setStatus('initializing');

  // Register providers
  const chatViewProvider = new ChatViewProvider(context, aiService);
  const inlineEditProvider = new InlineEditProvider(aiService);
  const completionProvider = new CompletionProvider(aiService);
  const codeActionsProvider = new CodeActionsProvider(aiService);
  const agentsTreeProvider = new AgentsTreeProvider();
  const historyTreeProvider = new HistoryTreeProvider(context);

  // Register webview provider for chat
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('titan.chatView', chatViewProvider)
  );

  // Register tree data providers
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('titan.agentsView', agentsTreeProvider)
  );
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('titan.historyView', historyTreeProvider)
  );

  // Register completion provider
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { scheme: 'file' },
      completionProvider,
      '.'
    )
  );

  // Register code actions provider
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: 'file' },
      codeActionsProvider,
      { providedCodeActionKinds: CodeActionsProvider.providedCodeActionKinds }
    )
  );

  // Register commands
  registerCommands(context, aiService, inlineEditProvider, chatViewProvider);

  // Start indexing if enabled
  const config = vscode.workspace.getConfiguration('titan');
  if (config.get('indexing.enabled')) {
    await indexingService.startIndexing();
  }

  // Update status
  statusBar.setStatus('ready');
  
  console.log('Titan AI is now active!');
}

function registerCommands(
  context: vscode.ExtensionContext,
  aiService: AIService,
  inlineEditProvider: InlineEditProvider,
  chatViewProvider: ChatViewProvider
) {
  // Open Chat command
  context.subscriptions.push(
    vscode.commands.registerCommand('titan.openChat', () => {
      vscode.commands.executeCommand('titan.chatView.focus');
    })
  );

  // Inline Edit command
  context.subscriptions.push(
    vscode.commands.registerCommand('titan.inlineEdit', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }

      const instruction = await vscode.window.showInputBox({
        prompt: 'What would you like to change?',
        placeHolder: 'e.g., "Add error handling" or "Refactor to async/await"',
      });

      if (instruction) {
        await inlineEditProvider.performEdit(editor, instruction);
      }
    })
  );

  // Explain Code command
  context.subscriptions.push(
    vscode.commands.registerCommand('titan.explainCode', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage('Please select code to explain');
        return;
      }

      const selectedText = editor.document.getText(editor.selection);
      const language = editor.document.languageId;
      
      statusBar.setStatus('thinking');
      
      try {
        const explanation = await aiService.explain(selectedText, language);
        
        // Show in chat view
        chatViewProvider.addMessage({
          role: 'assistant',
          content: explanation,
        });
        
        vscode.commands.executeCommand('titan.chatView.focus');
      } finally {
        statusBar.setStatus('ready');
      }
    })
  );

  // Generate Code command
  context.subscriptions.push(
    vscode.commands.registerCommand('titan.generateCode', async () => {
      const prompt = await vscode.window.showInputBox({
        prompt: 'What code would you like to generate?',
        placeHolder: 'e.g., "A function that validates email addresses"',
      });

      if (!prompt) return;

      const editor = vscode.window.activeTextEditor;
      const language = editor?.document.languageId || 'typescript';

      statusBar.setStatus('generating');

      try {
        const code = await aiService.generate(prompt, language);
        
        if (editor) {
          await editor.edit((editBuilder) => {
            editBuilder.insert(editor.selection.active, code);
          });
        } else {
          // Create new document
          const doc = await vscode.workspace.openTextDocument({
            content: code,
            language,
          });
          await vscode.window.showTextDocument(doc);
        }
      } finally {
        statusBar.setStatus('ready');
      }
    })
  );

  // Refactor Code command
  context.subscriptions.push(
    vscode.commands.registerCommand('titan.refactorCode', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage('Please select code to refactor');
        return;
      }

      const instruction = await vscode.window.showInputBox({
        prompt: 'How would you like to refactor this code?',
        placeHolder: 'e.g., "Extract to a separate function" or "Use modern syntax"',
      });

      if (!instruction) return;

      const selectedText = editor.document.getText(editor.selection);
      const language = editor.document.languageId;

      statusBar.setStatus('thinking');

      try {
        const refactored = await aiService.refactor(selectedText, instruction, language);
        
        await editor.edit((editBuilder) => {
          editBuilder.replace(editor.selection, refactored);
        });
      } finally {
        statusBar.setStatus('ready');
      }
    })
  );

  // Fix Errors command
  context.subscriptions.push(
    vscode.commands.registerCommand('titan.fixErrors', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }

      const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
      const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);

      if (errors.length === 0) {
        vscode.window.showInformationMessage('No errors found in this file');
        return;
      }

      statusBar.setStatus('thinking');

      try {
        const fileContent = editor.document.getText();
        const errorMessages = errors.map(e => `Line ${e.range.start.line + 1}: ${e.message}`).join('\n');
        
        const fixed = await aiService.fixErrors(fileContent, errorMessages, editor.document.languageId);
        
        await editor.edit((editBuilder) => {
          const fullRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(fileContent.length)
          );
          editBuilder.replace(fullRange, fixed);
        });
      } finally {
        statusBar.setStatus('ready');
      }
    })
  );

  // Generate Tests command
  context.subscriptions.push(
    vscode.commands.registerCommand('titan.generateTests', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }

      const selectedText = editor.selection.isEmpty
        ? editor.document.getText()
        : editor.document.getText(editor.selection);
      const language = editor.document.languageId;

      statusBar.setStatus('generating');

      try {
        const tests = await aiService.generateTests(selectedText, language);
        
        // Create new document with tests
        const doc = await vscode.workspace.openTextDocument({
          content: tests,
          language,
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      } finally {
        statusBar.setStatus('ready');
      }
    })
  );

  // Add Documentation command
  context.subscriptions.push(
    vscode.commands.registerCommand('titan.addDocumentation', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage('Please select code to document');
        return;
      }

      const selectedText = editor.document.getText(editor.selection);
      const language = editor.document.languageId;

      statusBar.setStatus('thinking');

      try {
        const documented = await aiService.addDocumentation(selectedText, language);
        
        await editor.edit((editBuilder) => {
          editBuilder.replace(editor.selection, documented);
        });
      } finally {
        statusBar.setStatus('ready');
      }
    })
  );

  // Review Code command
  context.subscriptions.push(
    vscode.commands.registerCommand('titan.reviewCode', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }

      const selectedText = editor.selection.isEmpty
        ? editor.document.getText()
        : editor.document.getText(editor.selection);
      const language = editor.document.languageId;

      statusBar.setStatus('thinking');

      try {
        const review = await aiService.reviewCode(selectedText, language);
        
        chatViewProvider.addMessage({
          role: 'assistant',
          content: review,
        });
        
        vscode.commands.executeCommand('titan.chatView.focus');
      } finally {
        statusBar.setStatus('ready');
      }
    })
  );

  // Index Workspace command
  context.subscriptions.push(
    vscode.commands.registerCommand('titan.indexWorkspace', async () => {
      statusBar.setStatus('indexing');
      
      try {
        await indexingService.startIndexing();
        vscode.window.showInformationMessage('Workspace indexed successfully');
      } finally {
        statusBar.setStatus('ready');
      }
    })
  );

  // Select Model command
  context.subscriptions.push(
    vscode.commands.registerCommand('titan.selectModel', async () => {
      const models = [
        { label: 'Claude 4.6 Sonnet', id: 'claude-4.6-sonnet', description: 'Frontier model - best quality' },
        { label: 'Claude 3.5 Sonnet', id: 'claude-3.5-sonnet', description: 'Fast and capable' },
        { label: 'GPT-5.3 Turbo', id: 'gpt-5.3-turbo', description: 'OpenAI frontier model' },
        { label: 'GPT-4o', id: 'gpt-4o', description: 'Fast multimodal model' },
        { label: 'DeepSeek V3', id: 'deepseek-v3', description: 'High-quality open model' },
        { label: 'Llama 3.2 8B (Local)', id: 'llama-3.2-8b', description: 'Fast local inference' },
        { label: 'Qwen 2.5 Coder 7B (Local)', id: 'qwen-2.5-coder-7b', description: 'Code-optimized local model' },
      ];

      const selected = await vscode.window.showQuickPick(models, {
        placeHolder: 'Select AI model',
      });

      if (selected) {
        const config = vscode.workspace.getConfiguration('titan');
        await config.update('model.default', selected.id, vscode.ConfigurationTarget.Global);
        aiService.setModel(selected.id);
        statusBar.setModel(selected.label);
        vscode.window.showInformationMessage(`Model changed to ${selected.label}`);
      }
    })
  );

  // Open Settings command
  context.subscriptions.push(
    vscode.commands.registerCommand('titan.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'titan');
    })
  );
}

export function deactivate() {
  console.log('Titan AI is deactivating...');
  statusBar?.dispose();
  indexingService?.stopIndexing();
}
