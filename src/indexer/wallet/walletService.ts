import { HDNodeWallet, ethers, Mnemonic, Provider } from 'ethers';
import * as crypto from 'crypto';
import {
  WalletBalance,
  Erc20Balance,
  Erc20TokenConfig,
  SplBalance,
  SplTokenConfig
} from '../types';
import { fetchJsonRpc } from '../clients/jsonRpc';
import { deriveSolanaAddress } from '../solana/utils';

// ERC20 BalanceOf ABI
const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function'
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    type: 'function'
  },
  {
    constant: true,
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    type: 'function'
  }
];

export class WalletService {
  private provider: Provider;
  private providers: Map<string, Provider> = new Map();

  constructor(rpcUrl: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  private getProvider(chainRpcUrl: string): Provider {
    if (!this.providers.has(chainRpcUrl)) {
      this.providers.set(chainRpcUrl, new ethers.JsonRpcProvider(chainRpcUrl));
    }
    return this.providers.get(chainRpcUrl)!;
  }

  private computeMnemonicSeed(mnemonic: string): Buffer {
    try {
      const mnemonicObj = Mnemonic.fromPhrase(mnemonic);
      return Buffer.from(mnemonicObj.computeSeed().slice(2), 'hex');
    } catch {
      const mnemonicBuffer = Buffer.from(mnemonic, 'utf8');
      const saltBuffer = Buffer.from('mnemonic', 'utf8');
      return crypto.pbkdf2Sync(
        mnemonicBuffer,
        saltBuffer,
        2048,
        64,
        'sha512'
      );
    }
  }

  /**
   * Derive a wallet from mnemonic at a specific index
   * Uses BIP-32/39/44 standard derivation path
   * Supports mnemonics with invalid checksums (for testing/dev)
   */
  deriveWallet(mnemonic: string, index: number, derivationPath: string = "m/44'/60'/0'/0"): {
    address: string;
    privateKey: string;
  } {
    const seed = this.computeMnemonicSeed(mnemonic);

    // Create root HD node from seed
    const rootNode = HDNodeWallet.fromSeed(`0x${seed.toString('hex')}`);

    // Derive path (remove leading 'm/' as rootNode is already at root)
    const relativePath = derivationPath.replace(/^m\//, '');
    const wallet = rootNode.derivePath(`${relativePath}/${index}`);

    return {
      address: wallet.address,
      privateKey: wallet.privateKey
    };
  }

  /**
   * Derive multiple wallets from mnemonic
   */
  deriveWallets(mnemonic: string, count: number = 10, derivationPath: string = "m/44'/60'/0'/0"): Array<{
    index: number;
    address: string;
    privateKey: string;
  }> {
    const result = [];
    for (let i = 0; i < count; i++) {
      const wallet = this.deriveWallet(mnemonic, i, derivationPath);
      result.push({
        index: i,
        address: wallet.address,
        privateKey: wallet.privateKey
      });
    }
    return result;
  }

  deriveSolanaWallet(
    mnemonic: string,
    index: number,
    derivationPath: string = "m/44'/501'"
  ): {
    address: string;
    privateKey: string;
  } {
    const seed = this.computeMnemonicSeed(mnemonic);
    const normalizedPath = derivationPath === 'm'
      ? derivationPath
      : derivationPath.replace(/\/+$/, '');
    const fullPath = normalizedPath.endsWith("'")
      ? `${normalizedPath}/${index}'`
      : `${normalizedPath}/${index}'`;

    const derived = deriveSolanaAddress(seed, fullPath);
    return {
      address: derived.address,
      privateKey: derived.secretKey
    };
  }

  deriveSolanaWallets(
    mnemonic: string,
    count: number = 10,
    derivationPath: string = "m/44'/501'"
  ): Array<{
    index: number;
    address: string;
    privateKey: string;
  }> {
    const result = [];
    for (let i = 0; i < count; i += 1) {
      const wallet = this.deriveSolanaWallet(mnemonic, i, derivationPath);
      result.push({
        index: i,
        address: wallet.address,
        privateKey: wallet.privateKey
      });
    }
    return result;
  }

  /**
   * Get native token balance for an address
   */
  async getNativeBalance(address: string, rpcUrl?: string): Promise<{
    balance: string;
    balanceFormatted: number;
  }> {
    const provider = rpcUrl ? this.getProvider(rpcUrl) : this.provider;
    const balance = await provider.getBalance(address);
    return {
      balance: balance.toString(),
      balanceFormatted: parseFloat(ethers.formatEther(balance))
    };
  }

  /**
   * Get ERC20 token balance for an address
   */
  async getErc20Balance(
    address: string,
    tokenAddress: string,
    rpcUrl?: string
  ): Promise<{
    balance: string;
    balanceFormatted: number;
    decimals: number;
    symbol: string;
  }> {
    const provider = rpcUrl ? this.getProvider(rpcUrl) : this.provider;
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    const [balance, decimals, symbol] = await Promise.all([
      contract.balanceOf(address),
      contract.decimals(),
      contract.symbol()
    ]);

    const balanceFormatted = parseFloat(ethers.formatUnits(balance, decimals));

    return {
      balance: balance.toString(),
      balanceFormatted,
      decimals,
      symbol
    };
  }

  /**
   * Get all balances (native + ERC20) for a derived wallet
   */
  async getWalletBalances(
    mnemonic: string,
    chainId: string,
    chainRpcUrl: string,
    erc20Tokens: Erc20TokenConfig[],
    count: number = 10,
    derivationPath: string = "m/44'/60'/0'/0"
  ): Promise<WalletBalance[]> {
    const wallets = this.deriveWallets(mnemonic, count, derivationPath);
    const result: WalletBalance[] = [];

    for (const wallet of wallets) {
      // Get native balance
      const nativeBalance = await this.getNativeBalance(wallet.address, chainRpcUrl);

      // Get ERC20 balances for tokens on this chain
      const chainTokens = erc20Tokens.filter(t => t.chain_id === chainId);
      const erc20Balances: Erc20Balance[] = [];

      for (const token of chainTokens) {
        try {
          const balance = await this.getErc20Balance(wallet.address, token.address, chainRpcUrl);
          erc20Balances.push({
            tokenAddress: token.address,
            symbol: balance.symbol,
            balance: balance.balance,
            balanceFormatted: balance.balanceFormatted
          });
        } catch (error) {
          console.error(`Error fetching ERC20 balance for ${token.symbol}:`, error);
        }
      }

      result.push({
        address: wallet.address,
        index: wallet.index,
        nativeBalance: nativeBalance.balance,
        nativeBalanceFormatted: nativeBalance.balanceFormatted,
        erc20Balances,
        splBalances: []
      });
    }

    return result;
  }

  async getSplTokenInfo(mintAddress: string, rpcUrl: string): Promise<{
    mint: string;
    name: string;
    symbol: string;
    decimals: number;
  }> {
    const result = await fetchJsonRpc<{
      value: {
        data?: {
          parsed?: {
            info?: {
              decimals?: number;
            };
          };
        };
      } | null;
    }>(rpcUrl, 'getAccountInfo', [mintAddress, { encoding: 'jsonParsed' }]);

    const decimals = result.value?.data?.parsed?.info?.decimals ?? 0;
    let name = '';
    let symbol = '';

    try {
      const metadataAccounts = await fetchJsonRpc<Array<{
        account?: {
          data?: [string, string];
        };
      }>>(rpcUrl, 'getProgramAccounts', [
        'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
        {
          encoding: 'base64',
          filters: [
            {
              memcmp: {
                offset: 33,
                bytes: mintAddress
              }
            }
          ]
        }
      ]);

      const metadataPayload = metadataAccounts[0]?.account?.data?.[0];
      if (metadataPayload) {
        const buffer = Buffer.from(metadataPayload, 'base64');
        let offset = 65;
        const readString = () => {
          if (offset + 4 > buffer.length) return '';
          const length = buffer.readUInt32LE(offset);
          offset += 4;
          if (offset + length > buffer.length) return '';
          const value = buffer.subarray(offset, offset + length).toString('utf8').replace(/\0+$/g, '').trim();
          offset += length;
          return value;
        };

        name = readString();
        symbol = readString();
      }
    } catch {
      // Metadata is optional; fall back to mint prefix when absent.
    }

    return {
      mint: mintAddress,
      name: name || symbol || mintAddress.slice(0, 8),
      symbol: symbol || name || mintAddress.slice(0, 8),
      decimals
    };
  }

  async getSolanaNativeBalance(address: string, rpcUrl: string): Promise<{
    balance: string;
    balanceFormatted: number;
  }> {
    const result = await fetchJsonRpc<{ value: number }>(rpcUrl, 'getBalance', [address]);
    return {
      balance: String(result.value),
      balanceFormatted: result.value / 1e9
    };
  }

  async getSplBalances(
    address: string,
    trackedTokens: SplTokenConfig[],
    rpcUrl: string
  ): Promise<SplBalance[]> {
    const result = await fetchJsonRpc<{
      value: Array<{
        pubkey: string;
        account: {
          data?: {
            parsed?: {
              info?: {
                mint?: string;
                tokenAmount?: {
                  amount?: string;
                  decimals?: number;
                };
              };
            };
          };
        };
      }>;
    }>(rpcUrl, 'getTokenAccountsByOwner', [
      address,
      { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
      { encoding: 'jsonParsed' }
    ]);

    const trackedByMint = new Map(
      trackedTokens.map((token) => [token.mint, token])
    );
    const aggregated = new Map<string, { amount: bigint; decimals: number }>();

    for (const item of result.value) {
      const info = item.account?.data?.parsed?.info;
      const mint = info?.mint;
      const amount = info?.tokenAmount?.amount;
      const decimals = info?.tokenAmount?.decimals ?? trackedByMint.get(mint ?? '')?.decimals ?? 0;

      if (!mint || amount === undefined) {
        continue;
      }
      if (trackedByMint.size > 0 && !trackedByMint.has(mint)) {
        continue;
      }

      const current = aggregated.get(mint) ?? { amount: 0n, decimals };
      current.amount += BigInt(amount);
      current.decimals = decimals;
      aggregated.set(mint, current);
    }

    const balances: SplBalance[] = [];
    for (const [mint, value] of aggregated.entries()) {
      const token = trackedByMint.get(mint);
      const balanceFormatted = Number(value.amount) / (10 ** value.decimals);
      if (balanceFormatted <= 0) {
        continue;
      }
      balances.push({
        mintAddress: token?.mint ?? mint,
        symbol: token?.symbol ?? mint.slice(0, 8),
        balance: value.amount.toString(),
        balanceFormatted
      });
    }

    return balances;
  }

  async getSolanaWalletBalances(
    mnemonic: string,
    chainId: string,
    chainRpcUrl: string,
    splTokens: SplTokenConfig[],
    count: number = 10,
    derivationPath: string = "m/44'/501'"
  ): Promise<WalletBalance[]> {
    const wallets = this.deriveSolanaWallets(mnemonic, count, derivationPath);
    const chainTokens = splTokens.filter((token) => token.chain_id === chainId);
    const result: WalletBalance[] = [];

    for (const wallet of wallets) {
      const nativeBalance = await this.getSolanaNativeBalance(wallet.address, chainRpcUrl);
      const splBalances = await this.getSplBalances(wallet.address, chainTokens, chainRpcUrl);

      result.push({
        address: wallet.address,
        index: wallet.index,
        nativeBalance: nativeBalance.balance,
        nativeBalanceFormatted: nativeBalance.balanceFormatted,
        erc20Balances: [],
        splBalances
      });
    }

    return result;
  }

  /**
   * Get ERC20 token info (symbol, decimals) by address
   */
  async getErc20TokenInfo(tokenAddress: string, rpcUrl?: string): Promise<{
    symbol: string;
    decimals: number;
    address: string;
  }> {
    const provider = rpcUrl ? this.getProvider(rpcUrl) : this.provider;
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    const [symbol, decimals] = await Promise.all([
      contract.symbol(),
      contract.decimals()
    ]);

    return {
      symbol,
      decimals,
      address: tokenAddress
    };
  }

  /**
   * Validate mnemonic phrase
   */
  validateMnemonic(mnemonic: string): boolean {
    try {
      HDNodeWallet.fromPhrase(mnemonic);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get simple entropy-based encryption for mnemonic storage
   * Note: This is basic encryption. For production, use proper encryption with user-provided keys.
   */
  encryptMnemonic(mnemonic: string, password: string): string {
    // Simple XOR-based encoding (for demo - replace with proper encryption in production)
    const encoder = new TextEncoder();
    const mnemonicBytes = encoder.encode(mnemonic);
    const passwordBytes = encoder.encode(password.padEnd(mnemonic.length, '0'));

    const encrypted = mnemonicBytes.map((byte, i) => byte ^ passwordBytes[i % passwordBytes.length]);
    return btoa(String.fromCharCode(...encrypted));
  }

  /**
   * Decrypt mnemonic
   */
  decryptMnemonic(encrypted: string, password: string): string {
    const encryptedBytes = atob(encrypted).split('').map(c => c.charCodeAt(0));
    const encoder = new TextEncoder();
    const passwordBytes = encoder.encode(password.padEnd(encryptedBytes.length, '0'));

    const decrypted = encryptedBytes.map((byte, i) => byte ^ passwordBytes[i % passwordBytes.length]);
    const decoder = new TextDecoder();
    return decoder.decode(new Uint8Array(decrypted));
  }
}
