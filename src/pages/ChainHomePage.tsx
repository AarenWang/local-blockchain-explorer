import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchJsonRpc, measureRpc } from '../data/rpc';
import { ChainConfig, useConfigStore } from '../state/configStore';
import { formatNumber, truncateMiddle } from '../data/format';

interface EvmBlockSummary {
  number: number;
  timestamp: number;
  transactions: string[];
}

interface SolanaBlockSummary {
  slot: number;
  blockTime: number | null;
  transactions: unknown[];
}

const ChainHomePage = () => {
  const { chainId } = useParams();
  const { chains } = useConfigStore();
  const chain = useMemo(
    () => chains.find((item) => item.id === chainId) as ChainConfig | undefined,
    [chains, chainId]
  );
  const [status, setStatus] = useState('Loading...');
  const [latency, setLatency] = useState<number | null>(null);
  const [evmBlocks, setEvmBlocks] = useState<EvmBlockSummary[]>([]);
  const [solanaBlocks, setSolanaBlocks] = useState<SolanaBlockSummary[]>([]);
  const [headlineValue, setHeadlineValue] = useState<string>('');
  const [gasPrice, setGasPrice] = useState<string>('');

  useEffect(() => {
    const load = async () => {
      if (!chain) {
        return;
      }
      try {
        if (chain.chainType === 'EVM') {
          const { result, latencyMs } = await measureRpc(() =>
            fetchJsonRpc<string>(chain.rpcUrl, 'eth_blockNumber')
          );
          const latest = parseInt(result, 16);
          setLatency(latencyMs);
          setHeadlineValue(`#${latest}`);
          setStatus('Connected');

          const priceHex = await fetchJsonRpc<string>(chain.rpcUrl, 'eth_gasPrice');
          setGasPrice(`${formatNumber(parseInt(priceHex, 16))} wei`);

          const blockNumbers = Array.from({ length: 3 }, (_, index) => latest - index).filter(
            (num) => num >= 0
          );
          const summaries = await Promise.all(
            blockNumbers.map(async (num) => {
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
            })
          );
          setEvmBlocks(summaries);
        } else {
          const { result, latencyMs } = await measureRpc(() =>
            fetchJsonRpc<number>(chain.rpcUrl, 'getSlot')
          );
          setLatency(latencyMs);
          setHeadlineValue(`#${result}`);
          setStatus('Connected');

          const slotNumbers = Array.from({ length: 3 }, (_, index) => result - index).filter(
            (num) => num >= 0
          );
          const summaries = await Promise.all(
            slotNumbers.map(async (slot) => {
              const block = await fetchJsonRpc<{ blockTime: number | null; transactions: unknown[] }>(
                chain.rpcUrl,
                'getBlock',
                [slot, { transactionDetails: 'none' }]
              );
              return {
                slot,
                blockTime: block.blockTime,
                transactions: block.transactions
              };
            })
          );
          setSolanaBlocks(summaries);
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'RPC error');
      }
    };

    load();
  }, [chain]);

  if (!chain) {
    return (
      <div className="page">
        <h1>Chain not found</h1>
        <p>Please select or add a chain configuration.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>
            {chain.chainType} - {chain.chainName}
          </h1>
          <p>RPC: {chain.rpcUrl}</p>
        </div>
        <div className="status-pill">
          {status} · {latency ? `${latency}ms` : 'latency -'}
        </div>
      </div>

      <section className="grid">
        <div className="card">
          <h3>{chain.chainType === 'EVM' ? 'Latest Block' : 'Latest Slot'}</h3>
          <p className="headline">{headlineValue || '-'}</p>
        </div>
        {chain.chainType === 'EVM' ? (
          <div className="card">
            <h3>Gas Price</h3>
            <p className="headline">{gasPrice || '-'}</p>
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2>{chain.chainType === 'EVM' ? 'Latest Blocks' : 'Recent Slots'}</h2>
        <div className="list">
          {chain.chainType === 'EVM'
            ? evmBlocks.map((block) => (
                <Link
                  key={block.number}
                  to={`/chain/${chain.id}/evm/block/${block.number}`}
                  className="list-item"
                >
                  <div>
                    <strong>#{block.number}</strong>
                    <span>{block.transactions.length} tx</span>
                  </div>
                  <span>{new Date(block.timestamp * 1000).toLocaleTimeString()}</span>
                </Link>
              ))
            : solanaBlocks.map((block) => (
                <Link
                  key={block.slot}
                  to={`/chain/${chain.id}/solana/slot/${block.slot}`}
                  className="list-item"
                >
                  <div>
                    <strong>#{block.slot}</strong>
                    <span>{block.transactions.length} tx</span>
                  </div>
                  <span>
                    {block.blockTime ? new Date(block.blockTime * 1000).toLocaleTimeString() : '-'}
                  </span>
                </Link>
              ))}
        </div>
      </section>

      <section className="card">
        <h2>Recent Transactions</h2>
        <div className="list">
          {chain.chainType === 'EVM'
            ? evmBlocks.flatMap((block) =>
                block.transactions.slice(0, 3).map((tx) => (
                  <Link
                    key={tx}
                    to={`/chain/${chain.id}/evm/tx/${tx}`}
                    className="list-item"
                  >
                    <span>{truncateMiddle(tx)}</span>
                    <span>from block #{block.number}</span>
                  </Link>
                ))
              )
            : solanaBlocks.flatMap((block) =>
                block.transactions.slice(0, 3).map((_, index) => (
                  <div key={`${block.slot}-${index}`} className="list-item">
                    <span>Slot {block.slot} transaction</span>
                    <span>Details in slot view</span>
                  </div>
                ))
              )}
        </div>
      </section>
    </div>
  );
};

export default ChainHomePage;
