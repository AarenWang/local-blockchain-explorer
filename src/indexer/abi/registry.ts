import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AbiEntry, AbiCacheKey } from '../../data/abi/types';
import { logInfo, logError } from '../utils/logger';

export class AbiRegistry {
  private abis: Map<string, AbiEntry> = new Map();
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = path.resolve(basePath);
  }

  /** Load all ABI files from the base directory */
  async loadAll(): Promise<void> {
    try {
      if (!await this.directoryExists(this.basePath)) {
        logInfo(`ABI registry: Directory ${this.basePath} does not exist, creating...`);
        await fs.mkdir(this.basePath, { recursive: true });
        return;
      }

      // Scan for chain directories
      const entries = await fs.readdir(this.basePath, { withFileTypes: true });
      const chainDirs = entries.filter(e => e.isDirectory());

      let loadedCount = 0;
      for (const chainDir of chainDirs) {
        const chainPath = path.join(this.basePath, chainDir.name);
        await this.loadChain(chainDir.name, chainPath);
      }

      logInfo(`ABI registry: Loaded ${loadedCount} ABI entries`);
    } catch (error) {
      logError(`ABI registry: Failed to load ABIs - ${error}`);
    }
  }

  /** Load all ABIs for a specific chain */
  private async loadChain(chainId: string, chainPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(chainPath, { withFileTypes: true });
      const jsonFiles = entries.filter(e => e.isFile() && e.name.endsWith('.json'));

      for (const file of jsonFiles) {
        const filePath = path.join(chainPath, file.name);
        await this.loadAbiFile(chainId, filePath);
      }
    } catch (error) {
      logError(`ABI registry: Failed to load chain ${chainId} - ${error}`);
    }
  }

  /** Load a single ABI file */
  private async loadAbiFile(chainId: string, filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const json = JSON.parse(content);

      // Extract metadata and ABI
      const entry: AbiEntry = {
        contractAddress: json.contractAddress?.toLowerCase() || this.extractAddressFromFilename(filePath),
        implementationAddress: json.implementationAddress?.toLowerCase(),
        chain: chainId,
        contractType: json.contractType,
        symbol: json.symbol,
        decimals: json.decimals,
        abi: json.abi || [],
        source: filePath,
        fingerprint: this.computeFingerprint(json.abi || [])
      };

      const key = this.makeKey(chainId, entry.contractAddress);
      this.abis.set(key, entry);
    } catch (error) {
      logError(`ABI registry: Failed to load ${filePath} - ${error}`);
    }
  }

  /** Extract contract address from filename if not in JSON */
  private extractAddressFromFilename(filePath: string): string {
    const filename = path.basename(filePath, '.json');
    // Try to extract 0x-prefixed address from filename
    const match = filename.match(/(0x[a-fA-F0-9]{40})/);
    if (match) {
      return match[1].toLowerCase();
    }
    return filename.toLowerCase();
  }

  /** Get ABI for a contract */
  getAbi(chainId: string, address: string): AbiEntry | undefined {
    const key = this.makeKey(chainId, address);
    return this.abis.get(key);
  }

  /** Check if ABI exists for a contract */
  hasAbi(chainId: string, address: string): boolean {
    return this.abis.has(this.makeKey(chainId, address));
  }

  /** List all registered ABIs */
  listAbis(): AbiEntry[] {
    return Array.from(this.abis.values());
  }

  /** List ABIs for a specific chain */
  listAbisByChain(chainId: string): AbiEntry[] {
    const prefix = `${chainId}:`;
    const result: AbiEntry[] = [];
    for (const [key, value] of this.abis.entries()) {
      if (key.startsWith(prefix)) {
        result.push(value);
      }
    }
    return result;
  }

  /** Get ABI by key */
  getByKey(key: string): AbiEntry | undefined {
    return this.abis.get(key);
  }

  /** Make cache key from chain ID and address */
  private makeKey(chainId: string, address: string): string {
    return `${chainId}:${address.toLowerCase()}`;
  }

  /** Compute fingerprint for an ABI array (hash for cache invalidation) */
  computeFingerprint(abi: any[]): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(abi))
      .digest('hex')
      .slice(0, 16);
  }

  /** Check if directory exists */
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      await fs.access(dirPath);
      return true;
    } catch {
      return false;
    }
  }
}
