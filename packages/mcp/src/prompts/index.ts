/**
 * Titan AI MCP - Prompt Templates
 */

import type { MCPPrompt, PromptMessage } from '../types.js';

/**
 * Code review prompt
 */
export const codeReviewPrompt: MCPPrompt = {
  name: 'code-review',
  description: 'Review code for quality, security, and best practices',
  arguments: [
    {
      name: 'code',
      description: 'The code to review',
      required: true,
    },
    {
      name: 'language',
      description: 'Programming language',
      required: false,
    },
  ],
};

/**
 * Refactoring prompt
 */
export const refactoringPrompt: MCPPrompt = {
  name: 'refactor',
  description: 'Suggest refactoring improvements',
  arguments: [
    {
      name: 'code',
      description: 'The code to refactor',
      required: true,
    },
    {
      name: 'goal',
      description: 'Refactoring goal',
      required: false,
    },
  ],
};

/**
 * Test generation prompt
 */
export const testGenerationPrompt: MCPPrompt = {
  name: 'generate-tests',
  description: 'Generate unit tests for code',
  arguments: [
    {
      name: 'code',
      description: 'The code to test',
      required: true,
    },
    {
      name: 'framework',
      description: 'Test framework (jest, vitest, pytest)',
      required: false,
    },
  ],
};

/**
 * Create a prompt message
 */
export function createPromptMessage(
  role: 'user' | 'assistant',
  text: string
): PromptMessage {
  return {
    role,
    content: {
      type: 'text',
      text,
    },
  };
}

/**
 * All built-in prompts
 */
export const builtInPrompts: MCPPrompt[] = [
  codeReviewPrompt,
  refactoringPrompt,
  testGenerationPrompt,
];
