/**
 * MCP Database Server
 */

import type { MCPServer, MCPServerConfig, MCPTool, MCPToolResult } from './types';

export interface DatabaseConfig {
  type: 'sqlite' | 'postgres' | 'mysql' | 'mongodb';
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

export class DatabaseServer implements MCPServer {
  config: MCPServerConfig = {
    id: 'database',
    name: 'Database Server',
    version: '1.0.0',
    capabilities: ['tools'],
  };

  private dbConfig: DatabaseConfig;
  private connection: any = null;
  tools: MCPTool[];

  constructor(dbConfig: DatabaseConfig) {
    this.dbConfig = dbConfig;
    this.tools = this.createTools();
  }

  async initialize(): Promise<void> {
    // Connection would be established based on database type
    // For now, this is a placeholder implementation
  }

  async shutdown(): Promise<void> {
    if (this.connection) {
      // Close connection based on database type
      this.connection = null;
    }
  }

  private createTools(): MCPTool[] {
    return [
      {
        name: 'db_query',
        description: 'Execute a SQL query',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'SQL query to execute' },
            params: { type: 'array', description: 'Query parameters' },
          },
          required: ['query'],
        },
        handler: async (input) => this.query(input.query as string, input.params as unknown[]),
      },
      {
        name: 'db_execute',
        description: 'Execute a SQL statement (INSERT, UPDATE, DELETE)',
        inputSchema: {
          type: 'object',
          properties: {
            statement: { type: 'string', description: 'SQL statement to execute' },
            params: { type: 'array', description: 'Statement parameters' },
          },
          required: ['statement'],
        },
        handler: async (input) => this.execute(input.statement as string, input.params as unknown[]),
      },
      {
        name: 'db_list_tables',
        description: 'List all tables in the database',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => this.listTables(),
      },
      {
        name: 'db_describe_table',
        description: 'Describe a table structure',
        inputSchema: {
          type: 'object',
          properties: {
            table: { type: 'string', description: 'Table name' },
          },
          required: ['table'],
        },
        handler: async (input) => this.describeTable(input.table as string),
      },
      {
        name: 'db_transaction',
        description: 'Execute multiple statements in a transaction',
        inputSchema: {
          type: 'object',
          properties: {
            statements: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'SQL statements to execute' 
            },
          },
          required: ['statements'],
        },
        handler: async (input) => this.transaction(input.statements as string[]),
      },
    ];
  }

  private async query(query: string, params?: unknown[]): Promise<MCPToolResult> {
    try {
      // Placeholder implementation
      // In production, this would use actual database drivers
      const result = await this.executeQuery(query, params);
      
      if (Array.isArray(result) && result.length > 0) {
        // Format as table
        const headers = Object.keys(result[0]);
        const rows = result.map(row => headers.map(h => String(row[h] ?? '')).join(' | '));
        const table = [
          headers.join(' | '),
          headers.map(() => '---').join(' | '),
          ...rows,
        ].join('\n');

        return { content: [{ type: 'text', text: `${result.length} rows returned:\n\n${table}` }] };
      }

      return { content: [{ type: 'text', text: 'Query executed, no results' }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async execute(statement: string, params?: unknown[]): Promise<MCPToolResult> {
    try {
      const result = await this.executeStatement(statement, params);
      return { 
        content: [{ 
          type: 'text', 
          text: `Statement executed. Rows affected: ${result.rowsAffected ?? 0}` 
        }] 
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async listTables(): Promise<MCPToolResult> {
    try {
      let query: string;
      
      switch (this.dbConfig.type) {
        case 'sqlite':
          query = "SELECT name FROM sqlite_master WHERE type='table'";
          break;
        case 'postgres':
          query = "SELECT tablename FROM pg_tables WHERE schemaname = 'public'";
          break;
        case 'mysql':
          query = 'SHOW TABLES';
          break;
        default:
          return { content: [{ type: 'text', text: 'Unsupported database type' }], isError: true };
      }

      const result = await this.executeQuery(query);
      const tables = result.map((row: any) => Object.values(row)[0]);
      
      return { content: [{ type: 'text', text: tables.join('\n') || 'No tables found' }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async describeTable(table: string): Promise<MCPToolResult> {
    try {
      let query: string;
      
      switch (this.dbConfig.type) {
        case 'sqlite':
          query = `PRAGMA table_info(${table})`;
          break;
        case 'postgres':
          query = `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${table}'`;
          break;
        case 'mysql':
          query = `DESCRIBE ${table}`;
          break;
        default:
          return { content: [{ type: 'text', text: 'Unsupported database type' }], isError: true };
      }

      const result = await this.executeQuery(query);
      const columns = result.map((row: any) => {
        const name = row.name || row.column_name || row.Field;
        const type = row.type || row.data_type || row.Type;
        const nullable = row.notnull === 0 || row.is_nullable === 'YES' || row.Null === 'YES';
        return `${name}: ${type}${nullable ? '' : ' NOT NULL'}`;
      });
      
      return { content: [{ type: 'text', text: `Table: ${table}\n\n${columns.join('\n')}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async transaction(statements: string[]): Promise<MCPToolResult> {
    try {
      await this.executeStatement('BEGIN');
      
      let totalAffected = 0;
      for (const statement of statements) {
        const result = await this.executeStatement(statement);
        totalAffected += result.rowsAffected ?? 0;
      }
      
      await this.executeStatement('COMMIT');
      
      return { 
        content: [{ 
          type: 'text', 
          text: `Transaction committed. ${statements.length} statements executed. Total rows affected: ${totalAffected}` 
        }] 
      };
    } catch (error) {
      await this.executeStatement('ROLLBACK');
      return { 
        content: [{ type: 'text', text: `Transaction rolled back. Error: ${error}` }], 
        isError: true 
      };
    }
  }

  // Placeholder methods - would be implemented with actual database drivers
  private async executeQuery(query: string, _params?: unknown[]): Promise<any[]> {
    // In production, this would use actual database drivers
    console.log('Executing query:', query);
    return [];
  }

  private async executeStatement(statement: string, _params?: unknown[]): Promise<{ rowsAffected?: number }> {
    // In production, this would use actual database drivers
    console.log('Executing statement:', statement);
    return { rowsAffected: 0 };
  }
}

export function createDatabaseServer(config: DatabaseConfig): DatabaseServer {
  return new DatabaseServer(config);
}
