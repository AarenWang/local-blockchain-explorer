import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchJsonRpc } from '../data/rpc';
import { formatNumber, fromHexToEth } from '../data/format';
import { ChainConfig, useConfigStore } from '../state/configStore';
import KeyValueTable from '../components/KeyValueTable';

interface EvmTransaction {
  hash: string;
  blockNumber: string;
  from: string;
  to: string | null;
  value: string;
  gas: string;
  gasPrice: string;
  nonce: string;
}

interface EvmReceipt {
  status: string;
  gasUsed: string;
  logs: Array<{ address: string; data: string; topics: string[] }>;
}

const EvmTxPage = () => {
  const { chainId, hash } = useParams();
  const { chains } = useConfigStore();
  const chain = useMemo(
    () => chains.find((item) => item.id === chainId) as ChainConfig | undefined,
    [chains, chainId]
  );
  const [tx, setTx] = useState<EvmTransaction | null>(null);
  const [receipt, setReceipt] = useState<EvmReceipt | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!chain || !hash) {
        return;
      }
      try {
        const result = await fetchJsonRpc<EvmTransaction>(chain.rpcUrl, 'eth_getTransactionByHash', [
          hash
        ]);
        const receiptResult = await fetchJsonRpc<EvmReceipt>(
          chain.rpcUrl,
          'eth_getTransactionReceipt',
          [hash]
        );
        setTx(result);
        setReceipt(receiptResult);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load transaction');
      }
    };
    load();
  }, [chain, hash]);

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
    { label: 'Hash', value: tx.hash, copy: tx.hash },
    {
      label: 'Status',
      value: receipt?.status ? (receipt.status === '0x1' ? 'Success' : 'Failed') : 'Pending'
    },
    {
      label: 'Block',
      value: tx.blockNumber ? (
        <Link to={`/chain/${chain.id}/evm/block/${parseInt(tx.blockNumber, 16)}`}>
          #{parseInt(tx.blockNumber, 16)}
        </Link>
      ) : (
        '-'
      )
    },
    { label: 'From', value: tx.from, copy: tx.from },
    { label: 'To', value: tx.to ?? 'Contract Creation', copy: tx.to ?? undefined },
    { label: 'Value', value: `${fromHexToEth(tx.value)} ${chain.nativeTokenSymbol}` },
    { label: 'Gas Limit', value: formatNumber(parseInt(tx.gas, 16)) },
    { label: 'Gas Price', value: formatNumber(parseInt(tx.gasPrice, 16)) },
    { label: 'Gas Used', value: receipt ? formatNumber(parseInt(receipt.gasUsed, 16)) : '-' },
    { label: 'Nonce', value: parseInt(tx.nonce, 16) }
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
        <h2>Logs (Raw)</h2>
        <pre className="code-block">{JSON.stringify(receipt?.logs ?? [], null, 2)}</pre>
      </section>
    </div>
  );
};

export default EvmTxPage;
