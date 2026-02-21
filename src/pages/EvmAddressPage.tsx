import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchJsonRpc } from '../data/rpc';
import { fromHexToEth, truncateMiddle } from '../data/format';
import { ChainConfig, useConfigStore } from '../state/configStore';
import KeyValueTable from '../components/KeyValueTable';
import TagManager from '../components/TagManager';

interface AddressTxSummary {
  hash: string;
  blockNumber: number;
  from: string;
  to: string | null;
}

interface Erc20Balance {
  tokenAddress: string;
  symbol: string;
  decimals: number;
  balance: string;
  balanceFormatted: number;
}

interface Erc20Transfer {
  id: string;
  token_address: string;
  tokenSymbol?: string;
  from_address: string;
  to_address: string;
  value: string;
  tx_hash: string;
  block_number: number;
  log_index: number;
}

// Parse ERC20 value from hex to formatted number
function formatErc20Value(valueHex: string, decimals: number = 18): string {
  if (!valueHex || valueHex === '0x') return '0';
  const value = BigInt(valueHex);
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const fraction = value % divisor;

  if (fraction === 0n) {
    return whole.toString();
  }

  // Pad fraction to correct number of decimal places and trim trailing zeros
  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fractionStr}`;
}

const EvmAddressPage = () => {
  const { chainId, address } = useParams();
  const { chains } = useConfigStore();
  const chain = useMemo(
    () => chains.find((item) => item.id === chainId) as ChainConfig | undefined,
    [chains, chainId]
  );
  const [balance, setBalance] = useState<string>('');
  const [txCount, setTxCount] = useState<number | null>(null);
  const [recentTxs, setRecentTxs] = useState<AddressTxSummary[]>([]);
  const [erc20Balances, setErc20Balances] = useState<Erc20Balance[]>([]);
  const [erc20Transfers, setErc20Transfers] = useState<Erc20Transfer[]>([]);
  const [loadingErc20, setLoadingErc20] = useState(false);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!chain || !address) {
        return;
      }
      try {
        const balanceHex = await fetchJsonRpc<string>(chain.rpcUrl, 'eth_getBalance', [
          address,
          'latest'
        ]);
        const nonceHex = await fetchJsonRpc<string>(chain.rpcUrl, 'eth_getTransactionCount', [
          address,
          'latest'
        ]);
        const apiBase = import.meta.env.VITE_INDEXER_API ?? 'http://localhost:7070';
        const txResponse = await fetch(
          `${apiBase}/chain/${chain.id}/evm/address/${address}/txs?limit=20`
        );
        if (!txResponse.ok) {
          throw new Error('Indexer API unavailable');
        }
        const txs = (await txResponse.json()) as AddressTxSummary[];
        setBalance(balanceHex);
        setTxCount(parseInt(nonceHex, 16));
        setRecentTxs(txs);
        setError('');

        // Load ERC20 data
        await Promise.all([
          loadErc20Balances(),
          loadErc20Transfers()
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load address');
      }
    };
    load();
  }, [chain, address]);

  const loadErc20Balances = async () => {
    if (!chain || !address) return;

    setLoadingErc20(true);
    try {
      const apiBase = import.meta.env.VITE_INDEXER_API ?? 'http://localhost:7070';

      // First, ensure tokens are in database
      for (const token of chain.erc20Tokens || []) {
        if (token.symbol && token.decimals !== undefined) {
          await fetch(`${apiBase}/erc20-tokens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chainId: chain.id,
              symbol: token.symbol,
              name: token.symbol,
              address: token.address,
              decimals: token.decimals
            })
          }).catch(() => {
            // Ignore errors if token already exists
          });
        }
      }

      // Fetch balances
      const response = await fetch(
        `${apiBase}/chain/${chain.id}/evm/address/${address}/erc20-balances`
      );
      if (response.ok) {
        const balances = await response.json();
        setErc20Balances(balances);
      }
    } catch (err) {
      console.error('Failed to load ERC20 balances:', err);
    } finally {
      setLoadingErc20(false);
    }
  };

  const loadErc20Transfers = async () => {
    if (!chain || !address) return;

    setLoadingTransfers(true);
    try {
      const apiBase = import.meta.env.VITE_INDEXER_API ?? 'http://localhost:7070';

      const response = await fetch(
        `${apiBase}/chain/${chain.id}/evm/address/${address}/erc20-transfers?limit=50`
      );
      if (response.ok) {
        const transfers = await response.json();
        setErc20Transfers(transfers);
      }
    } catch (err) {
      console.error('Failed to load ERC20 transfers:', err);
    } finally {
      setLoadingTransfers(false);
    }
  };

  if (!chain) {
    return (
      <div className="page">
        <h1>Chain not found</h1>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h1>Error</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (!address) {
    return (
      <div className="page">
        <p>Missing address.</p>
      </div>
    );
  }

  const rows = [
    { label: 'Address', value: address, copy: address },
    {
      label: 'Balance',
      value: balance ? `${fromHexToEth(balance)} ${chain.nativeTokenSymbol}` : '-'
    },
    { label: 'Tx Count', value: txCount ?? '-' }
  ];

  // Get token decimals for formatting
  const getTokenDecimals = (tokenAddress: string) => {
    const token = chain.erc20Tokens?.find(t =>
      t.address.toLowerCase() === tokenAddress.toLowerCase()
    );
    return token?.decimals ?? 18;
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Address</h1>
          <p>{chain.chainName}</p>
        </div>
        <TagManager type="address" target={address} />
      </div>

      <section className="card">
        <KeyValueTable rows={rows} />
      </section>

      {chain.erc20Tokens && chain.erc20Tokens.length > 0 ? (
        <section className="card">
          <h2>ERC20 Assets</h2>
          {loadingErc20 ? (
            <p className="muted">Loading ERC20 balances...</p>
          ) : erc20Balances.length === 0 ? (
            <p className="muted">No ERC20 tokens found for this address.</p>
          ) : (
            <div className="list">
              {erc20Balances.map((tokenBalance) => (
                <div key={tokenBalance.tokenAddress} className="list-item">
                  <span>
                    <strong>{tokenBalance.symbol}</strong>
                    <span className="token-address">{truncateMiddle(tokenBalance.tokenAddress)}</span>
                  </span>
                  <span>
                    {tokenBalance.balanceFormatted > 0
                      ? tokenBalance.balanceFormatted.toLocaleString(undefined, {
                          maximumFractionDigits: 6
                        })
                      : '0'}{' '}
                    {tokenBalance.symbol}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="card">
        <h2>ERC20 Token Transfers</h2>
        {loadingTransfers ? (
          <p className="muted">Loading ERC20 transfers...</p>
        ) : erc20Transfers.length === 0 ? (
          <p className="muted">No ERC20 transfers found for this address.</p>
        ) : (
          <div className="list-table">
            <div className="list-row list-row--header">
              <span>Token</span>
              <span>Type</span>
              <span>Amount</span>
              <span>Tx Hash</span>
              <span>Block</span>
            </div>
            {erc20Transfers.map((transfer) => {
              const isIncoming = transfer.to_address.toLowerCase() === address.toLowerCase();
              const decimals = getTokenDecimals(transfer.token_address);
              return (
                <Link
                  key={transfer.id}
                  className="list-row"
                  to={`/chain/${chain.id}/evm/tx/${transfer.tx_hash}`}
                >
                  <span className="list-primary">
                    {transfer.tokenSymbol || 'Unknown'}
                    <span className="list-secondary">{truncateMiddle(transfer.token_address)}</span>
                  </span>
                  <span>
                    <span className={`status-pill ${isIncoming ? 'in' : 'out'}`}>
                      {isIncoming ? 'IN' : 'OUT'}
                    </span>
                  </span>
                  <span className="mono">
                    {formatErc20Value(transfer.value, decimals)}
                  </span>
                  <span className="mono list-secondary">
                    {truncateMiddle(transfer.tx_hash)}
                  </span>
                  <span className="list-secondary">#{transfer.block_number}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Recent Transactions</h2>
        {recentTxs.length === 0 ? (
          <p className="muted">No recent transactions found.</p>
        ) : (
          <div className="list">
            {recentTxs.map((tx) => (
              <Link key={tx.hash} className="list-item" to={`/chain/${chain.id}/evm/tx/${tx.hash}`}>
                <span>{truncateMiddle(tx.hash)}</span>
                <span>Block #{tx.blockNumber}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default EvmAddressPage;
