import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchJsonRpc } from '../data/rpc';
import { formatNumber, fromHexToEth } from '../data/format';
import { ChainConfig, useConfigStore } from '../state/configStore';
import KeyValueTable from '../components/KeyValueTable';
import TagManager from '../components/TagManager';

const TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

interface EvmTransaction {
  hash: string;
  blockNumber: string;
  from: string;
  to: string | null;
  value: string;
  gas: string;
  gasPrice: string;
  nonce: string;
}

interface EvmReceipt {
  status: string;
  gasUsed: string;
  logs: Array<{ address: string; data: string; topics: string[] }>;
}

interface Erc20TokenConfig {
  id: string;
  chain_id: string;
  symbol: string;
  name: string;
  address: string;
  decimals: number;
}

interface Tag {
  id: string;
  type: 'address' | 'tx';
  target: string;
  label: string;
  note?: string;
  color: string;
}

interface Erc20Transfer {
  tokenAddress: string;
  tokenSymbol?: string;
  from: string;
  to: string;
  value: string;
  valueFormatted: number;
}

const EvmTxPage = () => {
  const { chainId, hash } = useParams();
  const { chains } = useConfigStore();
  const chain = useMemo(
    () => chains.find((item) => item.id === chainId) as ChainConfig | undefined,
    [chains, chainId]
  );
  const [tx, setTx] = useState<EvmTransaction | null>(null);
  const [receipt, setReceipt] = useState<EvmReceipt | null>(null);
  const [erc20Tokens, setErc20Tokens] = useState<Erc20TokenConfig[]>([]);
  const [erc20Transfers, setErc20Transfers] = useState<Erc20Transfer[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState('');

  // Helper to get tag for an address
  const getAddressTag = (address: string): Tag | undefined => {
    return tags.find(t => t.type === 'address' && t.target.toLowerCase() === address.toLowerCase());
  };

  // Parse address from indexed topic (remove leading zeros)
  const parseAddressFromTopic = (topic: string): string => {
    return '0x' + topic.slice(26);
  };

  // Parse Transfer event from log
  const parseTransferEvent = (
    log: { address: string; data: string; topics: string[] },
    tokens: Erc20TokenConfig[]
  ): Erc20Transfer | null => {
    if (log.topics.length < 3 || log.topics[0] !== TRANSFER_EVENT_SIGNATURE) {
      return null;
    }

    const from = parseAddressFromTopic(log.topics[1]);
    const to = parseAddressFromTopic(log.topics[2]);
    const valueHex = log.data;

    // Find token info by address
    const token = tokens.find(t => t.address.toLowerCase() === log.address.toLowerCase());
    const decimals = token?.decimals ?? 18;
    const tokenSymbol = token?.symbol;

    // Convert hex value to number
    const value = BigInt(valueHex);
    const valueFormatted = Number(value) / Math.pow(10, decimals);

    return {
      tokenAddress: log.address,
      tokenSymbol,
      from,
      to,
      value: valueHex,
      valueFormatted
    };
  };

  useEffect(() => {
    const load = async () => {
      if (!chain || !hash) {
        return;
      }
      try {
        // Fetch transaction and receipt
        const result = await fetchJsonRpc<EvmTransaction>(chain.rpcUrl, 'eth_getTransactionByHash', [
          hash
        ]);
        const receiptResult = await fetchJsonRpc<EvmReceipt>(
          chain.rpcUrl,
          'eth_getTransactionReceipt',
          [hash]
        );
        setTx(result);
        setReceipt(receiptResult);

        // Fetch all tags
        const tagsResponse = await fetch('/api/tags');
        if (tagsResponse.ok) {
          const allTags = await tagsResponse.json() as Tag[];
          setTags(allTags);
        }

        // Fetch ERC20 tokens for this chain
        const tokensResponse = await fetch(`/api/erc20-tokens?chainId=${chain.id}`);
        if (tokensResponse.ok) {
          const tokens = await tokensResponse.json() as Erc20TokenConfig[];
          setErc20Tokens(tokens);

          // Parse ERC20 transfers from logs
          if (receiptResult?.logs) {
            const transfers: Erc20Transfer[] = [];
            for (const log of receiptResult.logs) {
              const transfer = parseTransferEvent(log, tokens);
              if (transfer) {
                transfers.push(transfer);
              }
            }
            setErc20Transfers(transfers);
          }
        }

        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load transaction');
      }
    };
    load();
  }, [chain, hash]);

  if (!chain) {
    return (
      <div className="page">
        <h1>Chain not found</h1>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h1>Error</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (!tx) {
    return (
      <div className="page">
        <p>Loading transaction...</p>
      </div>
    );
  }

  const rows = [
    { label: 'Hash', value: tx.hash, copy: tx.hash },
    {
      label: 'Status',
      value: receipt?.status ? (receipt.status === '0x1' ? 'Success' : 'Failed') : 'Pending'
    },
    {
      label: 'Block',
      value: tx.blockNumber ? (
        <Link to={`/chain/${chain.id}/evm/block/${parseInt(tx.blockNumber, 16)}`}>
          #{parseInt(tx.blockNumber, 16)}
        </Link>
      ) : (
        '-'
      )
    },
    {
      label: 'From',
      value: <Link to={`/chain/${chain.id}/evm/address/${tx.from}`}>{tx.from}</Link>,
      copy: tx.from
    },
    {
      label: 'To',
      value: tx.to ? (
        <Link to={`/chain/${chain.id}/evm/address/${tx.to}`}>{tx.to}</Link>
      ) : (
        'Contract Creation'
      ),
      copy: tx.to ?? undefined
    },
    { label: 'Value', value: `${fromHexToEth(tx.value)} ${chain.nativeTokenSymbol}` },
    { label: 'Gas Limit', value: formatNumber(parseInt(tx.gas, 16)) },
    { label: 'Gas Price', value: formatNumber(parseInt(tx.gasPrice, 16)) },
    { label: 'Gas Used', value: receipt ? formatNumber(parseInt(receipt.gasUsed, 16)) : '-' },
    { label: 'Nonce', value: parseInt(tx.nonce, 16) }
  ];

  // Format ERC20 transfer value for display
  const formatTransferValue = (transfer: Erc20Transfer): string => {
    if (transfer.valueFormatted < 0.0001 && transfer.valueFormatted > 0) {
      return `<0.0001 ${transfer.tokenSymbol ?? 'Token'}`;
    }
    return `${transfer.valueFormatted.toLocaleString()} ${transfer.tokenSymbol ?? 'Token'}`;
  };

  // Render address with tag
  const renderAddress = (address: string) => {
    const tag = getAddressTag(address);
    return (
      <div className="address-with-tag">
        <Link to={`/chain/${chain.id}/evm/address/${address}`} className="address-link">
          {address}
        </Link>
        {tag && (
          <span
            className="tag-badge"
            style={{
              backgroundColor: tag.color + '20',
              color: tag.color,
              border: `1px solid ${tag.color}40`,
              marginLeft: '8px',
              fontSize: '11px',
              padding: '2px 6px'
            }}
          >
            {tag.label}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Transaction</h1>
          <p>{chain.chainName}</p>
        </div>
        <TagManager type="tx" target={hash} />
      </div>

      <section className="card">
        <KeyValueTable rows={rows} />
      </section>

      {erc20Transfers.length > 0 && (
        <section className="card">
          <h2>ERC20 Transfers ({erc20Transfers.length})</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>From</th>
                <th>To</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {erc20Transfers.map((transfer, idx) => (
                <tr key={idx}>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontWeight: 500 }}>{transfer.tokenSymbol ?? 'Unknown'}</span>
                      <span className="mono" style={{ fontSize: '11px', color: '#9ca3af' }}>
                        {transfer.tokenAddress}
                      </span>
                    </div>
                  </td>
                  <td>{renderAddress(transfer.from)}</td>
                  <td>{renderAddress(transfer.to)}</td>
                  <td>{formatTransferValue(transfer)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <h2>Logs (Raw)</h2>
        <pre className="code-block">{JSON.stringify(receipt?.logs ?? [], null, 2)}</pre>
      </section>
    </div>
  );
};

export default EvmTxPage;
