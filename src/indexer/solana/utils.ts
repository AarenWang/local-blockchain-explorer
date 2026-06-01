import * as crypto from 'crypto';

const ED25519_CURVE = 'ed25519 seed';
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

interface DerivedNode {
  key: Buffer;
  chainCode: Buffer;
}

const parseDerivationPath = (path: string): number[] => {
  const trimmed = path.trim();
  if (!trimmed || trimmed === 'm') {
    return [];
  }

  const segments = trimmed.split('/');
  if (segments[0] !== 'm') {
    throw new Error(`Invalid derivation path: ${path}`);
  }

  return segments.slice(1).map((segment) => {
    const normalized = segment.endsWith("'") ? segment.slice(0, -1) : segment;
    const value = Number(normalized);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`Invalid derivation path segment: ${segment}`);
    }
    return value + 0x80000000;
  });
};

const deriveMasterNode = (seed: Buffer): DerivedNode => {
  const digest = crypto.createHmac('sha512', ED25519_CURVE).update(seed).digest();
  return {
    key: digest.subarray(0, 32),
    chainCode: digest.subarray(32)
  };
};

const deriveChildNode = (node: DerivedNode, index: number): DerivedNode => {
  const indexBuffer = Buffer.alloc(4);
  indexBuffer.writeUInt32BE(index, 0);
  const digest = crypto
    .createHmac('sha512', node.chainCode)
    .update(Buffer.concat([Buffer.from([0]), node.key, indexBuffer]))
    .digest();

  return {
    key: digest.subarray(0, 32),
    chainCode: digest.subarray(32)
  };
};

const createEd25519PrivateKey = (seed: Buffer) =>
  crypto.createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8'
  });

const encodeBase58 = (value: Buffer): string => {
  if (value.length === 0) {
    return '';
  }

  let digits = [0];
  for (const byte of value) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      carry += digits[index] * 256;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let encoded = '';
  for (const byte of value) {
    if (byte !== 0) {
      break;
    }
    encoded += BASE58_ALPHABET[0];
  }

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    encoded += BASE58_ALPHABET[digits[index]];
  }

  return encoded;
};

export const deriveSolanaAddress = (seed: Buffer, derivationPath: string) => {
  let node = deriveMasterNode(seed);
  for (const index of parseDerivationPath(derivationPath)) {
    node = deriveChildNode(node, index);
  }

  const privateKey = createEd25519PrivateKey(node.key);
  const publicKeyDer = crypto.createPublicKey(privateKey).export({
    format: 'der',
    type: 'spki'
  }) as Buffer;
  const publicKey = publicKeyDer.subarray(-32);

  return {
    publicKey,
    address: encodeBase58(publicKey),
    secretKey: node.key.toString('hex')
  };
};
