export const truncateMiddle = (value: string, head = 6, tail = 4) => {
  if (value.length <= head + tail) {
    return value;
  }
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

export const formatNumber = (value: number | string) => {
  const num = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(num)) {
    return String(value);
  }
  return num.toLocaleString();
};

export const formatDateTime = (timestampSec?: number | null) => {
  if (!timestampSec) {
    return '-';
  }
  const date = new Date(timestampSec * 1000);
  return date.toLocaleString();
};

export const fromHexToNumber = (hex: string) => {
  try {
    return parseInt(hex, 16);
  } catch {
    return 0;
  }
};

export const fromHexToEth = (hex: string) => {
  const value = BigInt(hex);
  const eth = Number(value) / 1e18;
  return eth.toFixed(4);
};
