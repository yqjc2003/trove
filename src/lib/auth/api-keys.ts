import crypto from 'node:crypto';

export const API_KEY_PREFIX = 'trv_';
export const API_KEY_BODY_BYTES = 32; // 32 字节 → base62 最多 43 位
export const API_KEY_BODY_LENGTH = 43; // 定长：不足的左侧补 0
export const API_KEY_PREFIX_LEN = 12; // 展示用的明文前缀长度

const BASE62 =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export const DEFAULT_SCOPES = [
  'items:read',
  'items:write',
  'notes:write',
  'stats:read',
] as const;

export type Scope = (typeof DEFAULT_SCOPES)[number] | string;

export function toBase62(buf: Buffer): string {
  let n = BigInt(`0x${buf.toString('hex')}`);
  if (n === 0n) return '0';
  const base = 62n;
  let out = '';
  while (n > 0n) {
    out = BASE62[Number(n % base)] + out;
    n /= base;
  }
  return out;
}

/**
 * 生成一次性展示的 API Key 明文；服务端只保存哈希。
 *
 * body 定长 43 位：32 随机字节的 base62 表示只有 42 或 43 位
 * （62^42 ≈ 2^250.08，约 1.7% 的概率落在 62^42 以下），
 * 所以这里左侧补 0，保证明文长度恒定。
 */
export function generateApiKey(): {
  plaintext: string;
  prefix: string;
  hash: string;
} {
  const body = toBase62(crypto.randomBytes(API_KEY_BODY_BYTES)).padStart(
    API_KEY_BODY_LENGTH,
    '0',
  );
  const plaintext = `${API_KEY_PREFIX}${body}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, API_KEY_PREFIX_LEN),
    hash: hashApiKey(plaintext),
  };
}

export function hashApiKey(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

export function isApiKeyFormat(value: string): boolean {
  return typeof value === 'string' && value.startsWith(API_KEY_PREFIX);
}
