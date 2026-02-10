import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ChainConfig, useConfigStore } from '../state/configStore';
import EvmHomePage from './EvmHomePage';
import SolanaHomePage from './SolanaHomePage';

const ChainHomePage = () => {
  const { chainId } = useParams();
  const { chains } = useConfigStore();
  const chain = useMemo(
    () => chains.find((item) => item.id === chainId) as ChainConfig | undefined,
    [chains, chainId]
  );
  if (!chain) {
    return (
      <div className="page">
        <h1>Chain not found</h1>
        <p>Please select or add a chain configuration.</p>
      </div>
    );
  }

  if (chain.chainType === 'EVM') {
    return <EvmHomePage chain={chain} />;
  }

  if (chain.chainType === 'SOLANA') {
    return <SolanaHomePage chain={chain} />;
  }

  return (
    <div className="page">
      <h1>Unsupported chain</h1>
      <p>Please configure a supported chain type.</p>
    </div>
  );
};

export default ChainHomePage;
