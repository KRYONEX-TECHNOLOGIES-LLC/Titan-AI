import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tool, args } = body as { tool: string; args: Record<string, unknown> };

    if (!tool) {
      return NextResponse.json({ success: false, error: 'tool name required' }, { status: 400 });
    }

    let browserMod: any;
    try {
      browserMod = await import(/* webpackIgnore: true */ '@titan/mcp-servers');
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Browser automation requires the desktop app with Playwright installed. Not available in web deployment.',
      }, { status: 503 });
    }

    const server = browserMod.createBrowserServer();
    await server.initialize();

    const toolDef = server.tools.find((t: any) => t.name === tool);
    if (!toolDef) {
      await server.shutdown();
      return NextResponse.json({ success: false, error: `Unknown browser tool: ${tool}` }, { status: 400 });
    }

    const result = await toolDef.handler(args || {});
    await server.shutdown();

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
