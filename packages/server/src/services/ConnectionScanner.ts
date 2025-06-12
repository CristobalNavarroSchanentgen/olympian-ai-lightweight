import { ScanResult, ConnectionType, ScanProgress } from '@olympian/shared';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as net from 'net';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { MongoClient } from 'mongodb';

const execAsync = promisify(exec);

export class ConnectionScanner extends EventEmitter {
  private scanning = false;

  async scan(types?: ConnectionType[]): Promise<ScanResult[]> {
    if (this.scanning) {
      throw new Error('Scan already in progress');
    }

    this.scanning = true;
    const results: ScanResult[] = [];
    const scanTypes = types || ['ollama', 'mcp', 'database'];

    try {
      for (const type of scanTypes) {
        switch (type) {
          case 'ollama':
            results.push(...(await this.scanOllama()));
            break;
          case 'mcp':
            results.push(...(await this.scanMCP()));
            break;
          case 'database':
            results.push(...(await this.scanDatabases()));
            break;
        }
      }
    } finally {
      this.scanning = false;
    }

    return results;
  }

  private async scanOllama(): Promise<ScanResult[]> {
    const results: ScanResult[] = [];
    const ports = [11434, 11435, 11436]; // Common Ollama ports
    const hosts = ['localhost', '127.0.0.1', '0.0.0.0'];

    this.emitProgress('ollama', 0, ports.length * hosts.length, 'Scanning for Ollama instances...');

    let checked = 0;
    for (const host of hosts) {
      for (const port of ports) {
        const endpoint = `http://${host}:${port}`;
        const isOnline = await this.checkOllamaEndpoint(endpoint);
        
        if (isOnline) {
          results.push({
            type: 'ollama',
            name: `Ollama (${host}:${port})`,
            endpoint,
            status: 'online',
            metadata: { host, port },
          });
        }
        
        checked++;
        this.emitProgress('ollama', checked, ports.length * hosts.length, `Checked ${endpoint}`);
      }
    }

    // Check Docker containers
    try {
      const dockerResults = await this.scanDockerForOllama();
      results.push(...dockerResults);
    } catch (error) {
      logger.debug('Docker scan failed:', error);
    }

    return results;
  }

  private async checkOllamaEndpoint(endpoint: string): Promise<boolean> {
    try {
      const response = await fetch(`${endpoint}/api/version`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async scanDockerForOllama(): Promise<ScanResult[]> {
    const results: ScanResult[] = [];
    
    try {
      const { stdout } = await execAsync('docker ps --format "table {{.Names}}\t{{.Ports}}"');
      const lines = stdout.split('\n').slice(1); // Skip header
      
      for (const line of lines) {
        if (line.includes('ollama')) {
          const [name, ports] = line.split('\t');
          const portMatch = ports.match(/(\d+)->11434/);
          
          if (portMatch) {
            const port = portMatch[1];
            const endpoint = `http://localhost:${port}`;
            
            results.push({
              type: 'ollama',
              name: `Ollama Docker (${name})`,
              endpoint,
              status: 'online',
              metadata: { container: name, port },
            });
          }
        }
      }
    } catch (error) {
      logger.debug('Docker command failed:', error);
    }
    
    return results;
  }

  private async scanMCP(): Promise<ScanResult[]> {
    const results: ScanResult[] = [];
    const mcpPaths = [
      path.join(os.homedir(), '.mcp'),
      path.join(os.homedir(), '.config', 'mcp'),
      '/etc/mcp',
    ];

    this.emitProgress('mcp', 0, mcpPaths.length, 'Scanning for MCP servers...');

    for (let i = 0; i < mcpPaths.length; i++) {
      try {
        const configPath = path.join(mcpPaths[i], 'config.json');
        const config = await fs.readFile(configPath, 'utf-8');
        const parsed = JSON.parse(config);
        
        if (parsed.servers) {
          for (const [name, server] of Object.entries(parsed.servers)) {
            results.push({
              type: 'mcp',
              name: `MCP: ${name}`,
              endpoint: server.command || server.endpoint || mcpPaths[i],
              status: 'offline', // Will be checked separately
              metadata: { configPath, server },
            });
          }
        }
      } catch (error) {
        logger.debug(`Failed to read MCP config at ${mcpPaths[i]}:`, error);
      }
      
      this.emitProgress('mcp', i + 1, mcpPaths.length, `Checked ${mcpPaths[i]}`);
    }

    return results;
  }

  private async scanDatabases(): Promise<ScanResult[]> {
    return this.scanMongoDB();
  }

  private async scanMongoDB(): Promise<ScanResult[]> {
    const results: ScanResult[] = [];
    const defaultPorts = [27017, 27018, 27019];
    const hosts = ['localhost', '127.0.0.1'];
    
    this.emitProgress('database', 0, defaultPorts.length * hosts.length, 'Scanning for MongoDB instances...');
    
    let checked = 0;
    for (const host of hosts) {
      for (const port of defaultPorts) {
        try {
          const connectionString = `mongodb://${host}:${port}`;
          const client = new MongoClient(connectionString, {
            serverSelectionTimeoutMS: 2000,
          });
          
          await client.connect();
          await client.close();
          
          results.push({
            type: 'database',
            name: `MongoDB (${host}:${port})`,
            endpoint: connectionString,
            status: 'online',
            metadata: { dbType: 'mongodb', host, port },
          });
        } catch (error) {
          // Port not responding or connection failed
          logger.debug(`MongoDB not found at ${host}:${port}`);
        }
        
        checked++;
        this.emitProgress('database', checked, defaultPorts.length * hosts.length, `Checked ${host}:${port}`);
      }
    }
    
    // Check Docker containers
    try {
      const dockerResults = await this.scanDockerForMongoDB();
      results.push(...dockerResults);
    } catch (error) {
      logger.debug('Docker MongoDB scan failed:', error);
    }
    
    return results;
  }

  private async scanDockerForMongoDB(): Promise<ScanResult[]> {
    const results: ScanResult[] = [];
    const mongoNames = ['mongo', 'mongodb', 'olympian-db'];
    
    try {
      const { stdout } = await execAsync('docker ps --format "table {{.Names}}\t{{.Ports}}"');
      const lines = stdout.split('\n').slice(1);
      
      for (const line of lines) {
        const [name, ports] = line.split('\t');
        
        if (mongoNames.some(n => name.toLowerCase().includes(n))) {
          const portMatch = ports.match(/(\d+)->27017/);
          
          if (portMatch) {
            const port = portMatch[1];
            const endpoint = `mongodb://localhost:${port}`;
            
            results.push({
              type: 'database',
              name: `MongoDB Docker (${name})`,
              endpoint,
              status: 'online',
              metadata: { container: name, port, dbType: 'mongodb' },
            });
          }
        }
      }
    } catch (error) {
      logger.debug('Docker command failed:', error);
    }
    
    return results;
  }

  private emitProgress(type: ConnectionType, current: number, total: number, message: string): void {
    const progress: ScanProgress = { type, current, total, message };
    this.emit('progress', progress);
  }

  async testConnection(connection: ScanResult): Promise<boolean> {
    switch (connection.type) {
      case 'ollama':
        return this.checkOllamaEndpoint(connection.endpoint);
      case 'database':
        if (connection.metadata.dbType === 'mongodb') {
          try {
            const client = new MongoClient(connection.endpoint, {
              serverSelectionTimeoutMS: 5000,
            });
            await client.connect();
            await client.close();
            return true;
          } catch {
            return false;
          }
        }
        return false;
      case 'mcp':
        // MCP connection testing would be implemented here
        return false;
      default:
        return false;
    }
  }
}