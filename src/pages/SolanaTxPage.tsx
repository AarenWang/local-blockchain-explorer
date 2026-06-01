import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiUrl } from '../api';
import { ChainConfig, useConfigStore } from '../state/configStore';
import { truncateMiddle } from '../data/format';
import KeyValueTable from '../components/KeyValueTable';
import TagManager from '../components/TagManager';

interface SolanaTxResult {
  slot: number;
  meta: {
    err: unknown;
    fee: number;
    logMessages?: string[];
    preBalances?: number[];
    postBalances?: number[];
  } | null;
  transaction?: {
    message: {
      instructions: Array<{ programId: string; parsed?: unknown }>;
    };
  };
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

const SolanaTxPage = () => {
  const { chainId, signature } = useParams();
  const { chains } = useConfigStore();
  const chain = useMemo(
    () => chains.find((item) => item.id === chainId) as ChainConfig | undefined,
    [chains, chainId]
  );
  const [tx, setTx] = useState<SolanaTxResult | null>(null);
  const [splTransfers, setSplTransfers] = useState<SplTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!chain || !signature) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        // Try different encoding formats
        const formats = [
          { encoding: 'jsonParsed' },
          { encoding: 'json' },
          {}
        ];

        let result: SolanaTxResult | null = null;
        let lastError: Error | null = null;

        for (const params of formats) {
          try {
            const response = await fetch(chain.rpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTransaction',
                params: [signature, params]
              })
            });

            const data = await response.json();
            if (data.result) {
              result = data.result;
              break;
            }
          } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
          }
        }

        if (!result) {
          setError(lastError?.message || 'Transaction not found');
        } else {
          setTx(result);
          const splResponse = await fetch(
            apiUrl(`/chain/${chain.id}/solana/tx/${signature}/spl-transfers`)
          );
          if (splResponse.ok) {
            setSplTransfers(await splResponse.json());
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to load transaction';
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [chain, signature]);

  if (!chain) {
    return (
      <div className="page">
        <h1>Chain not found</h1>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <p>Loading transaction...</p>
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

  if (!tx) {
    return (
      <div className="page">
        <h1>Transaction not found</h1>
      </div>
    );
  }

  const rows = [
    { label: 'Signature', value: signature ?? '-', copy: signature ?? undefined },
    { label: 'Status', value: tx.meta?.err ? 'Failed' : 'Success' },
    { label: 'Slot', value: tx.slot },
    { label: 'Fee', value: `${tx.meta?.fee ?? 0} lamports` }
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Transaction</h1>
          <p>{chain.chainName}</p>
        </div>
        <TagManager type="tx" target={signature ?? ''} />
      </div>

      <section className="card">
        <KeyValueTable rows={rows} />
      </section>

      <section className="card">
        <h2>Instructions</h2>
        <pre className="code-block">
          {JSON.stringify(tx.transaction?.message?.instructions ?? [], null, 2)}
        </pre>
      </section>

      {splTransfers.length > 0 ? (
        <section className="card">
          <h2>SPL Transfers</h2>
          <div className="list-table">
            <div className="list-row list-row--header">
              <span>Token</span>
              <span>From</span>
              <span>To</span>
              <span>Amount</span>
            </div>
            {splTransfers.map((transfer) => (
              <div key={transfer.id} className="list-row">
                <span className="list-primary">
                  {transfer.tokenSymbol || 'Unknown'}
                  <span className="list-secondary">{truncateMiddle(transfer.mint_address)}</span>
                </span>
                <span className="mono list-secondary">
                  {truncateMiddle(transfer.source_owner || transfer.source_token_account)}
                </span>
                <span className="mono list-secondary">
                  {truncateMiddle(transfer.destination_owner || transfer.destination_token_account)}
                </span>
                <span className="mono">{formatTokenAmount(transfer.amount, transfer.tokenDecimals)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tx.meta?.logMessages && tx.meta.logMessages.length > 0 ? (
        <section className="card">
          <h2>Log Messages</h2>
          <pre className="code-block">
            {JSON.stringify(tx.meta.logMessages, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
};

export default SolanaTxPage;
