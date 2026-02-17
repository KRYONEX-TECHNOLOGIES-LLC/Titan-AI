// Chat View Provider
// extensions/titan-core/src/providers/chat-view-provider.ts

import * as vscode from 'vscode';
import { AIService, ChatMessage } from '../services/ai-service';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'titan.chatView';
  
  private view?: vscode.WebviewView;
  private context: vscode.ExtensionContext;
  private aiService: AIService;
  private messages: ChatMessage[] = [];

  constructor(context: vscode.ExtensionContext, aiService: AIService) {
    this.context = context;
    this.aiService = aiService;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = this.getHtmlContent();

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'chat':
          await this.handleChat(message.text);
          break;
        case 'clear':
          this.messages = [];
          this.updateMessages();
          break;
      }
    });
  }

  public addMessage(message: ChatMessage): void {
    this.messages.push(message);
    this.updateMessages();
  }

  private async handleChat(text: string): Promise<void> {
    // Add user message
    this.messages.push({ role: 'user', content: text });
    this.updateMessages();

    // Get AI response
    try {
      this.setLoading(true);
      const response = await this.aiService.chat(this.messages);
      this.messages.push({ role: 'assistant', content: response });
      this.updateMessages();
    } catch (error) {
      this.messages.push({
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      this.updateMessages();
    } finally {
      this.setLoading(false);
    }
  }

  private updateMessages(): void {
    if (this.view) {
      this.view.webview.postMessage({
        type: 'messages',
        messages: this.messages,
      });
    }
  }

  private setLoading(loading: boolean): void {
    if (this.view) {
      this.view.webview.postMessage({
        type: 'loading',
        loading,
      });
    }
  }

  private getHtmlContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Titan AI Chat</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    .header {
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .header h2 {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }
    
    .message {
      margin-bottom: 12px;
      padding: 8px 12px;
      border-radius: 6px;
    }
    
    .message.user {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      margin-left: 24px;
    }
    
    .message.assistant {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      margin-right: 24px;
    }
    
    .message pre {
      margin: 8px 0;
      padding: 8px;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 4px;
      overflow-x: auto;
    }
    
    .message code {
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
    }
    
    .input-container {
      padding: 12px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    
    .input-wrapper {
      display: flex;
      gap: 8px;
    }
    
    textarea {
      flex: 1;
      padding: 8px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      resize: none;
      font-family: inherit;
      font-size: inherit;
    }
    
    textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }
    
    button {
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
    }
    
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .loading {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      color: var(--vscode-descriptionForeground);
    }
    
    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid var(--vscode-progressBar-background);
      border-top-color: var(--vscode-button-background);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      text-align: center;
      color: var(--vscode-descriptionForeground);
    }
    
    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>Titan AI Chat</h2>
    <button onclick="clearChat()" style="padding: 4px 8px; font-size: 11px;">Clear</button>
  </div>
  
  <div class="messages" id="messages">
    <div class="empty">
      <div class="empty-icon">🤖</div>
      <p>Ask Titan AI anything about your code</p>
      <p style="font-size: 11px; margin-top: 8px;">Press Ctrl+Shift+I to open chat anytime</p>
    </div>
  </div>
  
  <div id="loading" class="loading" style="display: none;">
    <div class="spinner"></div>
    <span>Thinking...</span>
  </div>
  
  <div class="input-container">
    <div class="input-wrapper">
      <textarea 
        id="input" 
        placeholder="Ask me anything..." 
        rows="2"
        onkeydown="handleKeydown(event)"
      ></textarea>
      <button onclick="sendMessage()" id="sendBtn">Send</button>
    </div>
  </div>
  
  <script>
    const vscode = acquireVsCodeApi();
    let isLoading = false;
    
    function sendMessage() {
      const input = document.getElementById('input');
      const text = input.value.trim();
      if (!text || isLoading) return;
      
      vscode.postMessage({ type: 'chat', text });
      input.value = '';
    }
    
    function clearChat() {
      vscode.postMessage({ type: 'clear' });
    }
    
    function handleKeydown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    }
    
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    function formatMessage(content) {
      // Simple markdown-like formatting
      let html = escapeHtml(content);
      
      // Code blocks
      html = html.replace(/\`\`\`(\\w+)?\\n([\\s\\S]*?)\`\`\`/g, '<pre><code>$2</code></pre>');
      
      // Inline code
      html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
      
      // Line breaks
      html = html.replace(/\\n/g, '<br>');
      
      return html;
    }
    
    window.addEventListener('message', (event) => {
      const message = event.data;
      
      switch (message.type) {
        case 'messages':
          const container = document.getElementById('messages');
          if (message.messages.length === 0) {
            container.innerHTML = \`
              <div class="empty">
                <div class="empty-icon">🤖</div>
                <p>Ask Titan AI anything about your code</p>
              </div>
            \`;
          } else {
            container.innerHTML = message.messages
              .map(msg => \`<div class="message \${msg.role}">\${formatMessage(msg.content)}</div>\`)
              .join('');
            container.scrollTop = container.scrollHeight;
          }
          break;
          
        case 'loading':
          isLoading = message.loading;
          document.getElementById('loading').style.display = message.loading ? 'flex' : 'none';
          document.getElementById('sendBtn').disabled = message.loading;
          break;
      }
    });
  </script>
</body>
</html>`;
  }
}
