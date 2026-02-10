import { ChainConfig } from '../state/configStore';

interface ChainPickerProps {
  chains: ChainConfig[];
  activeChain?: ChainConfig;
  onSelectChain: (id: string) => void;
}

const ChainPicker = ({ chains, activeChain, onSelectChain }: ChainPickerProps) => {
  return (
    <label className="chain-picker">
      <span>Chain</span>
      <select
        value={activeChain?.id ?? ''}
        onChange={(event) => onSelectChain(event.target.value)}
      >
        {chains.map((chain) => (
          <option key={chain.id} value={chain.id}>
            {chain.chainType} - {chain.chainName}
          </option>
        ))}
      </select>
    </label>
  );
};

export default ChainPicker;
