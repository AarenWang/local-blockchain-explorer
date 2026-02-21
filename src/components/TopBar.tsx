import { Link } from 'react-router-dom';
import { ChainConfig } from '../state/configStore';
import ChainPicker from './ChainPicker';
import SearchBar from './SearchBar';

interface TopBarProps {
  chains: ChainConfig[];
  activeChain?: ChainConfig;
  onSelectChain: (id: string) => void;
}

const TopBar = ({ chains, activeChain, onSelectChain }: TopBarProps) => {
  return (
    <header className="top-bar">
      <div className="top-bar__brand">
        <Link to="/config">Local Blockchain Explorer</Link>
      </div>
      <div className="top-bar__controls">
        <Link to="/wallet-manage" className="top-bar__link">
          Wallets
        </Link>
        <ChainPicker chains={chains} activeChain={activeChain} onSelectChain={onSelectChain} />
        {activeChain ? <SearchBar activeChain={activeChain} /> : null}
      </div>
    </header>
  );
};

export default TopBar;
