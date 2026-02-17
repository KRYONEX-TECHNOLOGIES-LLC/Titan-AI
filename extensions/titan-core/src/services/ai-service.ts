// AI Service
// extensions/titan-core/src/services/ai-service.ts

import * as vscode from 'vscode';

export class AIService {
  private context: vscode.ExtensionContext;
  private currentModel: string;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    const config = vscode.workspace.getConfiguration('titan');
    this.currentModel = config.get('model.default') || 'claude-3.5-sonnet';
  }

  setModel(modelId: string): void {
    this.currentModel = modelId;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    // In production, this would call the AI gateway
    const response = await this.callAI('chat', { messages });
    return response;
  }

  async explain(code: string, language: string): Promise<string> {
    const prompt = `Explain the following ${language} code in detail:

\`\`\`${language}
${code}
\`\`\`

Provide a clear explanation of what this code does, including:
1. Overall purpose
2. Key components and their roles
3. Important patterns or techniques used
4. Any potential issues or improvements`;

    return this.callAI('explain', { prompt, code, language });
  }

  async generate(prompt: string, language: string): Promise<string> {
    const systemPrompt = `You are an expert ${language} developer. Generate clean, production-ready code based on the user's request. Only output code, no explanations.`;
    
    return this.callAI('generate', { 
      systemPrompt, 
      prompt, 
      language 
    });
  }

  async refactor(code: string, instruction: string, language: string): Promise<string> {
    const prompt = `Refactor the following ${language} code according to this instruction: "${instruction}"

\`\`\`${language}
${code}
\`\`\`

Only output the refactored code, no explanations.`;

    return this.callAI('refactor', { prompt, code, instruction, language });
  }

  async fixErrors(code: string, errors: string, language: string): Promise<string> {
    const prompt = `Fix the following errors in this ${language} code:

Errors:
${errors}

Code:
\`\`\`${language}
${code}
\`\`\`

Only output the fixed code, no explanations.`;

    return this.callAI('fix', { prompt, code, errors, language });
  }

  async generateTests(code: string, language: string): Promise<string> {
    const prompt = `Generate comprehensive unit tests for the following ${language} code:

\`\`\`${language}
${code}
\`\`\`

Use appropriate testing framework for ${language}. Include edge cases and error scenarios.`;

    return this.callAI('test', { prompt, code, language });
  }

  async addDocumentation(code: string, language: string): Promise<string> {
    const prompt = `Add comprehensive documentation to the following ${language} code:

\`\`\`${language}
${code}
\`\`\`

Add appropriate docstrings, comments, and type annotations. Follow ${language} documentation conventions.
Only output the documented code.`;

    return this.callAI('document', { prompt, code, language });
  }

  async reviewCode(code: string, language: string): Promise<string> {
    const prompt = `Review the following ${language} code and provide feedback:

\`\`\`${language}
${code}
\`\`\`

Provide a comprehensive code review including:
1. Code quality assessment
2. Potential bugs or issues
3. Security concerns
4. Performance considerations
5. Best practices and improvements
6. Overall rating (1-10)`;

    return this.callAI('review', { prompt, code, language });
  }

  async complete(prefix: string, suffix: string, language: string): Promise<string> {
    const prompt = `Complete the following ${language} code. Insert code where indicated by <CURSOR>.

${prefix}<CURSOR>${suffix}

Only output the code to insert, nothing else.`;

    return this.callAI('complete', { prompt, prefix, suffix, language });
  }

  private async callAI(action: string, params: Record<string, unknown>): Promise<string> {
    // In production, this would call the @titan/ai-gateway
    // For now, return a placeholder response
    
    const config = vscode.workspace.getConfiguration('titan');
    const apiKey = config.get<string>('apiKey');

    if (!apiKey) {
      throw new Error('Titan AI API key not configured. Please set titan.apiKey in settings.');
    }

    // Placeholder: In production, this would make actual API calls
    console.log(`[Titan AI] ${action}:`, params);
    
    return `// Titan AI would generate ${action} response here\n// Model: ${this.currentModel}\n// Configure API key in settings to enable`;
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
