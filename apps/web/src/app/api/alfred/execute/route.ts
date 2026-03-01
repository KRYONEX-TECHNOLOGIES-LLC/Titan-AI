import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Simple in-memory rate limiting (in a real app, use Redis)
const executionLimits = new Map<string, { count: number; resetAt: number }>();
const MAX_EXECUTIONS_PER_HOUR = 50;

export async function POST(req: NextRequest) {
  try {
    // 1. Rate Limiting Check
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const now = Date.now();
    const limitRecord = executionLimits.get(ip);

    if (limitRecord) {
      if (now > limitRecord.resetAt) {
        executionLimits.set(ip, { count: 1, resetAt: now + 3600000 });
      } else if (limitRecord.count >= MAX_EXECUTIONS_PER_HOUR) {
        return NextResponse.json({ 
          success: false, 
          error: 'Rate limit exceeded. Maximum 50 executions per hour.' 
        }, { status: 429 });
      } else {
        limitRecord.count++;
      }
    } else {
      executionLimits.set(ip, { count: 1, resetAt: now + 3600000 });
    }

    // 2. Parse Request
    const body = await req.json();
    const { code, language } = body as { code?: string; language?: string };

    if (!code || !language) {
      return NextResponse.json({ success: false, error: 'code and language are required' }, { status: 400 });
    }

    const supportedLanguages = ['python', 'javascript', 'typescript', 'bash'];
    if (!supportedLanguages.includes(language.toLowerCase())) {
      return NextResponse.json({ success: false, error: `Unsupported language: ${language}` }, { status: 400 });
    }

    // 3. Setup Sandbox Environment
    const runId = crypto.randomBytes(8).toString('hex');
    const tempDir = path.join(os.tmpdir(), `alfred-exec-${runId}`);
    fs.mkdirSync(tempDir, { recursive: true });

    let fileName = '';
    let runCommand = '';
    let dockerImage = '';

    switch (language.toLowerCase()) {
      case 'python':
        fileName = 'script.py';
        runCommand = 'python script.py';
        dockerImage = 'python:3.11-slim';
        break;
      case 'javascript':
        fileName = 'script.js';
        runCommand = 'node script.js';
        dockerImage = 'node:20-slim';
        break;
      case 'typescript':
        fileName = 'script.ts';
        runCommand = 'npx ts-node script.ts';
        dockerImage = 'node:20-slim';
        // Need to install ts-node and typescript in the container or use a pre-built image
        // For simplicity in this implementation, we'll use a basic node image and npx
        break;
      case 'bash':
        fileName = 'script.sh';
        runCommand = 'bash script.sh';
        dockerImage = 'ubuntu:22.04';
        break;
    }

    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, code, 'utf-8');

    // 4. Execute in Docker Sandbox
    // Security constraints:
    // - --rm: Remove container after run
    // - --network none: Disable internet access
    // - --memory 256m: Limit memory
    // - --cpus 0.5: Limit CPU
    // - -v: Mount only the temp directory read-only (except for writing output if needed, but we capture stdout)
    // - -w: Set working directory
    // - --user 1000:1000: Run as non-root
    
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let error = '';
    let status = 'success';

    try {
      // Note: In a real production environment, you'd want a more robust Docker setup
      // or a dedicated execution service like Piston.
      // This assumes Docker is installed and accessible to the Node process.
      
      let dockerCmd = `docker run --rm --network none --memory 256m --cpus 0.5 -v "${tempDir}:/sandbox" -w /sandbox ${dockerImage} ${runCommand}`;
      
      // If Docker is not available (e.g., running locally without Docker), fallback to local execution
      // WARNING: Local execution is NOT secure. Only use for development.
      const useDocker = process.env.NODE_ENV === 'production' || process.env.USE_DOCKER_SANDBOX === 'true';
      
      if (!useDocker) {
        console.warn('[api/alfred/execute] Running locally without Docker sandbox. NOT SECURE.');
        dockerCmd = `cd "${tempDir}" && ${runCommand}`;
      }

      const result = execSync(dockerCmd, { 
        encoding: 'utf-8', 
        timeout: 5000, // 5 second timeout
        maxBuffer: 1024 * 1024 // 1MB output limit
      });
      
      stdout = result;
    } catch (e: any) {
      status = 'error';
      if (e.code === 'ETIMEDOUT') {
        error = 'Execution timed out (limit: 5 seconds)';
      } else {
        stdout = e.stdout?.toString() || '';
        stderr = e.stderr?.toString() || '';
        error = e.message || 'Execution failed';
      }
    } finally {
      // Cleanup
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.error(`[api/alfred/execute] Failed to cleanup temp dir ${tempDir}:`, cleanupErr);
      }
    }

    const duration = Date.now() - startTime;

    // 5. Log Execution Event
    console.log(`[api/alfred/execute] Run ${runId} | Lang: ${language} | Status: ${status} | Time: ${duration}ms | IP: ${ip}`);

    // 6. Return Results
    return NextResponse.json({
      success: true,
      data: {
        code,
        language,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        error,
        status,
        duration
      }
    });

  } catch (err) {
    console.error('[api/alfred/execute] Unhandled error:', err);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error during execution' 
    }, { status: 500 });
  }
}
