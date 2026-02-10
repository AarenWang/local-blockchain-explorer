import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime, truncateMiddle } from '../data/format';
import { ChainConfig } from '../state/configStore';

interface SolanaHomePageProps {
  chain: ChainConfig;
}

interface SolanaSlotSummary {
  slot: number;
  blockTime: number | null;
  txCount: number;
}

interface SolanaSignatureSummary {
  signature: string;
  slot: number;
}

const SolanaHomePage = ({ chain }: SolanaHomePageProps) => {
  const [status, setStatus] = useState('Loading...');
  const [latency, setLatency] = useState<number | null>(null);
  const [latestSlot, setLatestSlot] = useState<number | null>(null);
  const [epoch, setEpoch] = useState<number | null>(null);
  const [leader, setLeader] = useState<string>('');
  const [slots, setSlots] = useState<SolanaSlotSummary[]>([]);
  const [recentSignatures, setRecentSignatures] = useState<SolanaSignatureSummary[]>([]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const apiBase = import.meta.env.VITE_INDEXER_API ?? 'http://localhost:7070';
        const start = performance.now();
        const [slotsResponse, txsResponse] = await Promise.all([
          fetch(`${apiBase}/chain/${chain.id}/solana/slots?limit=6`),
          fetch(`${apiBase}/chain/${chain.id}/solana/txs?limit=12`)
        ]);
        if (!slotsResponse.ok || !txsResponse.ok) {
          throw new Error('Indexer API unavailable');
        }
        const slotsData = (await slotsResponse.json()) as SolanaSlotSummary[];
        const txsData = (await txsResponse.json()) as SolanaSignatureSummary[];
        const end = performance.now();

        if (!active) {
          return;
        }

        setLatestSlot(slotsData[0]?.slot ?? null);
        setLatency(Math.round(end - start));
        setStatus('Connected');
        setSlots(slotsData);
        setRecentSignatures(txsData);
        setEpoch(null);
        setLeader('');
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
          <div className="stat-label">Latest Slot</div>
          <div className="stat-value">{latestSlot !== null ? `#${latestSlot}` : '-'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Epoch</div>
          <div className="stat-value">{epoch !== null ? epoch : '-'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Leader</div>
          <div className="stat-value mono">{leader ? truncateMiddle(leader) : '-'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Cluster</div>
          <div className="stat-value">Local</div>
        </div>
      </section>

      <section className="split-grid">
        <div className="card">
          <div className="section-title">
            <h2>Recent Slots</h2>
            <span className="muted">Slots</span>
          </div>
          <div className="list-table">
            {slots.length === 0 ? (
              <div className="empty-state">No slots yet.</div>
            ) : (
              slots.map((slot) => (
                <Link
                  key={slot.slot}
                  to={`/chain/${chain.id}/solana/slot/${slot.slot}`}
                  className="list-row"
                >
                  <div>
                    <div className="list-primary">#{slot.slot}</div>
                    <div className="list-secondary">{slot.txCount} tx</div>
                  </div>
                  <div className="list-meta">{formatDateTime(slot.blockTime)}</div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="section-title">
            <h2>Recent Transactions</h2>
            <span className="muted">Signatures</span>
          </div>
          <div className="list-table">
            {recentSignatures.length === 0 ? (
              <div className="empty-state">No signatures yet.</div>
            ) : (
              recentSignatures.map((item) => (
                <Link
                  key={item.signature}
                  to={`/chain/${chain.id}/solana/tx/${item.signature}`}
                  className="list-row"
                >
                  <div>
                    <div className="list-primary mono">{truncateMiddle(item.signature)}</div>
                    <div className="list-secondary">Slot #{item.slot}</div>
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

export default SolanaHomePage;
