import { Link } from 'react-router-dom';
import { useState } from 'react';
import { DecodedTransaction, DecodedCall, DecodedLog } from '../data/abi/types';
import CopyButton from './CopyButton';

interface DecodedTxViewProps {
  decoded: DecodedTransaction;
  chainId: string;
}

const DecodedTxView = ({ decoded, chainId }: DecodedTxViewProps) => {
  const [expanded, setExpanded] = useState(true);

  if (!decoded.topLevelCall && decoded.logs.length === 0) {
    return (
      <section className="card decoded-tx-view">
        <div className="section-header">
          <h2>Decoded Contract Activity</h2>
          <button className="expand-button" onClick={() => setExpanded(!expanded)}>
            {expanded ? '▼' : '▶'}
          </button>
        </div>
        {expanded && (
          <>
            <p className="no-decoded-data">
              No ABI available for this transaction. Raw data is shown below.
            </p>
            {decoded.errors.length > 0 && <ErrorList errors={decoded.errors} />}
          </>
        )}
      </section>
    );
  }

  return (
    <section className="card decoded-tx-view">
      <div className="section-header">
        <h2>Decoded Contract Activity</h2>
        <button className="expand-button" onClick={() => setExpanded(!expanded)}>
          {expanded ? '▼' : '▶'}
        </button>
      </div>

      {expanded && (
        <>
          {decoded.summary && <SummaryCard summary={decoded.summary} />}

          {decoded.topLevelCall && (
            <div className="decoded-section">
              <h3>Call Chain</h3>
              <CallChain
                topLevelCall={decoded.topLevelCall}
                nestedCalls={decoded.nestedCalls}
                chainId={chainId}
              />
            </div>
          )}

          {decoded.logs.length > 0 && (
            <div className="decoded-section">
              <h3>Decoded Logs ({decoded.logs.length})</h3>
              <DecodedLogList logs={decoded.logs} chainId={chainId} />
            </div>
          )}

          {decoded.errors.length > 0 && <ErrorList errors={decoded.errors} />}
        </>
      )}
    </section>
  );
};

const SummaryCard = ({ summary }: { summary: string }) => (
  <div className="decoded-summary">
    <span className="summary-label">Summary</span>
    <span className="summary-text">{summary}</span>
  </div>
);

interface CallChainProps {
  topLevelCall: DecodedCall;
  nestedCalls: DecodedCall[];
  chainId: string;
}

const CallChain = ({ topLevelCall, nestedCalls, chainId }: CallChainProps) => {
  return (
    <div className="call-chain">
      <CallNode call={topLevelCall} chainId={chainId} />
      {nestedCalls.length > 0 && (
        <div className="nested-calls">
          {nestedCalls.map((nested, i) => (
            <CallNode
              key={`${nested.targetAddress}-${i}`}
              call={nested}
              chainId={chainId}
              nested={true}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface CallNodeProps {
  call: DecodedCall;
  chainId: string;
  nested?: boolean;
}

const CallNode = ({ call, chainId, nested = false }: CallNodeProps) => (
  <div className={`call-node ${nested ? 'nested' : ''}`}>
    <div className="call-header">
      <div className="call-contract">
        <Link to={`/chain/${chainId}/evm/address/${call.targetAddress}`}>
          {call.contractLabel || truncateMiddle(call.targetAddress)}
        </Link>
        {call.contractType && (
          <span className={`contract-type-badge badge-${call.contractType}`}>
            {call.contractType}
          </span>
        )}
      </div>
      <span className="call-function">{call.functionName}</span>
      {call.abiSource && (
        <span className="abi-source-badge" title={`ABI source: ${call.abiSource}`}>
          ABI
        </span>
      )}
    </div>
    {call.args.length > 0 && (
      <div className="arg-list">
        {call.args.map((arg, i) => (
          <ArgItem key={`${call.functionName}-arg-${i}`} arg={arg} />
        ))}
      </div>
    )}
  </div>
);

interface ArgItemProps {
  arg: {
    name: string;
    type: string;
    value: any;
    valueFormatted?: string;
    isIndexed?: boolean;
  };
}

const ArgItem = ({ arg }: ArgItemProps) => (
  <div className="arg-item">
    <span className="arg-name">
      {arg.name}
      {arg.isIndexed && <span className="arg-indexed"> (indexed)</span>}
    </span>
    <span className="arg-type">{arg.type}</span>
    <span className="arg-value">
      {arg.valueFormatted !== undefined ? arg.valueFormatted : String(arg.value)}
    </span>
    <CopyButton value={String(arg.value)} />
  </div>
);

interface DecodedLogListProps {
  logs: DecodedLog[];
  chainId: string;
}

const DecodedLogList = ({ logs, chainId }: DecodedLogListProps) => (
  <div className="decoded-log-list">
    {logs.map((log, i) => (
      <DecodedLogItem key={`log-${i}`} log={log} chainId={chainId} index={i} />
    ))}
  </div>
);

interface DecodedLogItemProps {
  log: DecodedLog;
  chainId: string;
  index: number;
}

const DecodedLogItem = ({ log, chainId }: DecodedLogItemProps) => (
  <div className="decoded-log-item">
    <div className="log-header">
      <div className="log-contract">
        <Link to={`/chain/${chainId}/evm/address/${log.address}`}>
          {log.contractLabel || truncateMiddle(log.address)}
        </Link>
        {log.contractType && (
          <span className={`contract-type-badge badge-${log.contractType}`}>
            {log.contractType}
          </span>
        )}
      </div>
      <span className="log-event">{log.eventName}</span>
    </div>
    <div className="arg-list">
      {log.args.map((arg, i) => (
        <ArgItem key={`${log.eventName}-arg-${i}`} arg={arg} />
      ))}
    </div>
  </div>
);

interface ErrorListProps {
  errors: Array<{
    level: string;
    location: string;
    address?: string;
    message: string;
  }>;
}

const ErrorList = ({ errors }: ErrorListProps) => {
  if (errors.length === 0) return null;

  return (
    <div className="decoded-errors">
      <h3>Decoding Notes</h3>
      {errors.map((error, i) => (
        <div key={`error-${i}`} className={`error-item error-${error.level}`}>
          <span className="error-level">[{error.level}]</span>
          <span className="error-message">{error.message}</span>
        </div>
      ))}
    </div>
  );
};

function truncateMiddle(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail) {
    return value;
  }
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export default DecodedTxView;
