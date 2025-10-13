import axios from 'axios';
import type { Abi } from 'viem';

export interface EtherscanConfig {
  apiKey?: string;
  network?: 'mainnet' | 'goerli' | 'sepolia' | 'polygon' | 'arbitrum' | 'optimism' | 'base';
}

/**
 * Client for fetching contract ABIs from Etherscan
 */
export interface ContractInfo {
  name: string;
  address: string;
  isVerified: boolean;
  isProxy: boolean;
  implementation?: string;
  implementationName?: string;
}

export class EtherscanClient {
  private cache: Map<string, Abi> = new Map();
  private nameCache: Map<string, string> = new Map();
  private apiKey?: string;
  private baseUrl: string;
  private chainId: number;
  private verbose: boolean;
  private lastRequestTime: number = 0;
  private minRequestInterval: number; // Milliseconds between requests

  constructor(config: EtherscanConfig = {}) {
    this.apiKey = config.apiKey || process.env.ETHERSCAN_API_KEY;
    const network = config.network || 'mainnet';
    this.baseUrl = this.getBaseUrl(network);
    this.chainId = this.getChainId(network);
    this.verbose = false;

    // With API key: 250ms between requests (4 req/sec, safer than 5/sec limit)
    // Without API key: 1000ms between requests (1 req/sec to be safe)
    this.minRequestInterval = this.apiKey ? 250 : 1000;

    if (this.verbose && this.apiKey) {
      console.log(`Etherscan API key loaded: ${this.apiKey.substring(0, 8)}...`);
    } else if (this.verbose) {
      console.log('No Etherscan API key found');
    }
  }

  /**
   * Sleep for a specified number of milliseconds
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Throttle requests to respect rate limits
   */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      if (this.verbose) {
        console.log(`Throttling: waiting ${waitTime}ms before next request`);
      }
      await this.sleep(waitTime);
    }

    this.lastRequestTime = Date.now();
  }

  private getBaseUrl(network: string): string {
    // Using V2 API endpoints
    const urls: Record<string, string> = {
      mainnet: 'https://api.etherscan.io/v2/api',
      goerli: 'https://api.etherscan.io/v2/api',
      sepolia: 'https://api.etherscan.io/v2/api',
      polygon: 'https://api.etherscan.io/v2/api',
      arbitrum: 'https://api.etherscan.io/v2/api',
      optimism: 'https://api.etherscan.io/v2/api',
      base: 'https://api.etherscan.io/v2/api',
    };

    return urls[network] || urls.mainnet;
  }

  private getChainId(network: string): number {
    const chainIds: Record<string, number> = {
      mainnet: 1,
      goerli: 5,
      sepolia: 11155111,
      polygon: 137,
      arbitrum: 42161,
      optimism: 10,
      base: 8453,
    };

    return chainIds[network] || chainIds.mainnet;
  }

  /**
   * Fetch contract ABI from Etherscan
   * @param address Contract address
   */
  async getContractAbi(address: string): Promise<Abi | null> {
    // Normalize address
    const normalizedAddress = address.toLowerCase();

    // Check cache first
    if (this.cache.has(normalizedAddress)) {
      return this.cache.get(normalizedAddress)!;
    }

    try {
      const params: any = {
        chainid: this.chainId,
        module: 'contract',
        action: 'getabi',
        address: normalizedAddress,
      };

      if (this.apiKey) {
        params.apikey = this.apiKey;
      }

      const response = await axios.get(this.baseUrl, {
        params,
        timeout: 10000,
      });

      if (response.data.status === '1' && response.data.result) {
        const abi = JSON.parse(response.data.result) as Abi;
        this.cache.set(normalizedAddress, abi);
        return abi;
      }

      // Contract not verified or not found
      return null;
    } catch (error) {
      console.error(`Failed to fetch ABI for ${address}:`, error);
      return null;
    }
  }

  /**
   * Check if contract is verified
   * @param address Contract address
   */
  async isContractVerified(address: string): Promise<boolean> {
    const abi = await this.getContractAbi(address);
    return abi !== null;
  }

  /**
   * Get contract name from Etherscan
   * @param address Contract address
   */
  async getContractName(address: string): Promise<string> {
    // Normalize address
    const normalizedAddress = address.toLowerCase();

    // Check cache first
    if (this.nameCache.has(normalizedAddress)) {
      return this.nameCache.get(normalizedAddress)!;
    }

    // Throttle to respect rate limits
    await this.throttle();

    try {
      const params: any = {
        chainid: this.chainId,
        module: 'contract',
        action: 'getsourcecode',
        address: normalizedAddress,
      };

      if (this.apiKey) {
        params.apikey = this.apiKey;
      }

      const response = await axios.get(this.baseUrl, {
        params,
        timeout: 10000,
      });

      if (this.verbose) {
        console.log(`Etherscan response for ${address}:`, {
          status: response.data.status,
          message: response.data.message,
          hasResult: !!response.data.result,
        });
      }

      if (response.data.status === '1' && response.data.result && response.data.result.length > 0) {
        const contractName = response.data.result[0].ContractName;
        if (contractName && contractName !== '') {
          this.nameCache.set(normalizedAddress, contractName);
          if (this.verbose) {
            console.log(`Found contract name: ${contractName}`);
          }
          return contractName;
        }
      }

      // Check for rate limit or API errors
      if (response.data.status === '0' && response.data.message) {
        if (response.data.message.includes('rate limit')) {
          console.error(`⚠️  Rate limit reached for ${address}`);
        } else if (response.data.result && response.data.result.includes('Invalid API Key')) {
          console.error('❌ Invalid Etherscan API key');
        } else {
          console.error(`⚠️  Etherscan API error: ${response.data.message}`);
        }
      }

      // Contract not verified or name not found
      return 'Unknown Contract';
    } catch (error: any) {
      if (error.response?.status === 429) {
        console.error(`Rate limit reached for ${address}`);
      } else {
        console.error(`Failed to fetch contract name for ${address}:`, error.message);
      }
      return 'Unknown Contract';
    }
  }

  /**
   * Check if a contract is a proxy and get implementation address
   * @param address Contract address
   */
  private async getProxyImplementation(address: string): Promise<string | null> {
    const normalizedAddress = address.toLowerCase();

    // Throttle to respect rate limits
    await this.throttle();

    try {
      const params: any = {
        chainid: this.chainId,
        module: 'contract',
        action: 'getsourcecode',
        address: normalizedAddress,
      };

      if (this.apiKey) {
        params.apikey = this.apiKey;
      }

      const response = await axios.get(this.baseUrl, {
        params,
        timeout: 10000,
      });

      if (response.data.status === '1' && response.data.result && response.data.result.length > 0) {
        const result = response.data.result[0];

        // Check if Implementation field exists (indicates proxy)
        if (result.Implementation && result.Implementation !== '') {
          return result.Implementation.toLowerCase();
        }

        // Check Proxy field
        if (result.Proxy === '1' && result.Implementation) {
          return result.Implementation.toLowerCase();
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get contract source code info from Etherscan (name, proxy status, etc.)
   * This method makes a single API call and extracts all info
   */
  private async getSourceCodeInfo(address: string): Promise<any> {
    const normalizedAddress = address.toLowerCase();

    // Throttle to respect rate limits
    await this.throttle();

    try {
      const params: any = {
        chainid: this.chainId,
        module: 'contract',
        action: 'getsourcecode',
        address: normalizedAddress,
      };

      if (this.apiKey) {
        params.apikey = this.apiKey;
      }

      const response = await axios.get(this.baseUrl, {
        params,
        timeout: 10000,
      });

      if (response.data.status === '1' && response.data.result && response.data.result.length > 0) {
        return response.data.result[0];
      }

      // Check for rate limit or API errors
      if (response.data.status === '0' && response.data.message) {
        if (response.data.message.includes('rate limit')) {
          console.error(`⚠️  Rate limit reached for ${address}`);
        } else if (response.data.result && response.data.result.includes('Invalid API Key')) {
          console.error('❌ Invalid Etherscan API key');
        } else {
          console.error(`⚠️  Etherscan API error: ${response.data.message}`);
        }
      }

      return null;
    } catch (error: any) {
      if (error.response?.status === 429) {
        console.error(`⚠️  Rate limit reached for ${address}`);
      } else {
        console.error(`Failed to fetch contract info for ${address}:`, error.message);
      }
      return null;
    }
  }

  /**
   * Get contract info (name and verification status)
   * @param address Contract address
   */
  async getContractInfo(address: string): Promise<ContractInfo> {
    const normalizedAddress = address.toLowerCase();

    // Get source code info (single API call)
    const sourceInfo = await this.getSourceCodeInfo(normalizedAddress);

    let name = 'Unknown Contract';
    let implementationAddress: string | undefined;
    let isProxy = false;

    if (sourceInfo) {
      // Get contract name
      if (sourceInfo.ContractName && sourceInfo.ContractName !== '') {
        name = sourceInfo.ContractName;
        this.nameCache.set(normalizedAddress, name);
      }

      // Check if it's a proxy
      if (sourceInfo.Implementation && sourceInfo.Implementation !== '') {
        implementationAddress = sourceInfo.Implementation.toLowerCase();
        isProxy = true;
      } else if (sourceInfo.Proxy === '1' && sourceInfo.Implementation) {
        implementationAddress = sourceInfo.Implementation.toLowerCase();
        isProxy = true;
      }
    }

    const isVerified = name !== 'Unknown Contract';

    let implementationName: string | undefined;
    if (isProxy && implementationAddress) {
      // Get the implementation contract name (this will make another throttled API call)
      implementationName = await this.getContractName(implementationAddress);
      if (implementationName === 'Unknown Contract') {
        implementationName = undefined;
      }
    }

    return {
      name,
      address: normalizedAddress,
      isVerified,
      isProxy,
      implementation: implementationAddress,
      implementationName,
    };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.nameCache.clear();
  }

  /**
   * Set API key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }
}
