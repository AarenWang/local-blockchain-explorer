export const truncateMiddle = (value: string, head = 8, tail = 6) => {
  if (!value || value.length <= head + tail + 3) {
    return value;
  }
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

export const fromHexToEth = (valueHex: string) => {
  if (!valueHex || valueHex === '0x') {
    return '0';
  }

  const value = BigInt(valueHex);
  const whole = value / 10n ** 18n;
  const fraction = (value % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');

  return fraction ? `${whole}.${fraction}` : whole.toString();
};

export const fromHexToNumber = (valueHex: string) => {
  if (!valueHex || valueHex === '0x') {
    return 0;
  }
  return Number(BigInt(valueHex));
};

export const formatDateTime = (value?: number | string | null) => {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const date = typeof value === 'number'
    ? new Date(value < 1_000_000_000_000 ? value * 1000 : value)
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
};

export const formatNumber = (value?: number | string | null) => {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return String(value);
  }

  return parsed.toLocaleString();
};
