import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { detectInputType } from '../data/detectInputType';
import { ChainConfig } from '../state/configStore';

interface SearchBarProps {
  activeChain: ChainConfig;
}

const SearchBar = ({ activeChain }: SearchBarProps) => {
  const [value, setValue] = useState('');
  const navigate = useNavigate();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const result = detectInputType(value);
    const prefix = `/chain/${activeChain.id}`;

    if (result.kind === 'evmBlock') {
      navigate(`${prefix}/evm/block/${result.value}`);
      return;
    }
    if (result.kind === 'evmTx') {
      navigate(`${prefix}/evm/tx/${result.value}`);
      return;
    }
    if (result.kind === 'evmAddress') {
      navigate(`${prefix}/evm/address/${result.value}`);
      return;
    }
    if (result.kind === 'solanaTx') {
      navigate(`${prefix}/solana/tx/${result.value}`);
      return;
    }
    if (result.kind === 'solanaAccount') {
      navigate(`${prefix}/solana/account/${result.value}`);
      return;
    }

    setValue('');
  };

  return (
    <form className="search-bar" onSubmit={onSubmit}>
      <input
        type="text"
        value={value}
        placeholder="Search by address / tx / block / slot"
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit">Search</button>
    </form>
  );
};

export default SearchBar;
