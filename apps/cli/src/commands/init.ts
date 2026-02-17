/**
 * Init command - Initialize Titan AI in a project
 */

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';

export const initCommand = new Command('init')
  .description('Initialize Titan AI in the current directory')
  .option('-f, --force', 'Overwrite existing configuration')
  .option('--no-git', 'Skip git integration')
  .action(async (options) => {
    const chalk = (await import('chalk')).default;
    const ora = (await import('ora')).default;
    
    const spinner = ora('Initializing Titan AI...').start();
    
    try {
      const cwd = process.cwd();
      const titanDir = path.join(cwd, '.titan');
      
      // Check if already initialized
      try {
        await fs.access(titanDir);
        if (!options.force) {
          spinner.fail('Titan AI is already initialized. Use --force to reinitialize.');
          return;
        }
      } catch {
        // Directory doesn't exist, continue
      }
      
      // Create .titan directory
      await fs.mkdir(titanDir, { recursive: true });
      
      // Create config file
      const config = {
        version: '1.0.0',
        project: {
          name: path.basename(cwd),
          root: cwd,
        },
        ai: {
          defaultModel: 'claude-4-sonnet',
          temperature: 0.7,
          maxTokens: 4096,
        },
        indexing: {
          enabled: true,
          excludePatterns: ['node_modules', '.git', 'dist', 'build', '*.lock'],
          languages: ['typescript', 'javascript', 'python', 'rust', 'go'],
        },
        agents: {
          enabled: true,
          maxConcurrent: 3,
          autoFix: false,
        },
        security: {
          telemetry: false,
          secretMasking: true,
        },
      };
      
      await fs.writeFile(
        path.join(titanDir, 'config.json'),
        JSON.stringify(config, null, 2)
      );
      
      // Create directories
      await fs.mkdir(path.join(titanDir, 'cache'), { recursive: true });
      await fs.mkdir(path.join(titanDir, 'index'), { recursive: true });
      await fs.mkdir(path.join(titanDir, 'sessions'), { recursive: true });
      
      // Add to .gitignore if git is enabled
      if (options.git !== false) {
        const gitignorePath = path.join(cwd, '.gitignore');
        let gitignore = '';
        
        try {
          gitignore = await fs.readFile(gitignorePath, 'utf-8');
        } catch {
          // .gitignore doesn't exist
        }
        
        if (!gitignore.includes('.titan/cache')) {
          gitignore += '\n# Titan AI\n.titan/cache\n.titan/index\n.titan/sessions\n';
          await fs.writeFile(gitignorePath, gitignore);
        }
      }
      
      spinner.succeed('Titan AI initialized successfully!');
      
      console.log('\n' + chalk.cyan('Next steps:'));
      console.log(chalk.gray('  1. Run ') + chalk.white('titan index') + chalk.gray(' to index your codebase'));
      console.log(chalk.gray('  2. Run ') + chalk.white('titan chat') + chalk.gray(' to start a conversation'));
      console.log(chalk.gray('  3. Run ') + chalk.white('titan agent') + chalk.gray(' to run AI agents'));
      
    } catch (error) {
      spinner.fail(`Failed to initialize: ${error}`);
      process.exit(1);
    }
  });
