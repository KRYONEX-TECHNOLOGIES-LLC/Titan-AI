/**
 * Model Registry API
 * Returns all available AI models grouped by provider.
 */

import { NextResponse } from 'next/server';
import { MODEL_REGISTRY } from '@/lib/model-registry';
export type { ModelInfo } from '@/lib/model-registry';

export async function GET() {
  const byProvider: Record<string, typeof MODEL_REGISTRY> = {};

  for (const model of MODEL_REGISTRY) {
    if (!byProvider[model.provider]) {
      byProvider[model.provider] = [];
    }
    byProvider[model.provider].push(model);
  }

  return NextResponse.json({
    models: MODEL_REGISTRY,
    byProvider,
    total: MODEL_REGISTRY.length,
    providers: Object.keys(byProvider),
  });
}
