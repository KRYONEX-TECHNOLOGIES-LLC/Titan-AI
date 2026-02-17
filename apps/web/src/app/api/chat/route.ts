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
    range: { startLine: number; endLine: number };
    oldContent: string;
    newContent: string;
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

1. **Type Safety**: Consider adding explicit type annotations
2. **Error Handling**: Add try-catch blocks for async operations
3. **Performance**: Consider memoization for expensive computations

Would you like me to apply these changes?`;

    if (codeContext?.selection) {
      suggestedEdits = [{
        file: codeContext.file,
        range: { startLine: 1, endLine: 10 },
        oldContent: codeContext.selection,
        newContent: `// Refactored version with improvements\n${codeContext.selection}`,
      }];
    }
  } else if (lowerMessage.includes('test')) {
    const testCode = `describe('Component', () => {
  it('should render correctly', () => {
    const result = render(<Component />);
    expect(result).toBeDefined();
  });

  it('should handle user input', () => {
    const { getByRole } = render(<Component />);
    fireEvent.click(getByRole('button'));
    expect(screen.getByText('clicked')).toBeInTheDocument();
  });
});`;

    content = `I'll generate comprehensive unit tests:\n\n\`\`\`typescript\n${testCode}\n\`\`\`\n\nShall I create a test file with these tests?`;
  } else if (lowerMessage.includes('bug') || lowerMessage.includes('fix') || lowerMessage.includes('error')) {
    content = `I've scanned the code for potential issues:

**Found 1 potential bug:**
- Possible null reference when array is empty

**Suggested fix:**
\`\`\`typescript
// Before
return items[0].value;

// After  
return items[0]?.value ?? defaultValue;
\`\`\`

Would you like me to apply this fix?`;
  } else if (lowerMessage.includes('add') || lowerMessage.includes('create') || lowerMessage.includes('implement')) {
    content = `I'll implement that feature. Here's my plan:

1. Create the necessary types/interfaces
2. Implement the core logic
3. Add error handling
4. Write tests

Let me generate the code:

\`\`\`typescript
// New implementation
export function newFeature(input: string): Result {
  // Validate input
  if (!input) {
    throw new Error('Input is required');
  }
  
  // Process and return result
  return {
    success: true,
    data: processInput(input),
  };
}
\`\`\`

Should I apply these changes to your codebase?`;
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
