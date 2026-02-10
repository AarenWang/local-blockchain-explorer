import { Navigate, Route, Routes } from 'react-router-dom';
import TopBar from './components/TopBar';
import ChainHomePage from './pages/ChainHomePage';
import ConfigPage from './pages/ConfigPage';
import EvmBlockPage from './pages/EvmBlockPage';
import EvmTxPage from './pages/EvmTxPage';
import EvmAddressPage from './pages/EvmAddressPage';
import SolanaSlotPage from './pages/SolanaSlotPage';
import SolanaTxPage from './pages/SolanaTxPage';
import SolanaAccountPage from './pages/SolanaAccountPage';
import { useConfigStore } from './state/configStore';

const App = () => {
  const { chains, activeChain, setActiveChain } = useConfigStore();

  return (
    <div className="app">
      <TopBar chains={chains} activeChain={activeChain} onSelectChain={setActiveChain} />
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/config" replace />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="/chain/:chainId/home" element={<ChainHomePage />} />
          <Route path="/chain/:chainId/evm/block/:number" element={<EvmBlockPage />} />
          <Route path="/chain/:chainId/evm/tx/:hash" element={<EvmTxPage />} />
          <Route path="/chain/:chainId/evm/address/:address" element={<EvmAddressPage />} />
          <Route path="/chain/:chainId/solana/slot/:slot" element={<SolanaSlotPage />} />
          <Route path="/chain/:chainId/solana/tx/:signature" element={<SolanaTxPage />} />
          <Route path="/chain/:chainId/solana/account/:address" element={<SolanaAccountPage />} />
          <Route path="*" element={<Navigate to="/config" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
