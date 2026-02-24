import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchJsonRpc } from '../data/rpc';
import { formatDateTime, truncateMiddle } from '../data/format';
import { ChainConfig, useConfigStore } from '../state/configStore';
import KeyValueTable from '../components/KeyValueTable';

interface SolanaBlock {
  blockTime: number | null;
  blockHeight?: number | null;
  parentSlot?: number;
  blockhash?: string;
  parentBlockhash?: string;
  previousBlockhash?: string;
  signatures?: string[];
  transactions?: Array<{ transaction: { signatures: string[] } }>;
}

const SolanaSlotPage = () => {
  const { chainId, slot } = useParams();
  const { chains } = useConfigStore();
  const chain = useMemo(
    () => chains.find((item) => item.id === chainId) as ChainConfig | undefined,
    [chains, chainId]
  );
  const [block, setBlock] = useState<SolanaBlock | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!chain || !slot) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        // Try to get block by slot
        const result = await fetch(chain.rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getBlock',
            params: [Number(slot), { encoding: 'json', transactionDetails: 'signatures' }]
          })
        });

        const data = await result.json();

        if (data.error) {
          throw new Error(data.error.message || 'Failed to load slot');
        }

        if (!data.result) {
          setError('Slot not found');
        } else {
          setBlock(data.result);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to load slot';
        setError(errorMsg);
      } finally {
        setLoading(false);
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

  if (loading) {
    return (
      <div className="page">
        <p>Loading slot...</p>
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
        <h1>Slot not found</h1>
      </div>
    );
  }

  // When using transactionDetails: 'signatures', Solana returns a flat signatures array
  const signatures = block.signatures || [];
  const rows = [
    { label: 'Slot', value: slot ?? '-' },
    { label: 'Block Time', value: block.blockTime ? formatDateTime(block.blockTime) : '-' },
    { label: 'Blockhash', value: block.blockhash ?? '-', copy: block.blockhash ?? undefined },
    {
      label: 'Parent Blockhash',
      value: block.previousBlockhash ?? block.parentBlockhash ?? '-',
      copy: block.previousBlockhash ?? block.parentBlockhash ?? undefined
    }
  ];

  if (block.blockHeight !== undefined && block.blockHeight !== null) {
    rows.push({ label: 'Block Height', value: block.blockHeight });
  }

  if (block.parentSlot !== undefined) {
    rows.push({ label: 'Parent Slot', value: block.parentSlot });
  }

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
        <h2>Transactions ({signatures.length})</h2>
        {signatures.length === 0 ? (
          <p className="muted">No transactions in this slot.</p>
        ) : (
          <div className="list">
            {signatures.map((signature) => (
              <Link key={signature} className="list-item" to={`/chain/${chain.id}/solana/tx/${signature}`}>
                <span>{truncateMiddle(signature)}</span>
                <span>View Transaction</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default SolanaSlotPage;
