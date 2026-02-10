import { useCallback, useMemo, useState } from 'react';

export type ChainType = 'EVM' | 'SOLANA';

export interface ChainConfig {
  id: string;
  chainType: ChainType;
  chainName: string;
  nativeTokenSymbol: string;
  rpcUrl: string;
  wsUrl?: string;
  chainId?: number;
  enabled: boolean;
}

const STORAGE_KEY = 'local-blockchain-explorer-config';

const defaultChains: ChainConfig[] = [
  {
    id: 'anvil',
    chainType: 'EVM',
    chainName: 'Anvil Local',
    nativeTokenSymbol: 'GO',
    rpcUrl: 'http://localhost:8545',
    chainId: 31337,
    enabled: true
  },
  {
    id: 'solana-local',
    chainType: 'SOLANA',
    chainName: 'Solana Local',
    nativeTokenSymbol: 'SOL',
    rpcUrl: 'http://localhost:8899',
    enabled: false
  }
];

const loadConfigs = (): ChainConfig[] => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultChains;
  }
  try {
    const parsed = JSON.parse(raw) as ChainConfig[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return defaultChains;
    }
    return parsed;
  } catch {
    return defaultChains;
  }
};

const persistConfigs = (configs: ChainConfig[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
};

export const useConfigStore = () => {
  const [chains, setChains] = useState<ChainConfig[]>(() => loadConfigs());

  const activeChain = useMemo(
    () => chains.find((chain) => chain.enabled) ?? chains[0],
    [chains]
  );

  const updateChains = useCallback((updater: (current: ChainConfig[]) => ChainConfig[]) => {
    setChains((current) => {
      const next = updater(current);
      persistConfigs(next);
      return next;
    });
  }, []);

  const addChain = useCallback(
    (chain: ChainConfig) =>
      updateChains((current) => {
        const next = [...current, chain];
        return next;
      }),
    [updateChains]
  );

  const updateChain = useCallback(
    (chain: ChainConfig) =>
      updateChains((current) =>
        current.map((item) => (item.id === chain.id ? chain : item))
      ),
    [updateChains]
  );

  const deleteChain = useCallback(
    (id: string) =>
      updateChains((current) => {
        const next = current.filter((item) => item.id !== id);
        if (!next.some((item) => item.enabled) && next.length > 0) {
          next[0].enabled = true;
        }
        return next;
      }),
    [updateChains]
  );

  const setActiveChain = useCallback(
    (id: string) =>
      updateChains((current) =>
        current.map((item) => ({
          ...item,
          enabled: item.id === id
        }))
      ),
    [updateChains]
  );

  return {
    chains,
    activeChain,
    addChain,
    updateChain,
    deleteChain,
    setActiveChain
  };
};
