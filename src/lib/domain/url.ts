import { AppError } from './errors';

export const MAX_URL_LENGTH = 2048;

/** 需要从 query 中剔除的跟踪参数（utm_* 为前缀匹配，其余精确匹配）。 */
const TRACKING_PARAM_EXACT = new Set([
  'fbclid',
  'gclid',
  'spm',
  'ref',
  'referrer',
  'from',
  'source',
  'si',
  'feature',
  'yclid',
  'msclkid',
]);

const TRACKING_PARAM_PREFIXES = ['utm_', 'share_'];

export interface NormalizedUrl {
  /** 规范化后的展示 URL（保留原协议，但去掉 www/跟踪参数/fragment） */
  url: string;
  /** 去重键：强制 https，作为 (user_id, normalized_url) 唯一约束的一部分 */
  normalizedUrl: string;
  /** 去掉 www. 后的主机名 */
  domain: string;
}

function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase();
  if (TRACKING_PARAM_EXACT.has(k)) return true;
  return TRACKING_PARAM_PREFIXES.some((p) => k.startsWith(p));
}

/**
 * URL 规范化与去重（plan §5.1）。
 *
 *  - scheme 必须是 http/https，否则抛 INVALID_SCHEME（阻断 javascript:/data: 注入，
 *    同时保护 /r/[id] 这个 302 端点不被当作开放重定向滥用）
 *  - host 小写并去掉 www. 前缀
 *  - 去掉尾部 '/'（根路径除外）
 *  - 删除跟踪参数，其余参数按 key 排序
 *  - 去掉 fragment
 */
export function normalizeUrl(raw: string): NormalizedUrl {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new AppError('VALIDATION_ERROR', 'url 不能为空');
  }

  const trimmed = raw.trim();
  if (trimmed.length > MAX_URL_LENGTH) {
    throw new AppError('VALIDATION_ERROR', `url 超过 ${MAX_URL_LENGTH} 字符上限`);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AppError('VALIDATION_ERROR', 'url 格式非法');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError('INVALID_SCHEME', '只接受 http/https 链接');
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

  // 路径：保留原样，去掉尾部 '/'（根路径除外）
  let path = parsed.pathname;
  if (path.length > 1 && path.endsWith('/')) {
    path = path.replace(/\/+$/, '');
    if (path === '') path = '/';
  }

  // query：剔除跟踪参数，其余按 key 排序后重建
  const params = [...parsed.searchParams.entries()]
    .filter(([key]) => !isTrackingParam(key))
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  const query = params.length
    ? '?' + params.map(([k, v]) => `${k}=${v}`).join('&')
    : '';

  // fragment 一律丢弃
  const url = `${parsed.protocol}//${host}${path}${query}`;
  const normalizedUrl = `https://${host}${path}${query}`;

  return { url, normalizedUrl, domain: host };
}

/** 仅判断 scheme 是否可接受，供 302 端点做二次校验。 */
export function isAllowedScheme(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
