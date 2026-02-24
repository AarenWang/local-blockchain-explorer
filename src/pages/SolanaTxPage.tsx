import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchJsonRpc } from '../data/rpc';
import { ChainConfig, useConfigStore } from '../state/configStore';
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

const SolanaTxPage = () => {
  const { chainId, signature } = useParams();
  const { chains } = useConfigStore();
  const chain = useMemo(
    () => chains.find((item) => item.id === chainId) as ChainConfig | undefined,
    [chains, chainId]
  );
  const [tx, setTx] = useState<SolanaTxResult | null>(null);
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
        <TagManager type="tx" target={signature} />
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
