import type { ProjectAutopsy, ToolCallFn, WorkOrderDAG } from './omega-model';

function inferBoilerplate(path: string): string {
  if (path.endsWith('.ts') || path.endsWith('.tsx')) {
    return `// Omega scaffold: generated boilerplate\n\nexport {};\n`;
  }
  if (path.endsWith('.py')) {
    return '# Omega scaffold: generated boilerplate\n\n';
  }
  if (path.endsWith('.md')) {
    return '# Omega scaffold\n\n';
  }
  return '';
}

export async function scaffoldWorkOrders(
  dag: WorkOrderDAG,
  _autopsy: ProjectAutopsy,
  executeToolCall: ToolCallFn,
): Promise<void> {
  for (const node of dag.nodes.values()) {
    const preloadedContent: Record<string, string> = {};

    for (const requiredFile of node.inputContract.requiredFiles) {
      const res = await executeToolCall('read_file', { path: requiredFile });
      if (res.success) preloadedContent[requiredFile] = res.output || '';
    }

    for (const expectedFile of node.outputContract.expectedFiles) {
      const check = await executeToolCall('read_file', { path: expectedFile });
      if (!check.success) {
        await executeToolCall('create_file', {
          path: expectedFile,
          content: inferBoilerplate(expectedFile),
        });
      }
    }

    dag.nodes.set(node.id, {
      ...node,
      status: 'SCAFFOLDED',
      inputContract: {
        ...node.inputContract,
        preloadedContent: {
          ...(node.inputContract.preloadedContent || {}),
          ...preloadedContent,
        },
      },
    });
  }
}
