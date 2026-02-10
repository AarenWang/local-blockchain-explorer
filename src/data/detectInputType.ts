export type SearchTarget =
  | { kind: 'evmBlock'; value: string }
  | { kind: 'evmTx'; value: string }
  | { kind: 'evmAddress'; value: string }
  | { kind: 'solanaSlot'; value: string }
  | { kind: 'solanaTx'; value: string }
  | { kind: 'solanaAccount'; value: string }
  | { kind: 'unknown'; value: string };

const evmAddressRegex = /^0x[a-fA-F0-9]{40}$/;
const evmTxRegex = /^0x[a-fA-F0-9]{64}$/;
const numberRegex = /^\d+$/;

const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;

export const detectInputType = (input: string): SearchTarget => {
  const trimmed = input.trim();
  if (!trimmed) {
    return { kind: 'unknown', value: trimmed };
  }
  if (numberRegex.test(trimmed)) {
    return { kind: 'evmBlock', value: trimmed };
  }
  if (evmTxRegex.test(trimmed)) {
    return { kind: 'evmTx', value: trimmed };
  }
  if (evmAddressRegex.test(trimmed)) {
    return { kind: 'evmAddress', value: trimmed };
  }
  if (base58Regex.test(trimmed)) {
    if (trimmed.length > 48) {
      return { kind: 'solanaTx', value: trimmed };
    }
    return { kind: 'solanaAccount', value: trimmed };
  }
  return { kind: 'unknown', value: trimmed };
};
