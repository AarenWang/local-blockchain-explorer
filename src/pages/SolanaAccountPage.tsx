import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchJsonRpc } from '../data/rpc';
import { ChainConfig, SplTokenInfo, useConfigStore } from '../state/configStore';
import KeyValueTable from '../components/KeyValueTable';
import TagManager from '../components/TagManager';

interface AccountInfoResult {
  value: {
    lamports: number;
    owner: string;
    rentEpoch: number;
    data: [string, string];
  } | null;
}

interface TokenBalance {
  mintAddress: string;
  symbol: string;
  decimals: number;
  balance: number;
  balanceFormatted: number;
}

const SolanaAccountPage = () => {
  const { chainId, address } = useParams();
  const { chains } = useConfigStore();
  const chain = useMemo(
    () => chains.find((item) => item.id === chainId) as ChainConfig | undefined,
    [chains, chainId]
  );
  const [balance, setBalance] = useState<number | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfoResult['value'] | null>(null);
  const [splBalances, setSplBalances] = useState<TokenBalance[]>([]);
  const [loadingSpl, setLoadingSpl] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!chain || !address) {
        return;
      }
      try {
        const balanceResult = await fetchJsonRpc<{ value: number }>(chain.rpcUrl, 'getBalance', [
          address
        ]);
        const infoResult = await fetchJsonRpc<AccountInfoResult>(
          chain.rpcUrl,
          'getAccountInfo',
          [address, { encoding: 'base64' }]
        );
        setBalance(balanceResult.value);
        setAccountInfo(infoResult.value);
        setError('');

        // Load SPL token balances if configured
        if (chain.splTokens && chain.splTokens.length > 0) {
          await loadSplBalances();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load account');
      }
    };
    load();
  }, [chain, address]);

  const loadSplBalances = async () => {
    if (!chain || !address || !chain.splTokens || chain.splTokens.length === 0) return;

    setLoadingSpl(true);
    try {
      const balances: TokenBalance[] = [];

      for (const token of chain.splTokens) {
        try {
          // Get the token account for this wallet
          // Note: In a real implementation, you'd need to find all token accounts owned by this wallet
          // For simplicity, we're checking a derived token account address
          const tokenAccountAddress = await findTokenAccount(address, token.mint, chain.rpcUrl);

          if (tokenAccountAddress) {
            const accountResult = await fetchJsonRpc<{ value: { data: [string, string] } | null }>(
              chain.rpcUrl,
              'getAccountInfo',
              [tokenAccountAddress, { encoding: 'base64json' }]
            );

            if (accountResult.value?.data) {
              const base64Data = accountResult.value.data[0];
              const data = JSON.parse(base64Data);

              // Token account data structure:
              // - 1 byte: mint option
              // - 32 bytes: mint
              // - 1 byte: owner option
              // - 32 bytes: owner
              // - 8 bytes: amount (u64)
              // - ... more fields

              // Extract amount from the parsed data
              // This is simplified - actual implementation would need proper parsing
              const amount = data?.parsed?.info?.tokenAmount?.amount || 0;
              const decimals = data?.parsed?.info?.tokenAmount?.decimals || token.decimals;

              const balanceFormatted = Number(amount) / (10 ** decimals);

              if (balanceFormatted > 0) {
                balances.push({
                  mintAddress: token.mint,
                  symbol: token.symbol || 'Unknown',
                  decimals: token.decimals || 0,
                  balance: Number(amount),
                  balanceFormatted
                });
              }
            }
          }
        } catch (err) {
          console.error(`Error fetching SPL balance for ${token.symbol}:`, err);
        }
      }

      setSplBalances(balances);
    } catch (err) {
      console.error('Failed to load SPL balances:', err);
    } finally {
      setLoadingSpl(false);
    }
  };

  // Helper to find token account address
  const findTokenAccount = async (walletAddress: string, mintAddress: string, rpcUrl: string) => {
    try {
      // Derive the token account address using SPL Token program
      // PDA = [ TOKEN_PROGRAM_ID, wallet, mint ]
      const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

      // Simple approach: try to get the largest token accounts owned by this wallet
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTokenAccountsByOwner',
          params: [
            walletAddress,
            { mint: mintAddress },
            { encoding: 'base64' }
          ]
        })
      });

      const data = await response.json();

      if (data.result && data.result.value && data.result.value.length > 0) {
        return data.result.value[0].pubkey;
      }

      return null;
    } catch (err) {
      console.error('Error finding token account:', err);
      return null;
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
    { label: 'Account', value: address, copy: address },
    {
      label: 'Balance',
      value: balance !== null ? `${balance / 1e9} SOL` : '-' // Convert lamports to SOL
    },
    {
      label: 'Owner',
      value: accountInfo?.owner ? (
        <Link to={`/chain/${chain.id}/solana/account/${accountInfo.owner}`}>
          {accountInfo.owner}
        </Link>
      ) : (
        '-'
      ),
      copy: accountInfo?.owner ?? undefined
    },
    { label: 'Rent Epoch', value: accountInfo?.rentEpoch ?? '-' }
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Account</h1>
          <p>{chain.chainName}</p>
        </div>
        <TagManager type="address" target={address} />
      </div>

      <section className="card">
        <KeyValueTable rows={rows} />
      </section>

      {chain.splTokens && chain.splTokens.length > 0 ? (
        <section className="card">
          <h2>SPL Token Assets</h2>
          {loadingSpl ? (
            <p className="muted">Loading SPL balances...</p>
          ) : splBalances.length === 0 ? (
            <p className="muted">No SPL tokens found for this account.</p>
          ) : (
            <div className="list">
              {splBalances.map((tokenBalance) => (
                <div key={tokenBalance.mintAddress} className="list-item">
                  <span>
                    <strong>{tokenBalance.symbol}</strong>
                    <span className="token-address">{tokenBalance.mintAddress.slice(0, 8)}...</span>
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
        <h2>Data (Base64)</h2>
        <pre className="code-block">{accountInfo?.data?.[0] ?? '-'}</pre>
      </section>
    </div>
  );
};

export default SolanaAccountPage;
