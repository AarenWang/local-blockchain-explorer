import { HDNodeWallet, ethers, Mnemonic, Wordlist } from 'ethers';
import { Provider, Wallet } from 'ethers';
import { WalletBalance, Erc20Balance, Erc20TokenConfig } from '../types';
import * as crypto from 'crypto';

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

  /**
   * Derive a wallet from mnemonic at a specific index
   * Uses BIP-32/39/44 standard derivation path
   * Supports mnemonics with invalid checksums (for testing/dev)
   */
  deriveWallet(mnemonic: string, index: number, derivationPath: string = "m/44'/60'/0'/0"): {
    address: string;
    privateKey: string;
  } {
    let seed: string;

    // Try to create mnemonic normally (validates checksum)
    try {
      const mnemonicObj = Mnemonic.fromPhrase(mnemonic);
      seed = mnemonicObj.computeSeed();
    } catch {
      // If mnemonic has invalid checksum, compute seed directly using PBKDF2
      // BIP39: seed = PBKDF2(mnemonic + passphrase, "mnemonic" + passphrase, 2048, 64)
      const mnemonicBuffer = Buffer.from(mnemonic, 'utf8');
      const saltBuffer = Buffer.from('mnemonic', 'utf8');
      const seedBuffer = crypto.pbkdf2Sync(
        mnemonicBuffer,
        saltBuffer,
        2048,
        64,
        'sha512'
      );
      seed = '0x' + seedBuffer.toString('hex');
    }

    // Create root HD node from seed
    const rootNode = HDNodeWallet.fromSeed(seed);

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
        erc20Balances
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
