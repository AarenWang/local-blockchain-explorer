import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchJsonRpc } from '../data/rpc';
import { fromHexToEth, truncateMiddle } from '../data/format';
import { ChainConfig, useConfigStore } from '../state/configStore';
import KeyValueTable from '../components/KeyValueTable';

interface AddressTxSummary {
  hash: string;
  blockNumber: number;
  from: string;
  to: string | null;
}

const EvmAddressPage = () => {
  const { chainId, address } = useParams();
  const { chains } = useConfigStore();
  const chain = useMemo(
    () => chains.find((item) => item.id === chainId) as ChainConfig | undefined,
    [chains, chainId]
  );
  const [balance, setBalance] = useState<string>('');
  const [txCount, setTxCount] = useState<number | null>(null);
  const [recentTxs, setRecentTxs] = useState<AddressTxSummary[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!chain || !address) {
        return;
      }
      try {
        const balanceHex = await fetchJsonRpc<string>(chain.rpcUrl, 'eth_getBalance', [
          address,
          'latest'
        ]);
        const nonceHex = await fetchJsonRpc<string>(chain.rpcUrl, 'eth_getTransactionCount', [
          address,
          'latest'
        ]);
        const apiBase = import.meta.env.VITE_INDEXER_API ?? 'http://localhost:7070';
        const txResponse = await fetch(
          `${apiBase}/chain/${chain.id}/evm/address/${address}/txs?limit=20`
        );
        if (!txResponse.ok) {
          throw new Error('Indexer API unavailable');
        }
        const txs = (await txResponse.json()) as AddressTxSummary[];
        setBalance(balanceHex);
        setTxCount(parseInt(nonceHex, 16));
        setRecentTxs(txs);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load address');
      }
    };
    load();
  }, [chain, address]);

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

  if (!address) {
    return (
      <div className="page">
        <p>Missing address.</p>
      </div>
    );
  }

  const rows = [
    { label: 'Address', value: address, copy: address },
    {
      label: 'Balance',
      value: balance ? `${fromHexToEth(balance)} ${chain.nativeTokenSymbol}` : '-'
    },
    { label: 'Tx Count', value: txCount ?? '-' }
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Address</h1>
          <p>{chain.chainName}</p>
        </div>
      </div>

      <section className="card">
        <KeyValueTable rows={rows} />
      </section>

      <section className="card">
        <h2>Recent Transactions</h2>
        {recentTxs.length === 0 ? (
          <p className="muted">No recent transactions found.</p>
        ) : (
          <div className="list">
            {recentTxs.map((tx) => (
              <Link key={tx.hash} className="list-item" to={`/chain/${chain.id}/evm/tx/${tx.hash}`}>
                <span>{truncateMiddle(tx.hash)}</span>
                <span>Block #{tx.blockNumber}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default EvmAddressPage;
