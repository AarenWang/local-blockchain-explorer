import CopyButton from './CopyButton';

interface Row {
  label: string;
  value: string | number | React.ReactNode;
  copy?: string;
}

interface KeyValueTableProps {
  rows: Row[];
}

const KeyValueTable = ({ rows }: KeyValueTableProps) => {
  return (
    <div className="key-value-table">
      {rows.map((row) => (
        <div key={row.label} className="key-value-row">
          <div className="key-value-label">{row.label}</div>
          <div className="key-value-value">
            <span>{row.value}</span>
            {row.copy ? <CopyButton value={row.copy} /> : null}
          </div>
        </div>
      ))}
    </div>
  );
};

export default KeyValueTable;
