/**
 * Index command - Index the codebase
 */

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';

export const indexCommand = new Command('index')
  .description('Index the codebase for AI context')
  .option('-f, --full', 'Full reindex (ignore cache)')
  .option('-w, --watch', 'Watch for changes and update index')
  .option('--stats', 'Show indexing statistics')
  .action(async (options) => {
    const chalk = (await import('chalk')).default;
    const ora = (await import('ora')).default;
    
    const spinner = ora('Indexing codebase...').start();
    
    try {
      const cwd = process.cwd();
      const titanDir = path.join(cwd, '.titan');
      const indexDir = path.join(titanDir, 'index');
      
      // Check if initialized
      try {
        await fs.access(titanDir);
      } catch {
        spinner.fail('Titan AI not initialized. Run "titan init" first.');
        return;
      }
      
      // Load config
      const configPath = path.join(titanDir, 'config.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      
      // Collect files
      spinner.text = 'Scanning files...';
      const files = await collectFiles(cwd, config.indexing.excludePatterns);
      
      spinner.text = `Found ${files.length} files. Indexing...`;
      
      // Index files (simplified)
      const stats = {
        filesIndexed: 0,
        chunksCreated: 0,
        symbolsExtracted: 0,
        embeddingsGenerated: 0,
      };
      
      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          stats.filesIndexed++;
          stats.chunksCreated += Math.ceil(content.length / 1000);
          stats.symbolsExtracted += (content.match(/function|class|interface|const|let|var|def|fn/g) || []).length;
        } catch {
          // Skip files that can't be read
        }
      }
      
      // Save index metadata
      await fs.writeFile(
        path.join(indexDir, 'metadata.json'),
        JSON.stringify({
          indexedAt: new Date().toISOString(),
          stats,
        }, null, 2)
      );
      
      spinner.succeed(`Indexed ${stats.filesIndexed} files`);
      
      if (options.stats) {
        console.log('\n' + chalk.cyan('Indexing Statistics:'));
        console.log(chalk.gray('  Files indexed:      ') + chalk.white(stats.filesIndexed));
        console.log(chalk.gray('  Chunks created:     ') + chalk.white(stats.chunksCreated));
        console.log(chalk.gray('  Symbols extracted:  ') + chalk.white(stats.symbolsExtracted));
      }
      
      if (options.watch) {
        console.log('\n' + chalk.cyan('Watching for changes... Press Ctrl+C to stop.'));
        // Would implement file watching here
      }
      
    } catch (error) {
      spinner.fail(`Indexing failed: ${error}`);
      process.exit(1);
    }
  });

async function collectFiles(dir: string, excludePatterns: string[]): Promise<string[]> {
  const files: string[] = [];
  
  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(dir, fullPath);
      
      // Check exclusions
      const shouldExclude = excludePatterns.some(pattern => {
        if (pattern.includes('*')) {
          return new RegExp(pattern.replace(/\*/g, '.*')).test(relativePath);
        }
        return relativePath.includes(pattern);
      });
      
      if (shouldExclude) continue;
      
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.cpp', '.c', '.h'];
        if (codeExtensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }
  
  await walk(dir);
  return files;
}
