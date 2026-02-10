import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchJsonRpc } from '../data/rpc';
import { ChainConfig, useConfigStore } from '../state/configStore';
import KeyValueTable from '../components/KeyValueTable';

interface AccountInfoResult {
  value: {
    lamports: number;
    owner: string;
    rentEpoch: number;
    data: [string, string];
  } | null;
}

const SolanaAccountPage = () => {
  const { chainId, address } = useParams();
  const { chains } = useConfigStore();
  const chain = useMemo(
    () => chains.find((item) => item.id === chainId) as ChainConfig | undefined,
    [chains, chainId]
  );
  const [balance, setBalance] = useState<number | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfoResult['value'] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!chain || !address) {
        return;
      }
      try {
        const balanceResult = await fetchJsonRpc<{ value: number }>(chain.rpcUrl, 'getBalance', [
          address
        ]);
        const infoResult = await fetchJsonRpc<AccountInfoResult>(
          chain.rpcUrl,
          'getAccountInfo',
          [address, { encoding: 'base64' }]
        );
        setBalance(balanceResult.value);
        setAccountInfo(infoResult.value);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load account');
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
    { label: 'Account', value: address, copy: address },
    { label: 'Balance', value: balance !== null ? `${balance} lamports` : '-' },
    { label: 'Owner', value: accountInfo?.owner ?? '-', copy: accountInfo?.owner ?? undefined },
    { label: 'Rent Epoch', value: accountInfo?.rentEpoch ?? '-' }
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Account</h1>
          <p>{chain.chainName}</p>
        </div>
      </div>

      <section className="card">
        <KeyValueTable rows={rows} />
      </section>

      <section className="card">
        <h2>Data (Base64)</h2>
        <pre className="code-block">{accountInfo?.data?.[0] ?? '-'}</pre>
      </section>
    </div>
  );
};

export default SolanaAccountPage;
