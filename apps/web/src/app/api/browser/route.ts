import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

let browserInstance: any = null;

async function getBrowser() {
  if (browserInstance) return browserInstance;
  try {
    const { createBrowserServer } = await import('@titan/mcp-servers');
    browserInstance = createBrowserServer();
    await browserInstance.initialize();
    return browserInstance;
  } catch (err) {
    console.warn('Browser server not available:', err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tool, args } = body as { tool: string; args: Record<string, unknown> };

    if (!tool) {
      return NextResponse.json({ success: false, error: 'tool name required' }, { status: 400 });
    }

    const browser = await getBrowser();
    if (!browser) {
      return NextResponse.json({
        success: false,
        error: 'Browser automation not available. Playwright may not be installed.',
      }, { status: 503 });
    }

    const toolDef = browser.tools.find((t: any) => t.name === tool);
    if (!toolDef) {
      return NextResponse.json({ success: false, error: `Unknown browser tool: ${tool}` }, { status: 400 });
    }

    const result = await toolDef.handler(args || {});
    const isError = result.isError === true;
    const textContent = result.content
      ?.filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n') || '';
    const imageContent = result.content?.find((c: any) => c.type === 'image');

    return NextResponse.json({
      success: !isError,
      output: textContent,
      screenshot: imageContent ? imageContent.data : undefined,
      mimeType: imageContent ? imageContent.mimeType : undefined,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Browser command failed',
    }, { status: 500 });
  }
}
