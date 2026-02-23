/**
 * Template engine for prompt generation
 */

import type { PromptTemplate, PromptVariable, PromptContext } from './types';

export class TemplateEngine {
  private templates: Map<string, PromptTemplate> = new Map();

  registerTemplate(template: PromptTemplate): void {
    this.templates.set(template.id, template);
  }

  getTemplate(id: string): PromptTemplate | undefined {
    return this.templates.get(id);
  }

  getAllTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }

  getTemplatesByTag(tag: string): PromptTemplate[] {
    return this.getAllTemplates().filter(t => t.tags.includes(tag));
  }

  render(templateId: string, variables: Record<string, unknown> = {}): string {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    return this.renderTemplate(template.template, variables, template.variables);
  }

  renderInline(templateString: string, variables: Record<string, unknown> = {}): string {
    return this.renderTemplate(templateString, variables, []);
  }

  private renderTemplate(
    template: string,
    variables: Record<string, unknown>,
    declaredVars: PromptVariable[]
  ): string {
    let result = template;

    // Apply declared variables with defaults
    for (const declaredVar of declaredVars) {
      const value = variables[declaredVar.name] ?? declaredVar.default;
      
      if (declaredVar.required && value === undefined) {
        throw new Error(`Required variable missing: ${declaredVar.name}`);
      }

      const formatted = this.formatValue(value, declaredVar.type);
      result = result.replace(new RegExp(`\\{\\{\\s*${declaredVar.name}\\s*\\}\\}`, 'g'), formatted);
    }

    // Apply any additional variables
    for (const [key, value] of Object.entries(variables)) {
      const formatted = this.formatValue(value, typeof value as PromptVariable['type']);
      result = result.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), formatted);
    }

    // Handle conditionals: {{#if var}}content{{/if}}
    result = this.processConditionals(result, variables);

    // Handle loops: {{#each items}}{{.}}{{/each}}
    result = this.processLoops(result, variables);

    // Clean up any remaining unreplaced variables
    result = result.replace(/\{\{\s*\w+\s*\}\}/g, '');

    return result.trim();
  }

  private formatValue(value: unknown, type: PromptVariable['type']): string {
    if (value === undefined || value === null) {
      return '';
    }

    switch (type) {
      case 'array':
        if (Array.isArray(value)) {
          return value.join('\n');
        }
        return String(value);
      
      case 'object':
        if (typeof value === 'object') {
          return JSON.stringify(value, null, 2);
        }
        return String(value);
      
      case 'boolean':
        return value ? 'true' : 'false';
      
      default:
        return String(value);
    }
  }

  private processConditionals(template: string, variables: Record<string, unknown>): string {
    const conditionalRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
    
    return template.replace(conditionalRegex, (_match, varName, content) => {
      const value = variables[varName];
      const isTruthy = value !== undefined && value !== null && value !== false && value !== '';
      
      if (Array.isArray(value)) {
        return value.length > 0 ? content : '';
      }
      
      return isTruthy ? content : '';
    });
  }

  private processLoops(template: string, variables: Record<string, unknown>): string {
    const loopRegex = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
    
    return template.replace(loopRegex, (_match, varName, content) => {
      const items = variables[varName];
      
      if (!Array.isArray(items)) {
        return '';
      }

      return items.map((item, index) => {
        let itemContent = content;
        
        // Replace {{.}} with the item itself
        itemContent = itemContent.replace(/\{\{\s*\.\s*\}\}/g, String(item));
        
        // Replace {{@index}} with the index
        itemContent = itemContent.replace(/\{\{\s*@index\s*\}\}/g, String(index));
        
        // If item is an object, allow property access
        if (typeof item === 'object' && item !== null) {
          for (const [key, value] of Object.entries(item)) {
            itemContent = itemContent.replace(
              new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'),
              String(value)
            );
          }
        }
        
        return itemContent;
      }).join('');
    });
  }

  // Context-aware rendering
  renderWithContext(templateId: string, context: PromptContext): string {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const variables: Record<string, unknown> = {
      ...context.customVariables,
      code: context.code,
      language: context.language,
      filePath: context.filePath,
      selection: context.selection,
      diagnostics: context.diagnostics,
      repoMap: context.repoMap,
      userMessage: context.userMessage,
      conversationHistory: context.conversationHistory?.map(m => 
        `${m.role}: ${m.content}`
      ).join('\n\n'),
    };

    return this.render(templateId, variables);
  }
}

/**
 * Creates a template engine instance with default templates
 */
export function createTemplateEngine(): TemplateEngine {
  const engine = new TemplateEngine();
  
  // Register default templates
  engine.registerTemplate({
    id: 'code-edit',
    name: 'Code Edit',
    description: 'Template for code editing requests',
    template: `Edit the following code according to the instructions.

{{#if filePath}}
File: {{filePath}}
{{/if}}

{{#if language}}
Language: {{language}}
{{/if}}

## Code
\`\`\`{{language}}
{{code}}
\`\`\`

## Instructions
{{userMessage}}

{{#if selection}}
## Selected Code
\`\`\`{{language}}
{{selection}}
\`\`\`
{{/if}}

Provide the edited code with explanations for the changes.`,
    variables: [
      { name: 'code', type: 'string', required: true },
      { name: 'userMessage', type: 'string', required: true },
      { name: 'language', type: 'string', required: false },
      { name: 'filePath', type: 'string', required: false },
      { name: 'selection', type: 'string', required: false },
    ],
    tags: ['edit', 'code'],
    version: '1.0.0',
  });

  engine.registerTemplate({
    id: 'explain-code',
    name: 'Explain Code',
    description: 'Template for code explanation requests',
    template: `Explain the following code clearly and thoroughly.

{{#if filePath}}
File: {{filePath}}
{{/if}}

\`\`\`{{language}}
{{code}}
\`\`\`

{{#if userMessage}}
Specific question: {{userMessage}}
{{/if}}

Provide a clear explanation covering:
1. What the code does
2. How it works
3. Key concepts and patterns used
4. Any potential issues or improvements`,
    variables: [
      { name: 'code', type: 'string', required: true },
      { name: 'language', type: 'string', required: false, default: '' },
      { name: 'filePath', type: 'string', required: false },
      { name: 'userMessage', type: 'string', required: false },
    ],
    tags: ['explain', 'code'],
    version: '1.0.0',
  });

  return engine;
}
