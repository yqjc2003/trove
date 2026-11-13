import type { ContentType, ItemSource } from '@/types';
import type { Locale } from '@/lib/i18n';
import { translate } from '@/lib/i18n';

export const TYPE_LABELS: Record<ContentType, string> = {
  article: '文章',
  video: '视频',
  repo: '仓库',
  tool: '工具',
  social: '社交',
  doc: '文档',
  other: '其他',
};

export const SOURCE_LABELS: Record<ItemSource, string> = {
  manual: '手工收集',
  skill: 'Agent Skill',
  mcp: 'MCP 采集',
  github: 'GitHub Star',
  bookmark: '浏览器书签',
};

export function getTypeLabels(locale: Locale): Record<ContentType, string> {
  return Object.fromEntries(Object.keys(TYPE_LABELS).map((key) => [key, translate(locale, `labels.${key}`)])) as Record<ContentType, string>;
}

export function getSourceLabels(locale: Locale): Record<ItemSource, string> {
  return Object.fromEntries(Object.keys(SOURCE_LABELS).map((key) => [key, translate(locale, `labels.${key}`)])) as Record<ItemSource, string>;
}
