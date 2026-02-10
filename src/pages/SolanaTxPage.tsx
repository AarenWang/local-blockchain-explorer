import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchJsonRpc } from '../data/rpc';
import { ChainConfig, useConfigStore } from '../state/configStore';
import KeyValueTable from '../components/KeyValueTable';

interface SolanaTxResult {
  slot: number;
  meta: {
    err: unknown;
    fee: number;
    logMessages?: string[];
  } | null;
  transaction: {
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
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!chain || !signature) {
        return;
      }
      try {
        const result = await fetchJsonRpc<SolanaTxResult>(chain.rpcUrl, 'getTransaction', [
          signature,
          { encoding: 'json', maxSupportedTransactionVersion: 0 }
        ]);
        setTx(result);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load transaction');
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
        <p>Loading transaction...</p>
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
      </div>

      <section className="card">
        <KeyValueTable rows={rows} />
      </section>

      <section className="card">
        <h2>Instructions</h2>
        <pre className="code-block">{JSON.stringify(tx.transaction.message.instructions, null, 2)}</pre>
      </section>

      <section className="card">
        <h2>Log Messages</h2>
        <pre className="code-block">{JSON.stringify(tx.meta?.logMessages ?? [], null, 2)}</pre>
      </section>
    </div>
  );
};

export default SolanaTxPage;
