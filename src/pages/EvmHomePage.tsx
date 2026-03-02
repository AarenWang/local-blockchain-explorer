import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime, formatNumber, truncateMiddle } from '../data/format';
import { ChainConfig } from '../state/configStore';

interface EvmHomePageProps {
  chain: ChainConfig;
}

interface EvmBlockSummary {
  number: number;
  timestamp: number;
  txCount: number;
}

interface EvmTxSummary {
  hash: string;
  blockNumber: number;
  gasPrice?: string;
}

const PAGE_SIZE = 50;

const EvmHomePage = ({ chain }: EvmHomePageProps) => {
  const [status, setStatus] = useState('Loading...');
  const [latency, setLatency] = useState<number | null>(null);
  const [latestBlock, setLatestBlock] = useState<number | null>(null);
  const [finalizedBlock, setFinalizedBlock] = useState<number | null>(null);
  const [gasPrice, setGasPrice] = useState<string>('');
  const [blocks, setBlocks] = useState<EvmBlockSummary[]>([]);
  const [recentTxs, setRecentTxs] = useState<EvmTxSummary[]>([]);
  const [blocksPage, setBlocksPage] = useState(0);
  const [blocksHasMore, setBlocksHasMore] = useState(true);
  const [txsPage, setTxsPage] = useState(0);
  const [txsHasMore, setTxsHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadPage = useCallback(async (page: number, type: 'blocks' | 'txs') => {
    const apiBase = import.meta.env.VITE_INDEXER_API ?? 'http://localhost:7070';
    const offset = page * PAGE_SIZE;
    const url = type === 'blocks'
      ? `${apiBase}/chain/${chain.id}/evm/blocks?limit=${PAGE_SIZE}&offset=${offset}`
      : `${apiBase}/chain/${chain.id}/evm/txs?limit=${PAGE_SIZE}&offset=${offset}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Indexer API unavailable');
    }
    const data = await response.json();
    return data as (EvmBlockSummary | EvmTxSummary)[];
  }, [chain.id]);

  const loadMore = useCallback(async (type: 'blocks' | 'txs') => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      if (type === 'blocks') {
        const nextPage = blocksPage + 1;
        const newBlocks = await loadPage(nextPage, 'blocks');
        setBlocks(prev => [...prev, ...newBlocks as EvmBlockSummary[]]);
        setBlocksPage(nextPage);
        setBlocksHasMore(newBlocks.length === PAGE_SIZE);
      } else {
        const nextPage = txsPage + 1;
        const newTxs = await loadPage(nextPage, 'txs');
        setRecentTxs(prev => [...prev, ...newTxs as EvmTxSummary[]]);
        setTxsPage(nextPage);
        setTxsHasMore(newTxs.length === PAGE_SIZE);
      }
    } catch (error) {
      console.error('Failed to load more:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, blocksPage, txsPage, loadPage]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const apiBase = import.meta.env.VITE_INDEXER_API ?? 'http://localhost:7070';
        const start = performance.now();
        const [blocksResponse, txsResponse] = await Promise.all([
          fetch(`${apiBase}/chain/${chain.id}/evm/blocks?limit=${PAGE_SIZE}`),
          fetch(`${apiBase}/chain/${chain.id}/evm/txs?limit=${PAGE_SIZE}`)
        ]);
        if (!blocksResponse.ok || !txsResponse.ok) {
          throw new Error('Indexer API unavailable');
        }
        const blocksData = (await blocksResponse.json()) as EvmBlockSummary[];
        const txsData = (await txsResponse.json()) as EvmTxSummary[];
        const end = performance.now();

        if (!active) {
          return;
        }

        const latest = blocksData[0]?.number ?? null;
        setLatestBlock(latest);
        setFinalizedBlock(latest !== null ? Math.max(latest - 2, 0) : null);
        setLatency(Math.round(end - start));
        setStatus('Connected');
        setBlocks(blocksData);
        setRecentTxs(txsData);
        setBlocksHasMore(blocksData.length === PAGE_SIZE);
        setTxsHasMore(txsData.length === PAGE_SIZE);

        const gasValue = txsData.find((item) => item.gasPrice)?.gasPrice;
        if (gasValue && gasValue.startsWith('0x')) {
          setGasPrice(`${formatNumber(parseInt(gasPrice, 16))} wei`);
        } else {
          setGasPrice(gasValue ?? '-');
        }
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
            <span className="muted">{blocks.length} blocks</span>
          </div>
          <div className="list-table">
            {blocks.length === 0 ? (
              <div className="empty-state">No blocks yet.</div>
            ) : (
              <>
                {blocks.map((block) => (
                  <Link
                    key={block.number}
                    to={`/chain/${chain.id}/evm/block/${block.number}`}
                    className="list-row"
                  >
                    <div>
                      <div className="list-primary">#{block.number}</div>
                      <div className="list-secondary">{block.txCount} tx</div>
                    </div>
                    <div className="list-meta">{formatDateTime(block.timestamp)}</div>
                  </Link>
                ))}
                {blocksHasMore && (
                  <button
                    className="list-row load-more-button"
                    onClick={() => loadMore('blocks')}
                    disabled={loadingMore}
                  >
                    {loadingMore ? 'Loading...' : `Load More (${PAGE_SIZE})`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="section-title">
            <h2>Latest Transactions</h2>
            <span className="muted">{recentTxs.length} transactions</span>
          </div>
          <div className="list-table">
            {recentTxs.length === 0 ? (
              <div className="empty-state">No transactions yet.</div>
            ) : (
              <>
                {recentTxs.map((tx) => (
                  <Link
                    key={tx.hash}
                    to={`/chain/${chain.id}/evm/tx/${tx.hash}`}
                    className="list-row"
                  >
                    <div>
                      <div className="list-primary mono">{truncateMiddle(tx.hash)}</div>
                      <div className="list-secondary">Block {tx.blockNumber}</div>
                    </div>
                    <div className="list-meta">View</div>
                  </Link>
                ))}
                {txsHasMore && (
                  <button
                    className="list-row load-more-button"
                    onClick={() => loadMore('txs')}
                    disabled={loadingMore}
                  >
                    {loadingMore ? 'Loading...' : `Load More (${PAGE_SIZE})`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default EvmHomePage;
