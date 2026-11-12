import type { ContentType } from '@/lib/domain/content-type';

export type { ContentType };

export type ItemStatus = 'active' | 'archived';
export type ItemSource = 'manual' | 'skill' | 'mcp' | 'github' | 'bookmark';
export type TagOrigin = 'agent' | 'user';
export type ClickSource = 'web' | 'mcp' | 'skill' | 'manual';

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  origin: TagOrigin;
  created_at: string;
  updated_at: string;
  /** 使用计数（仅在标签列表接口返回） */
  count?: number;
}

export interface Item {
  id: string;
  user_id: string;
  url: string;
  normalized_url: string;
  domain: string;
  title: string;
  summary: string | null;
  content_excerpt: string | null;
  content_type: ContentType;
  source: ItemSource;
  source_ref: string | null;
  status: ItemStatus;
  archived_at: string | null;
  collected_at: string;
  read_at: string | null;
  click_count: number;
  last_clicked_at: string | null;
  created_at: string;
  updated_at: string;
  /** 关联标签（详情/列表接口按需附带） */
  tags?: Tag[];
}

export interface Note {
  id: string;
  item_id: string;
  user_id: string;
  body_md: string;
  created_at: string;
  updated_at: string;
}

export interface ClickEvent {
  id: number;
  item_id: string;
  user_id: string;
  clicked_at: string;
  source: ClickSource;
  referrer: string | null;
  user_agent: string | null;
}

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  reminder_days: number;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface ItemFilters {
  q?: string;
  domain?: string;
  tags?: string[];
  content_type?: ContentType;
  source?: ItemSource;
  status?: ItemStatus | 'all';
  read?: 'read' | 'unread' | 'all';
  overdue?: boolean;
  collected_from?: string;
  collected_to?: string;
  sort?: 'collected_at' | 'click_count' | 'title';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface ItemListResult {
  items: Item[];
  total: number;
  limit: number;
  offset: number;
}

export interface Stats {
  total: number;
  active: number;
  archived: number;
  unread: number;
  overdue: number;
  added_7d: number;
  by_tag: Array<{ name: string; count: number }>;
  by_source: Array<{ source: string; count: number }>;
  by_content_type: Array<{ content_type: string; count: number }>;
  top_domains: Array<{ domain: string; count: number }>;
}

export interface ReminderEntry {
  item: Item;
  days_overdue: number;
}
