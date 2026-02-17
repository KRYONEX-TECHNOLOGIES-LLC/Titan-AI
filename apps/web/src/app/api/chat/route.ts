/**
 * Chat Completion API
 * Routes requests to the configured LLM provider
 */

import { NextRequest, NextResponse } from 'next/server';

export interface ChatRequest {
  sessionId: string;
  message: string;
  model: string;
  codeContext?: {
    file: string;
    content: string;
    selection?: string;
    language: string;
  };
  contextFiles?: string[];
}

export interface ChatResponse {
  id: string;
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  suggestedEdits?: Array<{
    file: string;
    content: string;  // Full new file content for diff preview
    range?: { startLine: number; endLine: number };
    oldContent?: string;
    newContent?: string;
  }>;
}

/**
 * POST /api/chat - Send a chat message
 */
export async function POST(request: NextRequest) {
  const body: ChatRequest = await request.json();
  const { message, model, codeContext } = body;

  // Build system prompt with code context
  let systemPrompt = `You are Titan AI, an elite coding assistant integrated into the Titan AI IDE.
You have access to the user's code and can provide contextual assistance.

Guidelines:
- Provide precise, actionable code suggestions
- When suggesting code changes, use diff format (- for removed, + for added)
- Reference specific line numbers when discussing code
- Keep explanations concise but thorough
- If you suggest changes, format them as code blocks
`;

  if (codeContext) {
    systemPrompt += `
Current file: ${codeContext.file}
Language: ${codeContext.language}

${codeContext.selection ? `Selected code:\n\`\`\`${codeContext.language}\n${codeContext.selection}\n\`\`\`` : ''}

Full file context:
\`\`\`${codeContext.language}
${codeContext.content}
\`\`\`
`;
  }

  // Simulate AI response (in production, call LiteLLM/OpenRouter)
  const response = await simulateAIResponse(message, model, codeContext);

  return NextResponse.json({
    id: `chat-${Date.now()}`,
    content: response.content,
    model,
    usage: response.usage,
    suggestedEdits: response.suggestedEdits,
  });
}

/**
 * Simulate AI response (replace with actual LLM call in production)
 */
async function simulateAIResponse(
  message: string,
  model: string,
  codeContext?: ChatRequest['codeContext']
): Promise<{
  content: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  suggestedEdits?: ChatResponse['suggestedEdits'];
}> {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 500));

  const lowerMessage = message.toLowerCase();
  let content: string;
  let suggestedEdits: ChatResponse['suggestedEdits'];

  if (lowerMessage.includes('explain')) {
    content = codeContext
      ? `I can see you're working on \`${codeContext.file}\`. ${
          codeContext.selection
            ? `The selected code is a ${detectCodeType(codeContext.selection)} that handles specific functionality.`
            : 'This file contains well-structured code.'
        } Would you like me to explain any specific part in more detail?`
      : 'Please select some code or provide context for me to explain.';
  } else if (lowerMessage.includes('refactor') || lowerMessage.includes('improve')) {
    content = `I've analyzed the code and found several areas for improvement:

1. **Type Safety**: Adding explicit type annotations
2. **Error Handling**: Added try-catch blocks for async operations
3. **Performance**: Added memoization for expensive computations

**The diff is now visible in the editor.** Click **Apply** to accept the changes.`;

    if (codeContext?.content) {
      // Generate improved version of the code
      const improvedCode = codeContext.content
        .replace(/function (\w+)\(/g, 'function $1<T>(')
        .replace(/const (\w+) = async/g, 'const $1 = async /* @memoized */')
        .replace(/return /g, '// Improved: Added type checking\n  return ');
      
      suggestedEdits = [{
        file: codeContext.file,
        content: `// Refactored with improvements\n// - Added type annotations\n// - Added memoization hints\n// - Added error handling comments\n\n${improvedCode}`,
        range: { startLine: 1, endLine: codeContext.content.split('\n').length },
        oldContent: codeContext.content,
        newContent: improvedCode,
      }];
    }
  } else if (lowerMessage.includes('test')) {
    const testCode = `import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

describe('Component', () => {
  it('should render correctly', () => {
    const result = render(<Component />);
    expect(result).toBeDefined();
  });

  it('should handle user input', () => {
    const { getByRole } = render(<Component />);
    fireEvent.click(getByRole('button'));
    expect(screen.getByText('clicked')).toBeInTheDocument();
  });

  it('should handle edge cases', () => {
    const mockFn = vi.fn();
    render(<Component onAction={mockFn} />);
    fireEvent.click(screen.getByRole('button'));
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should display error state', () => {
    render(<Component error="Test error" />);
    expect(screen.getByText('Test error')).toBeInTheDocument();
  });
});`;

    content = `I've generated comprehensive unit tests. **The test code is shown as a diff.**

Tests include:
- Basic rendering tests
- User interaction tests
- Edge case handling
- Error state validation

Click **Apply** to add these tests.`;

    if (codeContext?.file) {
      const testFileName = codeContext.file.replace(/\.(tsx?|jsx?)$/, '.test$&');
      suggestedEdits = [{
        file: testFileName,
        content: testCode,
      }];
    }
  } else if (lowerMessage.includes('bug') || lowerMessage.includes('fix') || lowerMessage.includes('error')) {
    content = `I've scanned the code and applied fixes:

**Fixed issues:**
1. Added null-safe optional chaining (?.)
2. Added nullish coalescing for defaults (??)
3. Added input validation

**The diff is now visible in the editor.** Click **Apply** to accept the changes.`;

    if (codeContext?.content) {
      // Apply common fixes to the code
      const fixedCode = codeContext.content
        .replace(/(\w+)\[0\]\.(\w+)/g, '$1[0]?.$2 ?? null')
        .replace(/\.filter\((\w+) =>/g, '.filter(($1): $1 is NonNullable<typeof $1> =>')
        .replace(/JSON\.parse\((\w+)\)/g, 'JSON.parse($1 || "{}")')
        .replace(/(\w+)\.length/g, '($1?.length ?? 0)');
      
      suggestedEdits = [{
        file: codeContext.file,
        content: `// Bug fixes applied\n// - Added null safety checks\n// - Added default values\n\n${fixedCode}`,
        range: { startLine: 1, endLine: codeContext.content.split('\n').length },
      }];
    }
  } else if (lowerMessage.includes('add') || lowerMessage.includes('create') || lowerMessage.includes('implement')) {
    const newFeatureCode = `
// ═══ NEW FEATURE IMPLEMENTATION ═══
interface FeatureResult {
  success: boolean;
  data: unknown;
  error?: string;
}

export async function newFeature(input: string): Promise<FeatureResult> {
  try {
    // Validate input
    if (!input || typeof input !== 'string') {
      throw new Error('Input is required and must be a string');
    }

    // Process the input
    const processedData = await processInput(input);
    
    // Return success result
    return {
      success: true,
      data: processedData,
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function processInput(input: string): Promise<string> {
  // Simulated processing
  return input.toUpperCase();
}
`;

    content = `I've implemented the feature. **The diff is now visible in the editor.**

The implementation includes:
1. TypeScript types/interfaces
2. Async error handling
3. Input validation
4. Clean return types

Click **Apply** to accept the changes.`;

    if (codeContext?.content) {
      suggestedEdits = [{
        file: codeContext.file,
        content: codeContext.content + '\n' + newFeatureCode,
        range: { startLine: codeContext.content.split('\n').length, endLine: codeContext.content.split('\n').length + 30 },
      }];
    }
  } else {
    content = `I'll help you with that. ${
      codeContext ? `I can see you're working on \`${codeContext.file}\`.` : ''
    } 

What specific changes would you like me to make? I can:
- **Explain** code logic and patterns
- **Refactor** for better structure
- **Fix** bugs and issues
- **Generate** tests
- **Implement** new features`;
  }

  return {
    content,
    usage: {
      promptTokens: Math.floor(Math.random() * 500) + 200,
      completionTokens: Math.floor(Math.random() * 300) + 100,
      totalTokens: Math.floor(Math.random() * 800) + 300,
    },
    suggestedEdits,
  };
}

function detectCodeType(code: string): string {
  if (code.includes('class ')) return 'class definition';
  if (code.includes('function ') || code.includes('=>')) return 'function';
  if (code.includes('interface ')) return 'interface';
  if (code.includes('type ')) return 'type alias';
  if (code.includes('export ')) return 'module export';
  return 'code block';
}
