import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChainConfig, ChainType, Erc20TokenInfo, useConfigStore } from '../state/configStore';
import { fetchJsonRpc, measureRpc } from '../data/rpc';

const emptyDraft = (): ChainConfig => ({
  id: '',
  chainType: 'EVM',
  chainName: '',
  nativeTokenSymbol: '',
  rpcUrl: '',
  wsUrl: '',
  chainId: undefined,
  enabled: false,
  erc20Tokens: []
});

const ConfigPage = () => {
  const { chains, addChain, updateChain, deleteChain, setActiveChain, activeChain } = useConfigStore();
  const [draft, setDraft] = useState<ChainConfig | null>(null);
  const [status, setStatus] = useState<string>('');
  const [latency, setLatency] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [newTokenAddress, setNewTokenAddress] = useState('');
  const [loadingToken, setLoadingToken] = useState(false);

  const chainStatus = useMemo(() => {
    if (!activeChain) {
      return 'No active chain';
    }
    return `${activeChain.chainType} - ${activeChain.chainName}`;
  }, [activeChain]);

  const startAdd = () => {
    setDraft({ ...emptyDraft(), id: `chain-${Date.now()}` });
    setStatus('');
    setLatency(null);
    setNewTokenAddress('');
  };

  const startEdit = (chain: ChainConfig) => {
    setDraft({ ...chain, erc20Tokens: chain.erc20Tokens || [] });
    setStatus('');
    setLatency(null);
    setNewTokenAddress('');
  };

  const onSave = () => {
    if (!draft) {
      return;
    }
    setSaving(true);
    if (chains.some((chain) => chain.id === draft.id)) {
      updateChain(draft);
    } else {
      addChain(draft);
    }
    setDraft(null);
    setSaving(false);
  };

  const onTest = async () => {
    if (!draft) {
      return;
    }
    try {
      setStatus('Testing...');
      if (draft.chainType === 'EVM') {
        const { result, latencyMs } = await measureRpc(() =>
          fetchJsonRpc<string>(draft.rpcUrl, 'eth_chainId')
        );
        setLatency(latencyMs);
        setStatus(`Connected (chainId: ${parseInt(result, 16)})`);
      } else {
        const { result, latencyMs } = await measureRpc(() =>
          fetchJsonRpc<number>(draft.rpcUrl, 'getSlot')
        );
        setLatency(latencyMs);
        setStatus(`Connected (slot: ${result})`);
      }
    } catch (error) {
      setLatency(null);
      setStatus(error instanceof Error ? error.message : 'RPC error');
    }
  };

  const onFetchTokenInfo = async () => {
    if (!draft || !newTokenAddress || !draft.rpcUrl) {
      return;
    }

    // Check if token already exists
    if (draft.erc20Tokens?.some(t => t.address.toLowerCase() === newTokenAddress.toLowerCase())) {
      setStatus('Token already added');
      return;
    }

    setLoadingToken(true);
    setStatus('Fetching token info...');

    try {
      // Always use direct RPC call to fetch token info
      const tokenInfo = await fetchTokenInfoFromRpc(newTokenAddress, draft.rpcUrl);

      setDraft({
        ...draft,
        erc20Tokens: [
          ...(draft.erc20Tokens || []),
          {
            address: tokenInfo.address,
            symbol: tokenInfo.symbol,
            decimals: tokenInfo.decimals
          }
        ]
      });
      setNewTokenAddress('');
      setStatus(`Added ${tokenInfo.symbol} token`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to fetch token info');
    } finally {
      setLoadingToken(false);
    }
  };

  const fetchTokenInfoFromRpc = async (tokenAddress: string, rpcUrl: string) => {
    // ERC20 ABI for symbol and decimals
    const abi = [
      {
        constant: true,
        inputs: [],
        name: 'decimals',
        outputs: [{ name: '', type: 'uint8' }],
        type: 'function'
      },
      {
        constant: true,
        inputs: [],
        name: 'symbol',
        outputs: [{ name: '', type: 'string' }],
        type: 'function'
      }
    ];

    // Call symbol()
    const symbolCall = {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [
        {
          to: tokenAddress,
          data: '0x95d89b41' // symbol() selector
        },
        'latest'
      ]
    };

    // Call decimals()
    const decimalsCall = {
      jsonrpc: '2.0',
      id: 2,
      method: 'eth_call',
      params: [
        {
          to: tokenAddress,
          data: '0x313ce567' // decimals() selector
        },
        'latest'
      ]
    };

    const [symbolResult, decimalsResult] = await Promise.all([
      fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(symbolCall)
      }),
      fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decimalsCall)
      })
    ]);

    const symbolData = await symbolResult.json();
    const decimalsData = await decimalsResult.json();

    if (symbolData.error) throw new Error('Failed to fetch symbol');
    if (decimalsData.error) throw new Error('Failed to fetch decimals');

    // Decode symbol (string)
    const symbolHex = symbolData.result;
    const symbol = symbolHex === '0x' ? '' : decodeHexString(symbolHex);

    // Decode decimals (uint8)
    const decimalsHex = decimalsData.result;
    const decimals = parseInt(decimalsHex, 16);

    return {
      address: tokenAddress,
      symbol,
      decimals
    };
  };

  const decodeHexString = (hex: string): string => {
    // Remove 0x prefix
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;

    // First 64 chars (32 bytes) is the offset, next 64 chars is the length
    const lengthHex = cleanHex.slice(64, 128);
    const length = parseInt(lengthHex, 16);

    // The actual string data starts at the offset
    const dataStart = 64 + 64; // Skip offset and length
    const dataEnd = dataStart + (length * 2);
    const stringHex = cleanHex.slice(dataStart, dataEnd);

    // Convert hex to string
    let result = '';
    for (let i = 0; i < stringHex.length; i += 2) {
      result += String.fromCharCode(parseInt(stringHex.substr(i, 2), 16));
    }
    return result;
  };

  const removeToken = (index: number) => {
    if (!draft) return;
    setDraft({
      ...draft,
      erc20Tokens: draft.erc20Tokens?.filter((_, i) => i !== index) || []
    });
  };

  const updateDraft = <K extends keyof ChainConfig>(key: K, value: ChainConfig[K]) => {
    if (!draft) {
      return;
    }
    setDraft({ ...draft, [key]: value });
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Chain Configuration</h1>
          <p>Manage local RPC endpoints and switch active chains.</p>
        </div>
        <button type="button" className="primary" onClick={startAdd}>
          + Add Chain
        </button>
      </div>

      <section className="card">
        <h2>Chains</h2>
        <div className="chain-list">
          {chains.map((chain) => (
            <div key={chain.id} className={`chain-item ${chain.enabled ? 'active' : ''}`}>
              <div>
                <strong>
                  {chain.chainType} - {chain.chainName}
                </strong>
                <div className="chain-meta">RPC: {chain.rpcUrl}</div>
                <div className="chain-meta">
                  Native Token: {chain.nativeTokenSymbol}
                  {chain.chainId ? ` · ChainId: ${chain.chainId}` : ''}
                </div>
                {chain.erc20Tokens && chain.erc20Tokens.length > 0 ? (
                  <div className="chain-meta">
                    ERC20 Tokens: {chain.erc20Tokens.map(t => t.symbol || t.address.slice(0, 8)).join(', ')}
                  </div>
                ) : null}
              </div>
              <div className="chain-actions">
                <Link to={`/chain/${chain.id}/home`}>
                  <button type="button">Go</button>
                </Link>
                <button type="button" onClick={() => setActiveChain(chain.id)}>
                  {chain.enabled ? 'Active' : 'Activate'}
                </button>
                <button type="button" onClick={() => startEdit(chain)}>
                  Edit
                </button>
                <button type="button" className="danger" onClick={() => deleteChain(chain.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Status</h2>
        <p>Active chain: {chainStatus}</p>
        <p>{latency ? `RPC Latency: ${latency}ms` : 'RPC Latency: -'}</p>
      </section>

      {draft ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{chains.some((chain) => chain.id === draft.id) ? 'Edit Chain' : 'Add Chain'}</h3>
            <div className="form-grid">
              <label>
                Chain Type
                <select
                  value={draft.chainType}
                  onChange={(event) => updateDraft('chainType', event.target.value as ChainType)}
                >
                  <option value="EVM">EVM</option>
                  <option value="SOLANA">Solana</option>
                </select>
              </label>
              <label>
                Chain Name
                <input
                  value={draft.chainName}
                  onChange={(event) => updateDraft('chainName', event.target.value)}
                />
              </label>
              <label>
                RPC URL
                <input
                  value={draft.rpcUrl}
                  onChange={(event) => updateDraft('rpcUrl', event.target.value)}
                />
              </label>
              <label>
                WS URL (optional)
                <input
                  value={draft.wsUrl ?? ''}
                  onChange={(event) => updateDraft('wsUrl', event.target.value)}
                />
              </label>
              <label>
                Native Token
                <input
                  value={draft.nativeTokenSymbol}
                  onChange={(event) => updateDraft('nativeTokenSymbol', event.target.value)}
                />
              </label>
              {draft.chainType === 'EVM' ? (
                <label>
                  ChainId
                  <input
                    type="number"
                    value={draft.chainId ?? ''}
                    onChange={(event) =>
                      updateDraft('chainId', event.target.value ? Number(event.target.value) : undefined)
                    }
                  />
                </label>
              ) : null}
            </div>

            {draft.chainType === 'EVM' ? (
              <div className="erc20-section">
                <h4>ERC20 Tokens</h4>
                <div className="token-list">
                  {draft.erc20Tokens?.map((token, index) => (
                    <div key={index} className="token-item">
                      <span>
                        <strong>{token.symbol || 'Unknown'}</strong>
                        <span className="token-address">{token.address}</span>
                        {token.decimals !== undefined && <span className="token-decimals">({token.decimals} decimals)</span>}
                      </span>
                      <button
                        type="button"
                        className="danger small"
                        onClick={() => removeToken(index)}
                      >
                        Remove
                      </button>
                    </div>
                  )) || <p className="muted">No ERC20 tokens configured.</p>}
                </div>
                <div className="add-token-form">
                  <input
                    type="text"
                    placeholder="Token address (0x...)"
                    value={newTokenAddress}
                    onChange={(e) => setNewTokenAddress(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={onFetchTokenInfo}
                    disabled={loadingToken || !newTokenAddress}
                  >
                    {loadingToken ? 'Fetching...' : 'Add Token'}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="modal-status">
              {status ? <p>{status}</p> : null}
              {latency ? <p>Latency: {latency}ms</p> : null}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={onTest}>
                Test Connection
              </button>
              <div className="modal-actions__right">
                <button type="button" onClick={() => setDraft(null)}>
                  Cancel
                </button>
                <button type="button" className="primary" disabled={saving} onClick={onSave}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ConfigPage;
