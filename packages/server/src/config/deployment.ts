import { logger } from '../utils/logger';

export type DeploymentMode = 'same-host' | 'multi-host';

export interface DeploymentConfig {
  mode: DeploymentMode;
  mongodb: {
    uri: string;
    options: any;
  };
  ollama: {
    host: string;
    hosts: string[];
    loadBalancer: 'round-robin' | 'least-conn' | 'ip-hash';
  };
  mcp: {
    discoveryEnabled: boolean;
    hosts: string[];
  };
  network: {
    serviceDiscoveryEnabled: boolean;
    subnet: string;
    discoveryInterval: number;
  };
}

/**
 * Get deployment configuration based on environment variables
 * Supports both same-host and multi-host deployments
 */
export function getDeploymentConfig(): DeploymentConfig {
  const mode = (process.env.DEPLOYMENT_MODE as DeploymentMode) || 'multi-host';
  
  logger.info(`Initializing deployment configuration in ${mode} mode`);

  if (mode === 'same-host') {
    // Same-host configuration: services communicate via Docker network
    return {
      mode,
      mongodb: {
        uri: process.env.MONGODB_URI_SAME_HOST || 'mongodb://olympian-mongodb:27017/olympian_ai_lite',
        options: {
          maxPoolSize: 10,
          minPoolSize: 2,
          serverSelectionTimeoutMS: 5000,
        },
      },
      ollama: {
        host: process.env.OLLAMA_HOST_SAME_HOST || 'http://olympian-ollama:11434',
        hosts: [], // Not used in same-host mode
        loadBalancer: 'round-robin',
      },
      mcp: {
        discoveryEnabled: false, // Use Docker service names
        hosts: process.env.MCP_HOSTS_SAME_HOST?.split(',') || [],
      },
      network: {
        serviceDiscoveryEnabled: false, // Docker handles service discovery
        subnet: 'bridge',
        discoveryInterval: 300000,
      },
    };
  } else {
    // Multi-host configuration: services on different machines
    const ollamaHosts = process.env.OLLAMA_HOSTS?.split(',').filter(Boolean) || [];
    const ollamaHost = process.env.OLLAMA_HOST || ollamaHosts[0] || 'http://ollama-host:11434';
    
    return {
      mode,
      mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://mongo-host:27017/olympian_ai_lite',
        options: {
          maxPoolSize: 10,
          minPoolSize: 2,
          serverSelectionTimeoutMS: 5000,
          // Additional options for replica sets
          ...(process.env.MONGODB_REPLICA_SET && {
            replicaSet: process.env.MONGODB_REPLICA_SET,
          }),
        },
      },
      ollama: {
        host: ollamaHost,
        hosts: ollamaHosts,
        loadBalancer: (process.env.OLLAMA_LOAD_BALANCER as any) || 'round-robin',
      },
      mcp: {
        discoveryEnabled: process.env.MCP_DISCOVERY_ENABLED === 'true',
        hosts: process.env.MCP_HOSTS?.split(',').filter(Boolean) || [],
      },
      network: {
        serviceDiscoveryEnabled: process.env.SERVICE_DISCOVERY_ENABLED === 'true',
        subnet: process.env.SERVICE_DISCOVERY_SUBNET || '192.168.1.0/24',
        discoveryInterval: parseInt(process.env.SERVICE_DISCOVERY_INTERVAL || '300000'),
      },
    };
  }
}

/**
 * Load balancer for multiple Ollama hosts
 */
export class OllamaLoadBalancer {
  private currentIndex = 0;
  private hostStats = new Map<string, { requests: number; failures: number; lastUsed: Date }>();

  constructor(
    private hosts: string[],
    private strategy: 'round-robin' | 'least-conn' | 'ip-hash'
  ) {
    this.hosts.forEach(host => {
      this.hostStats.set(host, { requests: 0, failures: 0, lastUsed: new Date() });
    });
  }

  getNextHost(clientIp?: string): string {
    if (this.hosts.length === 0) {
      throw new Error('No Ollama hosts configured');
    }

    if (this.hosts.length === 1) {
      return this.hosts[0];
    }

    let selectedHost: string;

    switch (this.strategy) {
      case 'round-robin':
        selectedHost = this.hosts[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.hosts.length;
        break;

      case 'least-conn':
        // Select host with least active requests
        selectedHost = this.hosts.reduce((prev, curr) => {
          const prevStats = this.hostStats.get(prev)!;
          const currStats = this.hostStats.get(curr)!;
          return prevStats.requests < currStats.requests ? prev : curr;
        });
        break;

      case 'ip-hash':
        // Hash client IP to consistently route to same host
        if (!clientIp) {
          // Fallback to round-robin if no client IP
          selectedHost = this.hosts[this.currentIndex];
          this.currentIndex = (this.currentIndex + 1) % this.hosts.length;
        } else {
          const hash = clientIp.split('.').reduce((acc, octet) => acc + parseInt(octet), 0);
          selectedHost = this.hosts[hash % this.hosts.length];
        }
        break;

      default:
        selectedHost = this.hosts[0];
    }

    // Update stats
    const stats = this.hostStats.get(selectedHost)!;
    stats.requests++;
    stats.lastUsed = new Date();

    return selectedHost;
  }

  reportFailure(host: string): void {
    const stats = this.hostStats.get(host);
    if (stats) {
      stats.failures++;
    }
  }

  reportSuccess(host: string): void {
    const stats = this.hostStats.get(host);
    if (stats) {
      stats.requests = Math.max(0, stats.requests - 1);
    }
  }

  getStats(): Map<string, any> {
    return new Map(this.hostStats);
  }
}