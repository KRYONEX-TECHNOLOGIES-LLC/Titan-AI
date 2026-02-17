#!/usr/bin/env node
/**
 * Titan AI CLI
 */

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { indexCommand } from './commands/index-cmd';
import { chatCommand } from './commands/chat';
import { agentCommand } from './commands/agent';
import { serveCommand } from './commands/serve';
import { configCommand } from './commands/config';
import { midnightCommand } from './commands/midnight';

const program = new Command();

program
  .name('titan')
  .description('Titan AI - Next-generation AI-native IDE')
  .version('0.1.0');

// Register commands
program.addCommand(initCommand);
program.addCommand(indexCommand);
program.addCommand(chatCommand);
program.addCommand(agentCommand);
program.addCommand(serveCommand);
program.addCommand(configCommand);
program.addCommand(midnightCommand);

// Parse arguments
program.parse();
