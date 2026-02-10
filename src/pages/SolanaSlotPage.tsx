import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchJsonRpc } from '../data/rpc';
import { formatDateTime, truncateMiddle } from '../data/format';
import { ChainConfig, useConfigStore } from '../state/configStore';
import KeyValueTable from '../components/KeyValueTable';

interface SolanaBlock {
  blockTime: number | null;
  blockHeight?: number | null;
  previousBlockhash?: string;
  blockhash?: string;
  transactions: Array<{ transaction: { signatures: string[] } }>;
}

const SolanaSlotPage = () => {
  const { chainId, slot } = useParams();
  const { chains } = useConfigStore();
  const chain = useMemo(
    () => chains.find((item) => item.id === chainId) as ChainConfig | undefined,
    [chains, chainId]
  );
  const [block, setBlock] = useState<SolanaBlock | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!chain || !slot) {
        return;
      }
      try {
        const result = await fetchJsonRpc<SolanaBlock>(chain.rpcUrl, 'getBlock', [
          Number(slot),
          { transactionDetails: 'signatures' }
        ]);
        setBlock(result);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load slot');
      }
    };
    load();
  }, [chain, slot]);

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

  if (!block) {
    return (
      <div className="page">
        <p>Loading slot...</p>
      </div>
    );
  }

  const rows = [
    { label: 'Slot', value: slot ?? '-' },
    { label: 'Block Time', value: formatDateTime(block.blockTime ?? null) },
    { label: 'Blockhash', value: block.blockhash ?? '-', copy: block.blockhash ?? undefined },
    {
      label: 'Previous Blockhash',
      value: block.previousBlockhash ?? '-',
      copy: block.previousBlockhash ?? undefined
    }
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Slot #{slot}</h1>
          <p>{chain.chainName}</p>
        </div>
      </div>

      <section className="card">
        <KeyValueTable rows={rows} />
      </section>

      <section className="card">
        <h2>Transactions ({block.transactions.length})</h2>
        <div className="list">
          {block.transactions.map((item) => {
            const signature = item.transaction.signatures[0];
            return (
              <Link key={signature} className="list-item" to={`/chain/${chain.id}/solana/tx/${signature}`}>
                <span>{truncateMiddle(signature)}</span>
                <span>View Transaction</span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default SolanaSlotPage;
