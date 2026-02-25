'use client';

import { isElectron, electronAPI } from '@/lib/electron';

export interface CaptureResult {
  dataUrl: string;
  width: number;
  height: number;
  timestamp: number;
}

/**
 * Capture the entire visible viewport as a base64 image.
 * Uses html2canvas in browser, Electron desktopCapturer in desktop.
 */
export async function captureViewport(): Promise<CaptureResult | null> {
  if (typeof window === 'undefined') return null;

  if (isElectron && electronAPI) {
    try {
      const result = await (electronAPI as unknown as Record<string, unknown> & {
        captureScreen?: () => Promise<{ dataUrl: string; width: number; height: number }>;
      }).captureScreen?.();
      if (result) {
        return { ...result, timestamp: Date.now() };
      }
    } catch { /* fall through to html2canvas */ }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const html2canvas = (await import(/* webpackIgnore: true */ 'html2canvas' as string)).default as (el: HTMLElement, opts?: Record<string, unknown>) => Promise<HTMLCanvasElement>;
    const canvas = await html2canvas(document.body, {
      scale: 0.5,
      logging: false,
      useCORS: true,
      width: window.innerWidth,
      height: window.innerHeight,
    });
    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.6),
      width: canvas.width,
      height: canvas.height,
      timestamp: Date.now(),
    };
  } catch {
    return captureViaCanvas();
  }
}

/**
 * Capture a specific DOM element.
 */
export async function captureElement(selector: string): Promise<CaptureResult | null> {
  if (typeof window === 'undefined') return null;

  const element = document.querySelector(selector);
  if (!element) return null;

  try {
    const html2canvas = (await import(/* webpackIgnore: true */ 'html2canvas' as string)).default as (el: HTMLElement, opts?: Record<string, unknown>) => Promise<HTMLCanvasElement>;
    const canvas = await html2canvas(element as HTMLElement, {
      scale: 0.5,
      logging: false,
      useCORS: true,
    });
    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.6),
      width: canvas.width,
      height: canvas.height,
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

function captureViaCanvas(): CaptureResult | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(window.innerWidth, 1280);
    canvas.height = Math.min(window.innerHeight, 720);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ccc';
    ctx.font = '14px monospace';
    ctx.fillText('Titan AI — Viewport Capture (simplified)', 20, 30);
    ctx.fillText(`Resolution: ${window.innerWidth}x${window.innerHeight}`, 20, 50);
    ctx.fillText(`URL: ${window.location.href}`, 20, 70);
    ctx.fillText(`Time: ${new Date().toLocaleTimeString()}`, 20, 90);

    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.5),
      width: canvas.width,
      height: canvas.height,
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Convert a data URL to a compact base64 string for API transmission.
 */
export function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}
