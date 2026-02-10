import { useMemo, useState } from 'react';
import { ChainConfig, ChainType, useConfigStore } from '../state/configStore';
import { fetchJsonRpc, measureRpc } from '../data/rpc';

const emptyDraft = (): ChainConfig => ({
  id: '',
  chainType: 'EVM',
  chainName: '',
  nativeTokenSymbol: '',
  rpcUrl: '',
  wsUrl: '',
  chainId: undefined,
  enabled: false
});

const ConfigPage = () => {
  const { chains, addChain, updateChain, deleteChain, setActiveChain, activeChain } = useConfigStore();
  const [draft, setDraft] = useState<ChainConfig | null>(null);
  const [status, setStatus] = useState<string>('');
  const [latency, setLatency] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

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
  };

  const startEdit = (chain: ChainConfig) => {
    setDraft({ ...chain });
    setStatus('');
    setLatency(null);
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
              </div>
              <div className="chain-actions">
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
