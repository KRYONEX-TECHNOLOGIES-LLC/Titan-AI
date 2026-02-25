/**
 * Config command - Manage Titan AI configuration
 */

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';

export const configCommand = new Command('config')
  .description('Manage Titan AI configuration');

configCommand
  .command('show')
  .description('Show current configuration')
  .action(async () => {
    const chalk = (await import('chalk')).default;
    
    try {
      const config = await loadConfig();
      console.log(chalk.cyan('\nTitan AI Configuration:\n'));
      console.log(JSON.stringify(config, null, 2));
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`));
    }
  });

configCommand
  .command('set <key> <value>')
  .description('Set a configuration value')
  .action(async (key: string, value: string) => {
    const chalk = (await import('chalk')).default;
    
    try {
      const config = await loadConfig();
      
      // Parse the key path (e.g., "ai.model")
      const keys = key.split('.');
      let current: any = config;
      
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i]!;
        if (!(k in current)) {
          current[k] = {};
        }
        current = current[k];
      }
      
      let parsedValue: any = value;
      if (value === 'true') parsedValue = true;
      else if (value === 'false') parsedValue = false;
      else if (!isNaN(Number(value))) parsedValue = Number(value);
      
      current[keys[keys.length - 1]!] = parsedValue;
      
      await saveConfig(config);
      console.log(chalk.green(`✓ Set ${key} = ${parsedValue}`));
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`));
    }
  });

configCommand
  .command('get <key>')
  .description('Get a configuration value')
  .action(async (key: string) => {
    const chalk = (await import('chalk')).default;
    
    try {
      const config = await loadConfig();
      
      const keys = key.split('.');
      let current: any = config;
      
      for (const k of keys) {
        if (current && k in current) {
          current = current[k];
        } else {
          console.log(chalk.yellow('Key not found'));
          return;
        }
      }
      
      console.log(typeof current === 'object' ? JSON.stringify(current, null, 2) : current);
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`));
    }
  });

configCommand
  .command('reset')
  .description('Reset configuration to defaults')
  .action(async () => {
    const chalk = (await import('chalk')).default;
    const inquirer = (await import('inquirer')).default;
    
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Reset all configuration to defaults?',
        default: false,
      },
    ]);
    
    if (!confirm) {
      console.log(chalk.yellow('Cancelled'));
      return;
    }
    
    try {
      const defaultConfig = {
        version: '1.0.0',
        project: {
          name: path.basename(process.cwd()),
          root: process.cwd(),
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
      
      await saveConfig(defaultConfig);
      console.log(chalk.green('✓ Configuration reset to defaults'));
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`));
    }
  });

async function loadConfig(): Promise<any> {
  const configPath = path.join(process.cwd(), '.titan', 'config.json');
  const content = await fs.readFile(configPath, 'utf-8');
  return JSON.parse(content);
}

async function saveConfig(config: any): Promise<void> {
  const configPath = path.join(process.cwd(), '.titan', 'config.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}
