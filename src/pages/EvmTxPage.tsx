import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiUrl } from '../api';
import { fetchJsonRpc } from '../data/rpc';
import { formatNumber, fromHexToEth } from '../data/format';
import { ChainConfig, useConfigStore } from '../state/configStore';
import KeyValueTable from '../components/KeyValueTable';
import TagManager from '../components/TagManager';
import DecodedTxView from '../components/DecodedTxView';
import { getAbiRegistry } from '../data/abiRegistry';
import { decodeTransaction } from '../data/abiDecoder';
import { DecodedTransaction } from '../data/abi/types';

const TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

interface EvmTransaction {
  hash: string;
  blockNumber: string | null;
  from: string;
  to: string | null;
  value: string;
  gas?: string | null;
  gasPrice: string;
  nonce?: string | null;
  input?: string | null;
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
  to: string | null;
  value: string;
  valueFormatted: number;
}

interface IndexedEvmTx {
  chain_id: string;
  hash: string;
  block_number: number;
  from_addr: string;
  to_addr: string | null;
  value_wei: string;
  gas_price: string;
  gas_used: string | null;
  status: number | null;
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
  const [decodedTx, setDecodedTx] = useState<DecodedTransaction | null>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [txSource, setTxSource] = useState<'rpc' | 'indexer'>('rpc');

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

      setTx(null);
      setReceipt(null);
      setDecodedTx(null);
      setErc20Transfers([]);
      setError('');

      try {
        const rpcTx = await fetchJsonRpc<EvmTransaction | null>(chain.rpcUrl, 'eth_getTransactionByHash', [
          hash
        ]);

        let resolvedTx: EvmTransaction | null = rpcTx;
        let receiptResult: EvmReceipt | null = null;
        let source: 'rpc' | 'indexer' = 'rpc';

        if (rpcTx) {
          receiptResult = await fetchJsonRpc<EvmReceipt | null>(
            chain.rpcUrl,
            'eth_getTransactionReceipt',
            [hash]
          );
        } else {
          const indexedTxResponse = await fetch(apiUrl(`/chain/${chain.id}/evm/tx/${hash}`));
          if (indexedTxResponse.ok) {
            const indexedTx = await indexedTxResponse.json() as IndexedEvmTx;
            resolvedTx = {
              hash: indexedTx.hash,
              blockNumber: `0x${indexedTx.block_number.toString(16)}`,
              from: indexedTx.from_addr,
              to: indexedTx.to_addr,
              value: indexedTx.value_wei,
              gas: null,
              gasPrice: indexedTx.gas_price,
              nonce: null,
              input: null
            };
            receiptResult = indexedTx.status === null && !indexedTx.gas_used
              ? null
              : {
                  status: indexedTx.status === null ? '0x0' : `0x${indexedTx.status.toString(16)}`,
                  gasUsed: indexedTx.gas_used ?? '0x0',
                  logs: []
                };
            source = 'indexer';
          }
        }

        if (!resolvedTx) {
          throw new Error('Transaction not found on the current RPC or local indexer');
        }

        setTx(resolvedTx);
        setReceipt(receiptResult);
        setTxSource(source);

        const [tagsResult, tokensResult] = await Promise.allSettled([
          fetch(apiUrl('/tags')),
          fetch(apiUrl(`/erc20-tokens?chainId=${chain.id}`))
        ]);

        if (tagsResult.status === 'fulfilled' && tagsResult.value.ok) {
          const allTags = await tagsResult.value.json() as Tag[];
          setTags(allTags);
        } else {
          setTags([]);
        }

        if (tokensResult.status === 'fulfilled' && tokensResult.value.ok) {
          const tokens = await tokensResult.value.json() as Erc20TokenConfig[];
          setErc20Tokens(tokens);

          if (receiptResult?.logs) {
            const transfers: Erc20Transfer[] = [];
            for (const log of receiptResult.logs) {
              const transfer = parseTransferEvent(log, tokens);
              if (transfer) {
                transfers.push(transfer);
              }
            }
            setErc20Transfers(transfers);
          } else {
            setErc20Transfers([]);
          }
        } else {
          setErc20Tokens([]);
          setErc20Transfers([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load transaction');
      }
    };
    load();
  }, [chain, hash]);

  // Decode transaction when receipt is available
  useEffect(() => {
    const decodeTransactionData = async () => {
      if (!receipt || !tx || !chain) {
        return;
      }

      setIsDecoding(true);
      try {
        const abiRegistry = getAbiRegistry();

        const decoded = await decodeTransaction(
          chain?.id || '',
          hash || '',
          tx.to,
          tx.input ?? '0x',
          receipt.logs,
          abiRegistry
        );

        setDecodedTx(decoded);
      } catch (err) {
        console.error('Failed to decode transaction:', err);
      } finally {
        setIsDecoding(false);
      }
    };

    decodeTransactionData();
  }, [receipt, tx, chain, hash]);

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
    ...(txSource === 'indexer'
      ? [{ label: 'Source', value: 'Local indexer summary (RPC record unavailable)' }]
      : []),
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
    { label: 'Value', value: `${fromHexToEth(tx.value)} ${chain.nativeTokenSymbol || 'ETH'}` },
    { label: 'Gas Limit', value: tx.gas ? formatNumber(parseInt(tx.gas, 16)) : '-' },
    { label: 'Gas Price', value: formatNumber(parseInt(tx.gasPrice, 16)) },
    { label: 'Gas Used', value: receipt ? formatNumber(parseInt(receipt.gasUsed, 16)) : '-' },
    { label: 'Nonce', value: tx.nonce ? parseInt(tx.nonce, 16) : '-' }
  ];

  // Format ERC20 transfer value for display
  const formatTransferValue = (transfer: Erc20Transfer): string => {
    if (transfer.valueFormatted < 0.0001 && transfer.valueFormatted > 0) {
      return `<0.0001 ${transfer.tokenSymbol ?? 'Token'}`;
    }
    return `${transfer.valueFormatted.toLocaleString()} ${transfer.tokenSymbol ?? 'Token'}`;
  };

  // Render address with tag
  const renderAddress = (address: string | null) => {
    if (!address) return <span>-</span>;
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
          <p>{chain?.chainName || 'Unknown Chain'}</p>
        </div>
        <TagManager type="tx" target={hash || ''} />
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

      {/* Decoded Contract Activity */}
      {decodedTx && !isDecoding && txSource === 'rpc' && (
        <DecodedTxView decoded={decodedTx} chainId={chain.id} />
      )}

      <section className="card">
        <div className="section-header">
          <h2>Logs (Raw)</h2>
          <button className="expand-button" onClick={() => setLogsExpanded(!logsExpanded)}>
            {logsExpanded ? '▼' : '▶'}
          </button>
        </div>
        {logsExpanded && (
          <pre className="code-block">{JSON.stringify(receipt?.logs ?? [], null, 2)}</pre>
        )}
      </section>
    </div>
  );
};

export default EvmTxPage;
