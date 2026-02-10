import { useState } from 'react';

interface CopyButtonProps {
  value: string;
}

const CopyButton = ({ value }: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button type="button" className="copy-button" onClick={onCopy}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
};

export default CopyButton;
