import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiUrl } from '../api';
import { useConfigStore } from '../state/configStore';

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

interface Erc20Balance {
  tokenAddress: string;
  symbol: string;
  balance: string;
  balanceFormatted: number;
}

interface SplBalance {
  mintAddress: string;
  symbol: string;
  balance: string;
  balanceFormatted: number;
}

interface WalletBalance {
  address: string;
  index: number;
  nativeBalance: string;
  nativeBalanceFormatted: number;
  erc20Balances: Erc20Balance[];
  splBalances: SplBalance[];
}

interface Role {
  id: string;
  name: string;
  derivationPath: string;
  createdAt: number;
}

interface Erc20Token {
  id: string;
  chain_id: string;
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  created_at: number;
}

interface SplToken {
  id: string;
  chain_id: string;
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  created_at: number;
}

const WalletTabPage = () => {
  const { roleId } = useParams<{ roleId: string }>();
  const { chains } = useConfigStore();
  const [role, setRole] = useState<Role | null>(null);
  const [erc20Tokens, setErc20Tokens] = useState<Erc20Token[]>([]);
  const [splTokens, setSplTokens] = useState<SplToken[]>([]);
  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const [selectedChainId, setSelectedChainId] = useState<string>('');
  const [walletCount, setWalletCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const walletChains = useMemo(
    () => chains.filter((chain) => chain.chainType === 'EVM' || chain.chainType === 'SOLANA'),
    [chains]
  );
  const selectedChain = useMemo(
    () => walletChains.find((chain) => chain.id === selectedChainId),
    [walletChains, selectedChainId]
  );

  useEffect(() => {
    if (walletChains.length > 0 && !selectedChainId) {
      setSelectedChainId(walletChains[0].id);
    }
  }, [walletChains, selectedChainId]);

  useEffect(() => {
    if (!roleId) {
      return;
    }
    fetchRole();
    fetchTokens();
  }, [roleId]);

  useEffect(() => {
    if (selectedChainId && roleId) {
      fetchBalances();
    }
  }, [selectedChainId, roleId, walletCount]);

  const fetchRole = async () => {
    try {
      const res = await fetch(apiUrl('/roles'));
      const roles = await res.json();
      const found = roles.find((item: Role) => item.id === roleId);
      setRole(found || null);
    } catch (fetchError) {
      console.error('Failed to fetch role:', fetchError);
    }
  };

  const fetchTokens = async () => {
    try {
      const [erc20Res, splRes] = await Promise.all([
        fetch(apiUrl('/erc20-tokens')),
        fetch(apiUrl('/spl-tokens'))
      ]);
      setErc20Tokens(await erc20Res.json());
      setSplTokens(await splRes.json());
    } catch (fetchError) {
      console.error('Failed to fetch tokens:', fetchError);
    }
  };

  const fetchBalances = async () => {
    if (!selectedChainId || !roleId) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        apiUrl(`/roles/${roleId}/balances?chainId=${selectedChainId}&count=${walletCount}`)
      );
      if (!res.ok) {
        throw new Error('Failed to fetch balances');
      }
      setBalances(await res.json());
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch balances');
      setBalances([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchBalances();
    setRefreshing(false);
  };

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (copyError) {
      console.error('Failed to copy address:', copyError);
    }
  };

  const chainErc20Tokens = useMemo(
    () => erc20Tokens.filter((token) => token.chain_id === selectedChainId),
    [erc20Tokens, selectedChainId]
  );
  const chainSplTokens = useMemo(
    () => splTokens.filter((token) => token.chain_id === selectedChainId),
    [splTokens, selectedChainId]
  );
  const trackedTokens = selectedChain?.chainType === 'SOLANA' ? chainSplTokens : chainErc20Tokens;

  const totalNativeBalance = useMemo(
    () => balances.reduce((sum, wallet) => sum + wallet.nativeBalanceFormatted, 0),
    [balances]
  );

  const tokenTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    balances.forEach((wallet) => {
      const assets = selectedChain?.chainType === 'SOLANA' ? wallet.splBalances : wallet.erc20Balances;
      assets.forEach((asset) => {
        totals[asset.symbol] = (totals[asset.symbol] || 0) + asset.balanceFormatted;
      });
    });
    return totals;
  }, [balances, selectedChain?.chainType]);

  if (!role) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Role not found</h1>
          <Link to="/wallet-manage">Back to Wallet Management</Link>
        </div>
      </div>
    );
  }

  const tokenSectionTitle = selectedChain?.chainType === 'SOLANA' ? 'SPL Tokens' : 'ERC20 Tokens';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{role.name}</h1>
          <p>Derived wallets and balances</p>
        </div>
        <div className="top-bar__controls">
          <Link to="/wallet-manage">
            <button type="button">Manage Roles</button>
          </Link>
          <button type="button" className="primary" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <section className="card">
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <label>
            Chain
            <select value={selectedChainId} onChange={(e) => setSelectedChainId(e.target.value)}>
              {walletChains.map((chain) => (
                <option key={chain.id} value={chain.id}>
                  {chain.chainName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Wallet Count
            <select value={walletCount} onChange={(e) => setWalletCount(Number(e.target.value))}>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
        </div>
      </section>

      {selectedChain && balances.length > 0 ? (
        <section className="card">
          <h2>Summary</h2>
          <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
            <div>
              <strong>Total {selectedChain.nativeTokenSymbol || 'Native'}</strong>
              <p style={{ fontSize: '1.5em' }}>{totalNativeBalance.toFixed(4)}</p>
            </div>
            {Object.entries(tokenTotals).map(([symbol, total]) => (
              <div key={symbol}>
                <strong>Total {symbol}</strong>
                <p style={{ fontSize: '1.5em' }}>{total.toFixed(4)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card">
        <div className="page-header" style={{ marginBottom: '15px' }}>
          <h2>{tokenSectionTitle}</h2>
          <Link to="/wallet-manage">
            <button type="button">+ Add Token</button>
          </Link>
        </div>
        {trackedTokens.length === 0 ? (
          <p style={{ padding: '20px', color: '#888', background: '#f5f5f5', borderRadius: '4px' }}>
            No {tokenSectionTitle} configured for this chain. <Link to="/wallet-manage">Add tokens</Link> to track their balances.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
            {selectedChain?.chainType === 'SOLANA'
              ? chainSplTokens.map((token) => {
                  const totalBalance = balances.reduce((sum, wallet) => {
                    const balance = wallet.splBalances.find((item) => item.mintAddress === token.mint);
                    return sum + (balance ? balance.balanceFormatted : 0);
                  }, 0);
                  return (
                    <div key={token.id} style={{ padding: '12px 16px', background: '#f5f5f5', borderRadius: '6px', minWidth: '120px' }}>
                      <div style={{ fontSize: '0.9em', color: '#666' }}>{token.symbol}</div>
                      <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
                        {totalBalance > 0 ? totalBalance.toFixed(4) : '0.0000'}
                      </div>
                      <div style={{ fontSize: '0.75em', color: '#999' }}>{token.name}</div>
                    </div>
                  );
                })
              : chainErc20Tokens.map((token) => {
                  const totalBalance = balances.reduce((sum, wallet) => {
                    const balance = wallet.erc20Balances.find(
                      (item) => item.tokenAddress.toLowerCase() === token.address.toLowerCase()
                    );
                    return sum + (balance ? balance.balanceFormatted : 0);
                  }, 0);
                  return (
                    <div key={token.id} style={{ padding: '12px 16px', background: '#f5f5f5', borderRadius: '6px', minWidth: '120px' }}>
                      <div style={{ fontSize: '0.9em', color: '#666' }}>{token.symbol}</div>
                      <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
                        {totalBalance > 0 ? totalBalance.toFixed(4) : '0.0000'}
                      </div>
                      <div style={{ fontSize: '0.75em', color: '#999' }}>{token.name}</div>
                    </div>
                  );
                })}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Derived Wallets</h2>
        {error ? (
          <div style={{ padding: '10px', background: '#fee', color: '#c00', marginBottom: '15px' }}>
            {error}
          </div>
        ) : null}
        {loading ? (
          <p>Loading balances...</p>
        ) : balances.length === 0 ? (
          <p>No wallets to display.</p>
        ) : (
          <>
            {trackedTokens.length === 0 ? (
              <div style={{ padding: '12px 16px', background: '#e3f2fd', borderLeft: '4px solid #2196f3', marginBottom: '15px', borderRadius: '4px' }}>
                <span style={{ color: '#1976d2' }}>
                  Add {tokenSectionTitle} to track additional balances. <Link to="/wallet-manage" style={{ color: '#1976d2', textDecoration: 'underline' }}>Go to Token Management</Link>
                </span>
              </div>
            ) : null}
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Index</th>
                    <th>Address</th>
                    <th>Native Balance</th>
                    {selectedChain?.chainType === 'SOLANA'
                      ? chainSplTokens.map((token) => <th key={token.id}>{token.symbol}</th>)
                      : chainErc20Tokens.map((token) => <th key={token.id}>{token.symbol}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {balances.map((wallet) => (
                    <tr key={wallet.index}>
                      <td>{wallet.index}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'monospace', fontSize: '0.85em', wordBreak: 'break-all' }}>
                          <span>{wallet.address}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyAddress(wallet.address)}
                            style={{
                              background: copiedAddress === wallet.address ? '#e8f5e9' : 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '4px',
                              color: copiedAddress === wallet.address ? '#2e7d32' : '#666',
                              transition: 'all 0.2s',
                              flexShrink: 0
                            }}
                            title={copiedAddress === wallet.address ? 'Copied!' : 'Copy address'}
                          >
                            {copiedAddress === wallet.address ? <CheckIcon /> : <CopyIcon />}
                          </button>
                        </div>
                      </td>
                      <td>{wallet.nativeBalanceFormatted.toFixed(4)}</td>
                      {selectedChain?.chainType === 'SOLANA'
                        ? chainSplTokens.map((token) => {
                            const balance = wallet.splBalances.find((item) => item.mintAddress === token.mint);
                            const balanceValue = balance ? balance.balanceFormatted : 0;
                            return (
                              <td key={token.id} style={{ fontWeight: balanceValue > 0 ? 'bold' : 'normal', color: balanceValue > 0 ? '#2e7d32' : 'inherit' }}>
                                {balanceValue > 0 ? balanceValue.toFixed(4) : '0'}
                              </td>
                            );
                          })
                        : chainErc20Tokens.map((token) => {
                            const balance = wallet.erc20Balances.find(
                              (item) => item.tokenAddress.toLowerCase() === token.address.toLowerCase()
                            );
                            const balanceValue = balance ? balance.balanceFormatted : 0;
                            return (
                              <td key={token.id} style={{ fontWeight: balanceValue > 0 ? 'bold' : 'normal', color: balanceValue > 0 ? '#2e7d32' : 'inherit' }}>
                                {balanceValue > 0 ? balanceValue.toFixed(4) : '0'}
                              </td>
                            );
                          })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default WalletTabPage;
