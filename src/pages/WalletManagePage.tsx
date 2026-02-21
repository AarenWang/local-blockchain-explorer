import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';

interface Role {
  id: string;
  name: string;
  derivationPath: string;
  createdAt: number;
}

interface Erc20Token {
  id: string;
  chain_id: string;
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  created_at: number;
}

interface Chain {
  id: string;
  type: 'EVM' | 'SOLANA';
  name: string;
  rpcUrl: string;
}

const API_BASE = 'http://localhost:7070';

const WalletManagePage = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [tokens, setTokens] = useState<Erc20Token[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [editingToken, setEditingToken] = useState<Erc20Token | null>(null);

  // Role form state
  const [roleName, setRoleName] = useState('');
  const [roleMnemonic, setRoleMnemonic] = useState('');
  const [roleDerivationPath, setRoleDerivationPath] = useState("m/44'/60'/0'/0");

  // Token form state
  const [tokenChainId, setTokenChainId] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [tokenDecimals, setTokenDecimals] = useState(18);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [rolesRes, tokensRes, chainsRes] = await Promise.all([
        fetch(`${API_BASE}/roles`),
        fetch(`${API_BASE}/erc20-tokens`),
        fetch(`${API_BASE}/chains`)
      ]);
      setRoles(await rolesRes.json());
      setTokens(await tokensRes.json());
      setChains(await chainsRes.json());
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRole = async () => {
    if (!roleName || !roleMnemonic) {
      alert('Please fill in all required fields');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roleName,
          mnemonic: roleMnemonic,
          derivationPath: roleDerivationPath
        })
      });
      if (res.ok) {
        setShowRoleModal(false);
        setRoleName('');
        setRoleMnemonic('');
        fetchData();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to create role');
      }
    } catch (error) {
      alert('Failed to create role: ' + error);
    }
  };

  const handleDeleteRole = async (id: string) => {
    if (!confirm('Are you sure you want to delete this role?')) return;
    try {
      await fetch(`${API_BASE}/roles/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (error) {
      alert('Failed to delete role');
    }
  };

  const handleSaveToken = async () => {
    if (!tokenChainId || !tokenSymbol || !tokenName || !tokenAddress) {
      alert('Please fill in all required fields');
      return;
    }
    try {
      const url = editingToken
        ? `${API_BASE}/erc20-tokens/${editingToken.id}`
        : `${API_BASE}/erc20-tokens`;
      const method = editingToken ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: tokenChainId,
          symbol: tokenSymbol,
          name: tokenName,
          address: tokenAddress,
          decimals: tokenDecimals
        })
      });
      if (res.ok) {
        setShowTokenModal(false);
        setEditingToken(null);
        resetTokenForm();
        fetchData();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to save token');
      }
    } catch (error) {
      alert('Failed to save token: ' + error);
    }
  };

  const handleDeleteToken = async (id: string) => {
    if (!confirm('Are you sure you want to delete this token?')) return;
    try {
      await fetch(`${API_BASE}/erc20-tokens/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (error) {
      alert('Failed to delete token');
    }
  };

  const resetTokenForm = () => {
    setTokenChainId('');
    setTokenSymbol('');
    setTokenName('');
    setTokenAddress('');
    setTokenDecimals(18);
  };

  const openTokenModal = (token?: Erc20Token) => {
    if (token) {
      setEditingToken(token);
      setTokenChainId(token.chain_id);
      setTokenSymbol(token.symbol);
      setTokenName(token.name);
      setTokenAddress(token.address);
      setTokenDecimals(token.decimals);
    } else {
      setEditingToken(null);
      resetTokenForm();
    }
    setShowTokenModal(true);
  };

  const evmChains = useMemo(() => chains.filter(c => c.type === 'EVM'), [chains]);
  const tokensByChain = useMemo(() => {
    const grouped: Record<string, Erc20Token[]> = {};
    tokens.forEach(token => {
      if (!grouped[token.chain_id]) grouped[token.chain_id] = [];
      grouped[token.chain_id].push(token);
    });
    return grouped;
  }, [tokens]);

  if (loading) {
    return <div className="page">Loading...</div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Wallet Management</h1>
          <p>Manage mnemonic roles and ERC20 token configurations</p>
        </div>
      </div>

      {/* Roles Section */}
      <section className="card">
        <div className="page-header">
          <h2>Roles</h2>
          <button type="button" className="primary" onClick={() => setShowRoleModal(true)}>
            + Add Role
          </button>
        </div>
        <div className="chain-list">
          {roles.map((role) => (
            <div key={role.id} className="chain-item">
              <div>
                <strong>{role.name}</strong>
                <div className="chain-meta">Derivation Path: {role.derivationPath}</div>
                <div className="chain-meta">
                  Created: {new Date(role.createdAt * 1000).toLocaleString()}
                </div>
              </div>
              <div className="chain-actions">
                <Link to={`/wallets/${role.id}`}>
                  <button type="button">View Wallets</button>
                </Link>
                <button type="button" className="danger" onClick={() => handleDeleteRole(role.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
          {roles.length === 0 && (
            <p style={{ padding: '20px', color: '#888' }}>No roles configured yet.</p>
          )}
        </div>
      </section>

      {/* ERC20 Tokens Section */}
      <section className="card">
        <div className="page-header">
          <h2>ERC20 Tokens</h2>
          <button type="button" className="primary" onClick={() => openTokenModal()}>
            + Add Token
          </button>
        </div>
        {Object.entries(tokensByChain).map(([chainId, chainTokens]) => {
          const chain = chains.find(c => c.id === chainId);
          return (
            <div key={chainId} style={{ marginBottom: '20px' }}>
              <h4 style={{ marginBottom: '10px' }}>{chain?.name || chainId}</h4>
              <div className="chain-list">
                {chainTokens.map((token) => (
                  <div key={token.id} className="chain-item">
                    <div>
                      <strong>{token.symbol}</strong>
                      <div className="chain-meta">{token.name}</div>
                      <div className="chain-meta">Address: {token.address}</div>
                      <div className="chain-meta">Decimals: {token.decimals}</div>
                    </div>
                    <div className="chain-actions">
                      <button type="button" onClick={() => openTokenModal(token)}>
                        Edit
                      </button>
                      <button type="button" className="danger" onClick={() => handleDeleteToken(token.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {tokens.length === 0 && (
          <p style={{ padding: '20px', color: '#888' }}>No ERC20 tokens configured yet.</p>
        )}
      </section>

      {/* Add Role Modal */}
      {showRoleModal ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Add New Role</h3>
            <div className="form-grid">
              <label>
                Role Name *
                <input value={roleName} onChange={(e) => setRoleName(e.target.value)} />
              </label>
              <label>
                Mnemonic Phrase *
                <textarea
                  rows={3}
                  value={roleMnemonic}
                  onChange={(e) => setRoleMnemonic(e.target.value)}
                  placeholder="word1 word2 word3 ..."
                />
              </label>
              <label>
                Derivation Path
                <input
                  value={roleDerivationPath}
                  onChange={(e) => setRoleDerivationPath(e.target.value)}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setShowRoleModal(false)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={handleCreateRole}>
                Create Role
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Add/Edit Token Modal */}
      {showTokenModal ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{editingToken ? 'Edit Token' : 'Add New Token'}</h3>
            <div className="form-grid">
              <label>
                Chain *
                <select value={tokenChainId} onChange={(e) => setTokenChainId(e.target.value)}>
                  <option value="">Select a chain</option>
                  {evmChains.map((chain) => (
                    <option key={chain.id} value={chain.id}>
                      {chain.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Symbol *
                <input
                  value={tokenSymbol}
                  onChange={(e) => setTokenSymbol(e.target.value)}
                  placeholder="e.g. USDT"
                />
              </label>
              <label>
                Name *
                <input
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="e.g. Tether USD"
                />
              </label>
              <label>
                Contract Address *
                <input
                  value={tokenAddress}
                  onChange={(e) => setTokenAddress(e.target.value)}
                  placeholder="0x..."
                />
              </label>
              <label>
                Decimals *
                <input
                  type="number"
                  value={tokenDecimals}
                  onChange={(e) => setTokenDecimals(Number(e.target.value))}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setShowTokenModal(false)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={handleSaveToken}>
                {editingToken ? 'Save' : 'Add'} Token
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default WalletManagePage;
