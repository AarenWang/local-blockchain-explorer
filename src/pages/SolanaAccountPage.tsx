import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiUrl } from '../api';
import { fetchJsonRpc } from '../data/rpc';
import { truncateMiddle } from '../data/format';
import { ChainConfig, useConfigStore } from '../state/configStore';
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

interface SplBalance {
  mintAddress: string;
  symbol: string;
  balance: string;
  balanceFormatted: number;
}

interface SplTransfer {
  id: string;
  mint_address: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
  source_owner: string | null;
  destination_owner: string | null;
  source_token_account: string;
  destination_token_account: string;
  amount: string;
  signature: string;
  slot: number;
}

const formatTokenAmount = (amount: string, decimals = 0) => {
  const raw = BigInt(amount);
  if (decimals === 0) {
    return raw.toString();
  }

  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const fraction = (raw % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
};

const SolanaAccountPage = () => {
  const { chainId, address } = useParams();
  const { chains } = useConfigStore();
  const chain = useMemo(
    () => chains.find((item) => item.id === chainId) as ChainConfig | undefined,
    [chains, chainId]
  );
  const [balance, setBalance] = useState<number | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfoResult['value'] | null>(null);
  const [splBalances, setSplBalances] = useState<SplBalance[]>([]);
  const [splTransfers, setSplTransfers] = useState<SplTransfer[]>([]);
  const [loadingSpl, setLoadingSpl] = useState(false);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
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

        await Promise.all([loadSplBalances(), loadSplTransfers()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load account');
      }
    };
    load();
  }, [chain, address]);

  const loadSplBalances = async () => {
    if (!chain || !address) return;

    setLoadingSpl(true);
    try {
      for (const token of chain.splTokens || []) {
        if (!token.symbol || token.decimals === undefined) {
          continue;
        }
        await fetch(apiUrl('/spl-tokens'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chainId: chain.id,
            symbol: token.symbol,
            name: token.symbol,
            mint: token.mint,
            decimals: token.decimals
          })
        }).catch(() => undefined);
      }

      const response = await fetch(apiUrl(`/chain/${chain.id}/solana/address/${address}/spl-balances`));
      if (response.ok) {
        setSplBalances(await response.json());
      }
    } catch (err) {
      console.error('Failed to load SPL balances:', err);
    } finally {
      setLoadingSpl(false);
    }
  };

  const loadSplTransfers = async () => {
    if (!chain || !address) return;

    setLoadingTransfers(true);
    try {
      const response = await fetch(
        apiUrl(`/chain/${chain.id}/solana/address/${address}/spl-transfers?limit=50`)
      );
      if (response.ok) {
        setSplTransfers(await response.json());
      }
    } catch (err) {
      console.error('Failed to load SPL transfers:', err);
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
    { label: 'Account', value: address, copy: address },
    {
      label: 'Balance',
      value: balance !== null ? `${balance / 1e9} SOL` : '-'
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
                  <span className="token-address">{truncateMiddle(tokenBalance.mintAddress)}</span>
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

      <section className="card">
        <h2>SPL Token Transfers</h2>
        {loadingTransfers ? (
          <p className="muted">Loading SPL transfers...</p>
        ) : splTransfers.length === 0 ? (
          <p className="muted">No SPL transfers found for this account.</p>
        ) : (
          <div className="list-table">
            <div className="list-row list-row--header">
              <span>Token</span>
              <span>Type</span>
              <span>Amount</span>
              <span>Signature</span>
              <span>Slot</span>
            </div>
            {splTransfers.map((transfer) => {
              const isIncoming =
                transfer.destination_owner === address || transfer.destination_token_account === address;

              return (
                <Link
                  key={transfer.id}
                  className="list-row"
                  to={`/chain/${chain.id}/solana/tx/${transfer.signature}`}
                >
                  <span className="list-primary">
                    {transfer.tokenSymbol || 'Unknown'}
                    <span className="list-secondary">{truncateMiddle(transfer.mint_address)}</span>
                  </span>
                  <span>
                    <span className={`status-pill ${isIncoming ? 'in' : 'out'}`}>
                      {isIncoming ? 'IN' : 'OUT'}
                    </span>
                  </span>
                  <span className="mono">{formatTokenAmount(transfer.amount, transfer.tokenDecimals)}</span>
                  <span className="mono list-secondary">{truncateMiddle(transfer.signature)}</span>
                  <span className="list-secondary">{transfer.slot}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Data (Base64)</h2>
        <pre className="code-block">{accountInfo?.data?.[0] ?? '-'}</pre>
      </section>
    </div>
  );
};

export default SolanaAccountPage;
