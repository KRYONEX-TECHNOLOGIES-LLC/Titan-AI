/**
 * MCP Browser Server using Playwright
 */

import type { MCPServer, MCPServerConfig, MCPTool, MCPToolResult } from './types';

// Playwright types (lazy loaded)
type Browser = any;
type Page = any;

export class BrowserServer implements MCPServer {
  config: MCPServerConfig = {
    id: 'browser',
    name: 'Browser Server',
    version: '1.0.0',
    capabilities: ['tools'],
  };

  private browser: Browser | null = null;
  private pages: Map<string, Page> = new Map();
  private playwright: any = null;
  tools: MCPTool[];

  constructor() {
    this.tools = this.createTools();
  }

  async initialize(): Promise<void> {
    try {
      this.playwright = await import('playwright');
      this.browser = await this.playwright.chromium.launch({ headless: true });
    } catch (error) {
      console.warn('Playwright not available:', error);
    }
  }

  async shutdown(): Promise<void> {
    for (const page of this.pages.values()) {
      await page.close();
    }
    this.pages.clear();
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private createTools(): MCPTool[] {
    return [
      {
        name: 'browser_navigate',
        description: 'Navigate to a URL',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to navigate to' },
            pageId: { type: 'string', description: 'Page identifier (creates new if not exists)' },
          },
          required: ['url'],
        },
        handler: async (input) => this.navigate(input.url as string, input.pageId as string),
      },
      {
        name: 'browser_screenshot',
        description: 'Take a screenshot of the current page',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Page identifier' },
            fullPage: { type: 'boolean', description: 'Capture full page' },
          },
        },
        handler: async (input) => this.screenshot(input.pageId as string, input.fullPage as boolean),
      },
      {
        name: 'browser_click',
        description: 'Click on an element',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector' },
            pageId: { type: 'string', description: 'Page identifier' },
          },
          required: ['selector'],
        },
        handler: async (input) => this.click(input.selector as string, input.pageId as string),
      },
      {
        name: 'browser_type',
        description: 'Type text into an element',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector' },
            text: { type: 'string', description: 'Text to type' },
            pageId: { type: 'string', description: 'Page identifier' },
          },
          required: ['selector', 'text'],
        },
        handler: async (input) => this.type(input.selector as string, input.text as string, input.pageId as string),
      },
      {
        name: 'browser_get_text',
        description: 'Get text content of an element',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector' },
            pageId: { type: 'string', description: 'Page identifier' },
          },
          required: ['selector'],
        },
        handler: async (input) => this.getText(input.selector as string, input.pageId as string),
      },
      {
        name: 'browser_get_html',
        description: 'Get HTML content of the page or element',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector (optional, gets full page if omitted)' },
            pageId: { type: 'string', description: 'Page identifier' },
          },
        },
        handler: async (input) => this.getHtml(input.selector as string, input.pageId as string),
      },
      {
        name: 'browser_evaluate',
        description: 'Execute JavaScript in the browser context',
        inputSchema: {
          type: 'object',
          properties: {
            script: { type: 'string', description: 'JavaScript code to execute' },
            pageId: { type: 'string', description: 'Page identifier' },
          },
          required: ['script'],
        },
        handler: async (input) => this.evaluate(input.script as string, input.pageId as string),
      },
      {
        name: 'browser_wait',
        description: 'Wait for an element or condition',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector to wait for' },
            timeout: { type: 'number', description: 'Timeout in milliseconds' },
            pageId: { type: 'string', description: 'Page identifier' },
          },
          required: ['selector'],
        },
        handler: async (input) => this.wait(input.selector as string, input.timeout as number, input.pageId as string),
      },
      {
        name: 'browser_scroll',
        description: 'Scroll the page up or down, or to a specific element',
        inputSchema: {
          type: 'object',
          properties: {
            direction: { type: 'string', description: 'up, down, or to_element' },
            amount: { type: 'number', description: 'Pixels to scroll (default 500)' },
            selector: { type: 'string', description: 'CSS selector to scroll to (when direction=to_element)' },
            pageId: { type: 'string', description: 'Page identifier' },
          },
        },
        handler: async (input) => this.scroll(input.direction as string, input.amount as number, input.selector as string, input.pageId as string),
      },
      {
        name: 'browser_back',
        description: 'Go back in browser history',
        inputSchema: {
          type: 'object',
          properties: { pageId: { type: 'string', description: 'Page identifier' } },
        },
        handler: async (input) => this.goBack(input.pageId as string),
      },
      {
        name: 'browser_forward',
        description: 'Go forward in browser history',
        inputSchema: {
          type: 'object',
          properties: { pageId: { type: 'string', description: 'Page identifier' } },
        },
        handler: async (input) => this.goForward(input.pageId as string),
      },
      {
        name: 'browser_select',
        description: 'Select an option from a dropdown',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector for the select element' },
            value: { type: 'string', description: 'Value to select' },
            pageId: { type: 'string', description: 'Page identifier' },
          },
          required: ['selector', 'value'],
        },
        handler: async (input) => this.selectOption(input.selector as string, input.value as string, input.pageId as string),
      },
      {
        name: 'browser_close_page',
        description: 'Close a browser page',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Page identifier' },
          },
          required: ['pageId'],
        },
        handler: async (input) => this.closePage(input.pageId as string),
      },
    ];
  }

  private async getOrCreatePage(pageId?: string): Promise<Page> {
    const id = pageId || 'default';
    
    if (this.pages.has(id)) {
      return this.pages.get(id)!;
    }

    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const page = await this.browser.newPage();
    this.pages.set(id, page);
    return page;
  }

  private async navigate(url: string, pageId?: string): Promise<MCPToolResult> {
    try {
      const page = await this.getOrCreatePage(pageId);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const title = await page.title();
      return { content: [{ type: 'text', text: `Navigated to: ${url}\nTitle: ${title}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async screenshot(pageId?: string, fullPage?: boolean): Promise<MCPToolResult> {
    try {
      const page = await this.getOrCreatePage(pageId);
      const buffer = await page.screenshot({ fullPage: fullPage ?? false });
      const base64 = buffer.toString('base64');
      return { 
        content: [{ 
          type: 'image', 
          data: base64, 
          mimeType: 'image/png' 
        }] 
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async click(selector: string, pageId?: string): Promise<MCPToolResult> {
    try {
      const page = await this.getOrCreatePage(pageId);
      await page.click(selector);
      return { content: [{ type: 'text', text: `Clicked: ${selector}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async type(selector: string, text: string, pageId?: string): Promise<MCPToolResult> {
    try {
      const page = await this.getOrCreatePage(pageId);
      await page.fill(selector, text);
      return { content: [{ type: 'text', text: `Typed into ${selector}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async getText(selector: string, pageId?: string): Promise<MCPToolResult> {
    try {
      const page = await this.getOrCreatePage(pageId);
      const text = await page.textContent(selector);
      return { content: [{ type: 'text', text: text || '(empty)' }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async getHtml(selector?: string, pageId?: string): Promise<MCPToolResult> {
    try {
      const page = await this.getOrCreatePage(pageId);
      let html: string;
      
      if (selector) {
        html = await page.$eval(selector, (el: Element) => el.outerHTML);
      } else {
        html = await page.content();
      }
      
      return { content: [{ type: 'text', text: html }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async evaluate(script: string, pageId?: string): Promise<MCPToolResult> {
    try {
      const page = await this.getOrCreatePage(pageId);
      const result = await page.evaluate(script);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async wait(selector: string, timeout?: number, pageId?: string): Promise<MCPToolResult> {
    try {
      const page = await this.getOrCreatePage(pageId);
      await page.waitForSelector(selector, { timeout: timeout || 30000 });
      return { content: [{ type: 'text', text: `Element found: ${selector}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async scroll(direction?: string, amount?: number, selector?: string, pageId?: string): Promise<MCPToolResult> {
    try {
      const page = await this.getOrCreatePage(pageId);
      if (direction === 'to_element' && selector) {
        await page.locator(selector).scrollIntoViewIfNeeded();
        return { content: [{ type: 'text', text: `Scrolled to element: ${selector}` }] };
      }
      const px = amount || 500;
      const dy = direction === 'up' ? -px : px;
      await page.evaluate((d: number) => window.scrollBy(0, d), dy);
      return { content: [{ type: 'text', text: `Scrolled ${direction || 'down'} by ${px}px` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async goBack(pageId?: string): Promise<MCPToolResult> {
    try {
      const page = await this.getOrCreatePage(pageId);
      await page.goBack({ waitUntil: 'domcontentloaded' });
      const title = await page.title();
      return { content: [{ type: 'text', text: `Went back. Now on: ${title}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async goForward(pageId?: string): Promise<MCPToolResult> {
    try {
      const page = await this.getOrCreatePage(pageId);
      await page.goForward({ waitUntil: 'domcontentloaded' });
      const title = await page.title();
      return { content: [{ type: 'text', text: `Went forward. Now on: ${title}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async selectOption(selector: string, value: string, pageId?: string): Promise<MCPToolResult> {
    try {
      const page = await this.getOrCreatePage(pageId);
      await page.selectOption(selector, value);
      return { content: [{ type: 'text', text: `Selected "${value}" in ${selector}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async closePage(pageId: string): Promise<MCPToolResult> {
    const page = this.pages.get(pageId);
    if (!page) {
      return { content: [{ type: 'text', text: `Page not found: ${pageId}` }], isError: true };
    }

    await page.close();
    this.pages.delete(pageId);
    return { content: [{ type: 'text', text: `Closed page: ${pageId}` }] };
  }
}

export function createBrowserServer(): BrowserServer {
  return new BrowserServer();
}
