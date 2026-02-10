import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchJsonRpc } from '../data/rpc';
import { formatDateTime, formatNumber, truncateMiddle } from '../data/format';
import { ChainConfig, useConfigStore } from '../state/configStore';
import KeyValueTable from '../components/KeyValueTable';

interface EvmBlock {
  number: string;
  hash: string;
  timestamp: string;
  miner: string;
  gasUsed: string;
  gasLimit: string;
  transactions: string[];
}

const EvmBlockPage = () => {
  const { chainId, number } = useParams();
  const { chains } = useConfigStore();
  const chain = useMemo(
    () => chains.find((item) => item.id === chainId) as ChainConfig | undefined,
    [chains, chainId]
  );
  const [block, setBlock] = useState<EvmBlock | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const load = async () => {
      if (!chain || !number) {
        return;
      }
      try {
        const hex = `0x${Number(number).toString(16)}`;
        const result = await fetchJsonRpc<EvmBlock>(chain.rpcUrl, 'eth_getBlockByNumber', [
          hex,
          false
        ]);
        setBlock(result);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load block');
      }
    };
    load();
  }, [chain, number]);

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
        <p>Loading block...</p>
      </div>
    );
  }

  const rows = [
    { label: 'Block Number', value: parseInt(block.number, 16) },
    { label: 'Hash', value: block.hash, copy: block.hash },
    { label: 'Timestamp', value: formatDateTime(parseInt(block.timestamp, 16)) },
    {
      label: 'Miner',
      value: (
        <Link to={`/chain/${chain.id}/evm/address/${block.miner}`}>{block.miner}</Link>
      ),
      copy: block.miner
    },
    { label: 'Gas Used', value: formatNumber(parseInt(block.gasUsed, 16)) },
    { label: 'Gas Limit', value: formatNumber(parseInt(block.gasLimit, 16)) }
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Block #{parseInt(block.number, 16)}</h1>
          <p>{chain.chainName}</p>
        </div>
      </div>

      <section className="card">
        <KeyValueTable rows={rows} />
      </section>

      <section className="card">
        <h2>Transactions ({block.transactions.length})</h2>
        <div className="list">
          {block.transactions.map((tx) => (
            <Link key={tx} className="list-item" to={`/chain/${chain.id}/evm/tx/${tx}`}>
              <span>{truncateMiddle(tx)}</span>
              <span>View Transaction</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};

export default EvmBlockPage;
