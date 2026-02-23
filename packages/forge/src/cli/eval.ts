#!/usr/bin/env node
import { runEvalCLI } from '../eval.js';

runEvalCLI().catch((err) => {
  console.error('[forge/eval] Fatal:', err);
  process.exit(1);
});
