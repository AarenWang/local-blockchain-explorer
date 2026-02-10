import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchJsonRpc, measureRpc } from '../data/rpc';
import { formatDateTime, formatNumber, truncateMiddle } from '../data/format';
import { ChainConfig } from '../state/configStore';

interface EvmHomePageProps {
  chain: ChainConfig;
}

interface EvmBlockSummary {
  number: number;
  timestamp: number;
  transactions: string[];
}

interface EvmTxSummary {
  hash: string;
  blockNumber: number;
}

const EvmHomePage = ({ chain }: EvmHomePageProps) => {
  const [status, setStatus] = useState('Loading...');
  const [latency, setLatency] = useState<number | null>(null);
  const [latestBlock, setLatestBlock] = useState<number | null>(null);
  const [finalizedBlock, setFinalizedBlock] = useState<number | null>(null);
  const [gasPrice, setGasPrice] = useState<string>('');
  const [blocks, setBlocks] = useState<EvmBlockSummary[]>([]);
  const [recentTxs, setRecentTxs] = useState<EvmTxSummary[]>([]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const { result, latencyMs } = await measureRpc(() =>
          fetchJsonRpc<string>(chain.rpcUrl, 'eth_blockNumber')
        );
        if (!active) {
          return;
        }
        const latest = parseInt(result, 16);
        setLatestBlock(latest);
        setFinalizedBlock(Math.max(latest - 2, 0));
        setLatency(latencyMs);
        setStatus('Connected');

        try {
          const priceHex = await fetchJsonRpc<string>(chain.rpcUrl, 'eth_gasPrice');
          if (active) {
            setGasPrice(`${formatNumber(parseInt(priceHex, 16))} wei`);
          }
        } catch {
          if (active) {
            setGasPrice('-');
          }
        }

        const blockNumbers = Array.from({ length: 5 }, (_, index) => latest - index).filter(
          (num) => num >= 0
        );
        const summaries = await Promise.all(
          blockNumbers.map(async (num) => {
            try {
              const block = await fetchJsonRpc<{
                number: string;
                timestamp: string;
                transactions: string[];
              }>(chain.rpcUrl, 'eth_getBlockByNumber', [`0x${num.toString(16)}`, false]);
              return {
                number: parseInt(block.number, 16),
                timestamp: parseInt(block.timestamp, 16),
                transactions: block.transactions
              };
            } catch {
              return null;
            }
          })
        );
        if (!active) {
          return;
        }
        const validSummaries = summaries.filter((item): item is EvmBlockSummary => Boolean(item));
        setBlocks(validSummaries);

        const txs = validSummaries
          .flatMap((block) =>
            block.transactions.slice(0, 4).map((hash) => ({
              hash,
              blockNumber: block.number
            }))
          )
          .slice(0, 10);
        setRecentTxs(txs);
      } catch (error) {
        if (active) {
          setStatus(error instanceof Error ? error.message : 'RPC error');
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [chain]);

  const pageTitle = useMemo(() => `${chain.chainType} - ${chain.chainName}`, [chain]);

  return (
    <div className="page">
      <div className="home-hero">
        <div>
          <h1>{pageTitle}</h1>
          <p className="muted">RPC: {chain.rpcUrl}</p>
        </div>
        <div className="status-pill">
          {status} · {latency ? `${latency}ms` : 'latency -'}
        </div>
      </div>

      <section className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Latest Block</div>
          <div className="stat-value">{latestBlock !== null ? `#${latestBlock}` : '-'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Finalized</div>
          <div className="stat-value">{finalizedBlock !== null ? `#${finalizedBlock}` : '-'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Gas Price</div>
          <div className="stat-value">{gasPrice || '-'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Chains</div>
          <div className="stat-value">Local</div>
        </div>
      </section>

      <section className="split-grid">
        <div className="card">
          <div className="section-title">
            <h2>Latest Blocks</h2>
            <span className="muted">Blocks</span>
          </div>
          <div className="list-table">
            {blocks.length === 0 ? (
              <div className="empty-state">No blocks yet.</div>
            ) : (
              blocks.map((block) => (
                <Link
                  key={block.number}
                  to={`/chain/${chain.id}/evm/block/${block.number}`}
                  className="list-row"
                >
                  <div>
                    <div className="list-primary">#{block.number}</div>
                    <div className="list-secondary">{block.transactions.length} tx</div>
                  </div>
                  <div className="list-meta">{formatDateTime(block.timestamp)}</div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="section-title">
            <h2>Latest Transactions</h2>
            <span className="muted">Transactions</span>
          </div>
          <div className="list-table">
            {recentTxs.length === 0 ? (
              <div className="empty-state">No transactions yet.</div>
            ) : (
              recentTxs.map((tx) => (
                <Link
                  key={tx.hash}
                  to={`/chain/${chain.id}/evm/tx/${tx.hash}`}
                  className="list-row"
                >
                  <div>
                    <div className="list-primary mono">{truncateMiddle(tx.hash)}</div>
                    <div className="list-secondary">Block #{tx.blockNumber}</div>
                  </div>
                  <div className="list-meta">View</div>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default EvmHomePage;
