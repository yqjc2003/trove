export const CONTENT_TYPES = [
  'article',
  'video',
  'repo',
  'tool',
  'social',
  'doc',
  'other',
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

/**
 * 自动识别的「内容形态」——正交的技术维度，只用于按类型检索。
 * 它**不承载**「工作 / 生活 / 家庭」这类语义分类（语义分类一律由标签表达）。
 */
const HOST_RULES: Array<{ hosts: string[]; type: ContentType }> = [
  { hosts: ['github.com', 'gitlab.com', 'gitee.com'], type: 'repo' },
  {
    hosts: ['youtube.com', 'youtu.be', 'bilibili.com', 'vimeo.com', 'douyin.com'],
    type: 'video',
  },
  {
    hosts: [
      'x.com',
      'twitter.com',
      'weibo.com',
      'zhihu.com',
      'douban.com',
      'xiaohongshu.com',
    ],
    type: 'social',
  },
  {
    hosts: [
      'docs.google.com',
      'notion.so',
      'readthedocs.io',
      'developer.mozilla.org',
    ],
    type: 'doc',
  },
  {
    hosts: ['figma.com', 'canva.com', 'excalidraw.com', 'vercel.com', 'supabase.com'],
    type: 'tool',
  },
  {
    hosts: [
      'medium.com',
      'substack.com',
      'dev.to',
      'cnblogs.com',
      'juejin.cn',
      'csdn.net',
    ],
    type: 'article',
  },
];

const DEFAULT_CONTENT_TYPE: ContentType = 'article';

function hostMatches(host: string, rule: string): boolean {
  if (host === rule) return true;
  // 支持 *.example.com 形式
  return host.endsWith(`.${rule}`);
}

/** 从 URL 推断内容形态；无法识别时回落到 article。 */
export function detectContentType(rawUrl: string): ContentType {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return DEFAULT_CONTENT_TYPE;
  }

  for (const rule of HOST_RULES) {
    if (rule.hosts.some((h) => hostMatches(host, h))) {
      return rule.type;
    }
  }
  return DEFAULT_CONTENT_TYPE;
}

export function isContentType(value: unknown): value is ContentType {
  return typeof value === 'string' && (CONTENT_TYPES as readonly string[]).includes(value);
}
