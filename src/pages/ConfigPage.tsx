import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChainConfig, ChainType, Erc20TokenInfo, SplTokenInfo, useConfigStore } from '../state/configStore';
import { fetchJsonRpc, measureRpc } from '../data/rpc';
import { truncateMiddle } from '../data/format';

const emptyDraft = (): ChainConfig => ({
  id: '',
  chainType: 'EVM',
  chainName: '',
  nativeTokenSymbol: '',
  rpcUrl: '',
  wsUrl: '',
  chainId: undefined,
  enabled: false,
  erc20Tokens: [],
  splTokens: []
});

interface Tag {
  id: string;
  type: 'address' | 'tx';
  target: string;
  label: string;
  note?: string;
  color: string;
}

const ConfigPage = () => {
  const { chains, addChain, updateChain, deleteChain, setActiveChain, activeChain } = useConfigStore();
  const [draft, setDraft] = useState<ChainConfig | null>(null);
  const [status, setStatus] = useState<string>('');
  const [latency, setLatency] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [newTokenAddress, setNewTokenAddress] = useState('');
  const [loadingToken, setLoadingToken] = useState(false);

  // Tags modal state
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<ChainConfig | null>(null);
  const [deleteInput, setDeleteInput] = useState('');

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
    setDraft({
      ...chain,
      erc20Tokens: chain.erc20Tokens || [],
      splTokens: chain.splTokens || []
    });
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

  // Add ERC20 Token (EVM)
  const onFetchErc20TokenInfo = async () => {
    if (!draft || !newTokenAddress || !draft.rpcUrl) {
      return;
    }

    if (draft.erc20Tokens?.some(t => t.address.toLowerCase() === newTokenAddress.toLowerCase())) {
      setStatus('Token already added');
      return;
    }

    setLoadingToken(true);
    setStatus('Fetching token info...');

    try {
      const tokenInfo = await fetchErc20TokenInfoFromRpc(newTokenAddress, draft.rpcUrl);

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

  // Add SPL Token (Solana)
  const onFetchSplTokenInfo = async () => {
    if (!draft || !newTokenAddress || !draft.rpcUrl) {
      return;
    }

    if (draft.splTokens?.some(t => t.mint.toLowerCase() === newTokenAddress.toLowerCase())) {
      setStatus('Token already added');
      return;
    }

    setLoadingToken(true);
    setStatus('Fetching token info...');

    try {
      const tokenInfo = await fetchSplTokenInfoFromRpc(newTokenAddress, draft.rpcUrl);

      setDraft({
        ...draft,
        splTokens: [
          ...(draft.splTokens || []),
          {
            mint: tokenInfo.mint,
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

  const fetchErc20TokenInfoFromRpc = async (tokenAddress: string, rpcUrl: string) => {
    const symbolCall = {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [
        { to: tokenAddress, data: '0x95d89b41' }, // symbol() selector
        'latest'
      ]
    };

    const decimalsCall = {
      jsonrpc: '2.0',
      id: 2,
      method: 'eth_call',
      params: [
        { to: tokenAddress, data: '0x313ce567' }, // decimals() selector
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

    const symbolHex = symbolData.result;
    const symbol = symbolHex === '0x' ? '' : decodeHexString(symbolHex);

    const decimalsHex = decimalsData.result;
    const decimals = parseInt(decimalsHex, 16);

    return {
      address: tokenAddress,
      symbol,
      decimals
    };
  };

  const fetchSplTokenInfoFromRpc = async (mintAddress: string, rpcUrl: string) => {
    // First, try to get token info from Jupiter token list
    let symbol = mintAddress.slice(0, 8); // Default fallback
    let decimals = 0;

    try {
      // Try Jupiter token list API
      const tokenListResponse = await fetch('https://token.jup.ag/all');
      if (tokenListResponse.ok) {
        const tokenList = await tokenListResponse.json();
        const tokenInfo = tokenList.find((t: any) =>
          t.address.toLowerCase() === mintAddress.toLowerCase() ||
          t.address === mintAddress
        );
        if (tokenInfo) {
          symbol = tokenInfo.symbol;
          decimals = tokenInfo.decimals;
        }
      }
    } catch (err) {
      console.log('Failed to fetch from token list, using RPC');
    }

    // If not found in token list, fetch from RPC to get decimals
    if (decimals === 0) {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAccountInfo',
          params: [
            mintAddress,
            { encoding: 'jsonParsed' }
          ]
        })
      });

      const data = await response.json();

      if (data.result?.value?.data) {
        const parsedData = data.result.value.data;
        decimals = parsedData?.parsed?.info?.decimals || 0;
      }
    }

    return {
      mint: mintAddress,
      symbol,
      decimals
    };
  };

  const decodeHexString = (hex: string): string => {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const lengthHex = cleanHex.slice(64, 128);
    const length = parseInt(lengthHex, 16);
    const dataStart = 64 + 64;
    const dataEnd = dataStart + (length * 2);
    const stringHex = cleanHex.slice(dataStart, dataEnd);
    let result = '';
    for (let i = 0; i < stringHex.length; i += 2) {
      result += String.fromCharCode(parseInt(stringHex.substr(i, 2), 16));
    }
    return result;
  };

  const removeErc20Token = (index: number) => {
    if (!draft) return;
    setDraft({
      ...draft,
      erc20Tokens: draft.erc20Tokens?.filter((_, i) => i !== index) || []
    });
  };

  const removeSplToken = (index: number) => {
    if (!draft) return;
    setDraft({
      ...draft,
      splTokens: draft.splTokens?.filter((_, i) => i !== index) || []
    });
  };

  const updateDraft = <K extends keyof ChainConfig>(key: K, value: ChainConfig[K]) => {
    if (!draft) {
      return;
    }
    setDraft({ ...draft, [key]: value });
  };

  // Load all tags
  const loadTags = async () => {
    setLoadingTags(true);
    try {
      const apiBase = import.meta.env.VITE_INDEXER_API ?? 'http://localhost:7070';
      const response = await fetch(`${apiBase}/tags`);
      if (response.ok) {
        const data = await response.json();
        setTags(data);
      }
    } catch (err) {
      console.error('Failed to load tags:', err);
    } finally {
      setLoadingTags(false);
    }
  };

  const openTagsModal = () => {
    loadTags();
    setShowTagsModal(true);
  };

  // Delete chain with confirmation
  const initiateDelete = (chain: ChainConfig) => {
    setDeleteConfirm(chain);
    setDeleteInput('');
  };

  const confirmDelete = () => {
    if (deleteConfirm && deleteInput === 'DELETE') {
      deleteChain(deleteConfirm.id);
      setDeleteConfirm(null);
      setDeleteInput('');
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Chain Configuration</h1>
          <p>Manage local RPC endpoints and switch active chains.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button type="button" onClick={openTagsModal}>
            View Tags
          </button>
          <button type="button" className="primary" onClick={startAdd}>
            + Add Chain
          </button>
        </div>
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
                {chain.splTokens && chain.splTokens.length > 0 ? (
                  <div className="chain-meta">
                    SPL Tokens: {chain.splTokens.map(t => t.symbol || t.mint.slice(0, 8)).join(', ')}
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
                <button type="button" className="danger" onClick={() => initiateDelete(chain)}>
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

      {/* Edit/Add Chain Modal */}
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

            {/* ERC20 Tokens for EVM */}
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
                        onClick={() => removeErc20Token(index)}
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
                    onClick={onFetchErc20TokenInfo}
                    disabled={loadingToken || !newTokenAddress}
                  >
                    {loadingToken ? 'Fetching...' : 'Add Token'}
                  </button>
                </div>
              </div>
            ) : null}

            {/* SPL Tokens for Solana */}
            {draft.chainType === 'SOLANA' ? (
              <div className="erc20-section">
                <h4>SPL Tokens</h4>
                <div className="token-list">
                  {draft.splTokens?.map((token, index) => (
                    <div key={index} className="token-item">
                      <span>
                        <strong>{token.symbol || 'Unknown'}</strong>
                        <span className="token-address">{token.mint}</span>
                        {token.decimals !== undefined && <span className="token-decimals">({token.decimals} decimals)</span>}
                      </span>
                      <button
                        type="button"
                        className="danger small"
                        onClick={() => removeSplToken(index)}
                      >
                        Remove
                      </button>
                    </div>
                  )) || <p className="muted">No SPL tokens configured.</p>}
                </div>
                <div className="add-token-form">
                  <input
                    type="text"
                    placeholder="Token mint address"
                    value={newTokenAddress}
                    onChange={(e) => setNewTokenAddress(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={onFetchSplTokenInfo}
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

      {/* Tags List Modal */}
      {showTagsModal ? (
        <div className="modal-overlay">
          <div className="modal" style={{ width: 'min(800px, 92vw)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>All Tags</h3>
              <button type="button" onClick={() => setShowTagsModal(false)}>✕</button>
            </div>

            {loadingTags ? (
              <p className="muted">Loading tags...</p>
            ) : tags.length === 0 ? (
              <p className="muted">No tags found.</p>
            ) : (
              <div className="tags-list">
                {tags.map((tag) => (
                  <div key={tag.id} className="tag-list-item">
                    <span
                      className="tag-badge"
                      style={{ backgroundColor: tag.color + '20', color: tag.color, border: `1px solid ${tag.color}40` }}
                    >
                      {tag.label}
                    </span>
                    <span className="tag-type">{tag.type}</span>
                    <span className="tag-target mono">{truncateMiddle(tag.target)}</span>
                    {tag.note && <span className="tag-note">{tag.note}</span>}
                    <a
                      href={tag.type === 'address'
                        ? `/chain/anvil/evm/address/${tag.target}`
                        : `/chain/anvil/evm/tx/${tag.target}`}
                      onClick={() => setShowTagsModal(false)}
                      className="tag-link"
                    >
                      View
                    </a>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <div className="modal-actions__right">
                <button type="button" onClick={() => setShowTagsModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete Confirmation Modal */}
      {deleteConfirm ? (
        <div className="modal-overlay">
          <div className="modal" style={{ width: '400px' }}>
            <h3>Confirm Delete</h3>
            <p>
              Are you sure you want to delete <strong>{deleteConfirm.chainName}</strong>?
            </p>
            <p className="muted">This action cannot be undone.</p>

            <label>
              Type <code>DELETE</code> to confirm:
              <input
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                placeholder="DELETE"
              />
            </label>

            <div className="modal-actions__right" style={{ justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirm(null);
                  setDeleteInput('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                onClick={confirmDelete}
                disabled={deleteInput !== 'DELETE'}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ConfigPage;
