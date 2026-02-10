import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchJsonRpc } from '../data/rpc';
import { fromHexToEth } from '../data/format';
import { ChainConfig, useConfigStore } from '../state/configStore';
import KeyValueTable from '../components/KeyValueTable';

const EvmAddressPage = () => {
  const { chainId, address } = useParams();
  const { chains } = useConfigStore();
  const chain = useMemo(
    () => chains.find((item) => item.id === chainId) as ChainConfig | undefined,
    [chains, chainId]
  );
  const [balance, setBalance] = useState<string>('');
  const [txCount, setTxCount] = useState<number | null>(null);
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
        setBalance(balanceHex);
        setTxCount(parseInt(nonceHex, 16));
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
        <p className="muted">
          Recent transactions require an indexer. Use the search bar to load a specific transaction
          hash.
        </p>
      </section>
    </div>
  );
};

export default EvmAddressPage;
