import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/domain/errors';
import { overdueCutoff } from '@/lib/domain/reminders';
import type {
  ApiKey,
  ClickEvent,
  ContentType,
  Item,
  ItemFilters,
  ItemListResult,
  Note,
  Profile,
  Tag,
  TagOrigin,
} from '@/types';

/** items 列表的排序字段白名单，避免把任意列名塞进 order()。 */
const SORTABLE = new Set(['collected_at', 'click_count', 'title']);

/** PostgREST `or()` 过滤串里会被当作语法解释的字符，必须剔除。 */
function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,()%*\\'"]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * 唯一的数据访问入口（plan §6「数据访问收口」）。
 *
 * 所有 `.from(...)` 调用都集中在这里，构造函数强制要求 userId，
 * 从根本上杜绝「忘记加 user_id 过滤」导致跨用户数据泄露。
 */
export class TroveDb {
  readonly userId: string;
  private readonly client: SupabaseClient;

  constructor(userId: string, client: SupabaseClient) {
    if (!userId) {
      throw new AppError('INTERNAL', 'SCOPED_CLIENT_REQUIRES_USER_ID');
    }
    this.userId = userId;
    this.client = client;
  }

  /** service-role 通道（API Key / MCP / CLI）。 */
  static forUser(userId: string): TroveDb {
    return new TroveDb(userId, createAdminClient());
  }

  /** 会话通道（Web SSR），RLS 保护 + 显式 user_id 双重保险。 */
  static forSession(userId: string, client: SupabaseClient): TroveDb {
    return new TroveDb(userId, client);
  }

  // ---------------------------------------------------------------- items --

  private itemsBase() {
    return this.client
      .from('items')
      .select('*', { count: 'exact' })
      .eq('user_id', this.userId);
  }

  async getItem(id: string): Promise<Item | null> {
    const { data, error } = await this.itemsBase().eq('id', id).maybeSingle();
    if (error) throw new AppError('INTERNAL', '读取收藏失败');
    return (data as Item | null) ?? null;
  }

  async getItemByNormalizedUrl(normalizedUrl: string): Promise<Item | null> {
    const { data, error } = await this.itemsBase()
      .eq('normalized_url', normalizedUrl)
      .maybeSingle();
    if (error) throw new AppError('INTERNAL', '读取收藏失败');
    return (data as Item | null) ?? null;
  }

  async listItems(filters: ItemFilters): Promise<ItemListResult> {
    const {
      q,
      domain,
      tags,
      content_type,
      source,
      status = 'active',
      read = 'all',
      overdue = false,
      collected_from,
      collected_to,
      sort = 'collected_at',
      order = 'desc',
      limit = 50,
      offset = 0,
    } = filters;

    let query = this.itemsBase();

    if (status !== 'all') query = query.eq('status', status);
    if (domain) query = query.eq('domain', domain);
    if (content_type) query = query.eq('content_type', content_type);
    if (source) query = query.eq('source', source);
    if (read === 'unread') query = query.is('read_at', null);
    if (read === 'read') query = query.not('read_at', 'is', null);
    if (collected_from) query = query.gte('collected_at', collected_from);
    if (collected_to) query = query.lte('collected_at', collected_to);

    if (overdue) {
      query = query.is('read_at', null).lt('collected_at', overdueCutoff().toISOString());
    }

    if (q && q.trim()) {
      const term = sanitizeSearchTerm(q);
      if (term) {
        query = query.or(
          `title.ilike.%${term}%,summary.ilike.%${term}%,url.ilike.%${term}%`,
        );
      }
    }

    // 标签过滤（AND 语义）：先解析出满足全部标签的 item id 集合
    if (tags && tags.length > 0) {
      const ids = await this.resolveItemsByTags(tags);
      if (ids.length === 0) {
        return { items: [], total: 0, limit, offset };
      }
      query = query.in('id', ids);
    }

    const sortField = SORTABLE.has(sort) ? sort : 'collected_at';
    query = query.order(sortField, { ascending: order === 'asc' });

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) throw new AppError('INTERNAL', '读取收藏列表失败');

    const items = (data as Item[]) ?? [];
    return { items, total: count ?? items.length, limit, offset };
  }

  /** 求同时拥有全部指定标签的 item id 集合（AND 语义）。 */
  private async resolveItemsByTags(tagNames: string[]): Promise<string[]> {
    const { data: tagRows, error: tagError } = await this.client
      .from('tags')
      .select('id,name')
      .eq('user_id', this.userId)
      .in('name', tagNames);
    if (tagError) throw new AppError('INTERNAL', '读取标签失败');

    const byName = new Map<string, string>(
      (tagRows as Array<{ id: string; name: string }>).map((t) => [t.name, t.id]),
    );

    // 有未知标签 → 不可能有条目同时命中
    if (tagNames.some((n) => !byName.has(n))) return [];

    const requiredIds = tagNames.map((n) => byName.get(n)!);
    const sets: Set<string>[] = [];

    for (const tagId of requiredIds) {
      const { data, error } = await this.client
        .from('item_tags')
        .select('item_id')
        .eq('tag_id', tagId);
      if (error) throw new AppError('INTERNAL', '读取标签绑定失败');
      sets.push(new Set((data as Array<{ item_id: string }>).map((r) => r.item_id)));
    }

    let result = sets[0] ?? new Set<string>();
    for (const s of sets.slice(1)) {
      result = new Set([...result].filter((id) => s.has(id)));
    }
    return [...result];
  }

  /** 批量取这些 item 的标签，返回 itemId → tags 的映射。 */
  async getTagsForItems(itemIds: string[]): Promise<Map<string, Tag[]>> {
    const result = new Map<string, Tag[]>();
    if (itemIds.length === 0) return result;

    const [{ data: linkRows }, { data: tagRows }] = await Promise.all([
      this.client.from('item_tags').select('item_id,tag_id').in('item_id', itemIds),
      this.client.from('tags').select('*').eq('user_id', this.userId),
    ]);

    const tagsById = new Map<string, Tag>(
      ((tagRows as Tag[]) ?? []).map((t) => [t.id, t]),
    );

    for (const row of (linkRows as Array<{ item_id: string; tag_id: string }>) ?? []) {
      const tag = tagsById.get(row.tag_id);
      if (!tag) continue;
      const list = result.get(row.item_id) ?? [];
      list.push(tag);
      result.set(row.item_id, list);
    }

    return result;
  }

  /**
   * upsert：同一 (user_id, normalized_url) 只会有一条。
   * `existed` 由调用方预先查得，避免这里再查一次。
   */
  async upsertItem(
    payload: Record<string, unknown>,
    existed: boolean,
  ): Promise<{ item: Item; created: boolean }> {
    const { data, error } = await this.client.rpc('trove_upsert_item', {
      p_user_id: this.userId,
      p_payload: payload,
    });

    if (error) {
      if (error.message.includes('MAX_TAGS_EXCEEDED')) {
        throw new AppError('MAX_TAGS_EXCEEDED', '每个收藏最多 3 个标签');
      }
      throw new AppError('INTERNAL', `写入收藏失败：${error.message}`);
    }

    const item = data as Item | null;
    if (!item) throw new AppError('INTERNAL', '写入收藏失败');

    return { item, created: !existed };
  }

  async updateItem(id: string, patch: Partial<Item>): Promise<Item | null> {
    const { data, error } = await this.client
      .from('items')
      .update(patch)
      .eq('id', id)
      .eq('user_id', this.userId)
      .select()
      .maybeSingle();
    if (error) throw new AppError('INTERNAL', '更新收藏失败');
    return (data as Item | null) ?? null;
  }

  async deleteItem(id: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('items')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId)
      .select('id');
    if (error) throw new AppError('INTERNAL', '删除收藏失败');
    return ((data as unknown[]) ?? []).length > 0;
  }

  /** 清空当前用户的全部收藏（导入时 replace 模式使用）。 */
  async deleteAllItems(): Promise<number> {
    const { data, error } = await this.client
      .from('items')
      .delete()
      .eq('user_id', this.userId)
      .select('id');
    if (error) throw new AppError('INTERNAL', '清空收藏失败');
    return ((data as unknown[]) ?? []).length;
  }

  /** 整体替换标签（走 RPC，原子完成「建标签 → 清旧绑定 → 绑新标签」）。 */
  async replaceItemTags(
    itemId: string,
    tagNames: string[],
    origin: TagOrigin = 'agent',
  ): Promise<Tag[]> {
    const { data, error } = await this.client.rpc('trove_replace_item_tags', {
      p_user_id: this.userId,
      p_item_id: itemId,
      p_tags: tagNames,
      p_origin: origin,
    });

    if (error) {
      if (error.message.includes('MAX_TAGS_EXCEEDED')) {
        throw new AppError('MAX_TAGS_EXCEEDED', '每个收藏最多 3 个标签');
      }
      if (error.message.includes('NOT_FOUND')) {
        throw new AppError('NOT_FOUND', '收藏不存在');
      }
      throw new AppError('INTERNAL', `设置标签失败：${error.message}`);
    }

    const tagIds = (data as string[]) ?? [];
    if (tagIds.length === 0) return [];

    const { data: tagRows } = await this.client
      .from('tags')
      .select('*')
      .eq('user_id', this.userId)
      .in('id', tagIds);

    return (tagRows as Tag[]) ?? [];
  }

  // ----------------------------------------------------------------- tags --

  async listTags(): Promise<Tag[]> {
    const { data, error } = await this.client
      .from('tags')
      .select('*')
      .eq('user_id', this.userId)
      .order('name', { ascending: true });
    if (error) throw new AppError('INTERNAL', '读取标签失败');
    return (data as Tag[]) ?? [];
  }

  async getTag(id: string): Promise<Tag | null> {
    const { data, error } = await this.client
      .from('tags')
      .select('*')
      .eq('id', id)
      .eq('user_id', this.userId)
      .maybeSingle();
    if (error) throw new AppError('INTERNAL', '读取标签失败');
    return (data as Tag | null) ?? null;
  }

  async getTagByName(name: string): Promise<Tag | null> {
    const { data, error } = await this.client
      .from('tags')
      .select('*')
      .eq('user_id', this.userId)
      .eq('name', name)
      .maybeSingle();
    if (error) throw new AppError('INTERNAL', '读取标签失败');
    return (data as Tag | null) ?? null;
  }

  async createTag(name: string, origin: TagOrigin = 'user'): Promise<Tag> {
    const { data, error } = await this.client
      .from('tags')
      .insert({ user_id: this.userId, name, origin })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        const existing = await this.getTagByName(name);
        if (existing) return existing;
      }
      throw new AppError('INTERNAL', `创建标签失败：${error.message}`);
    }
    return data as Tag;
  }

  async renameTag(id: string, name: string): Promise<Tag | null> {
    const { data, error } = await this.client
      .from('tags')
      .update({ name })
      .eq('id', id)
      .eq('user_id', this.userId)
      .select()
      .maybeSingle();
    if (error) {
      if (error.code === '23505') {
        throw new AppError('TAG_NAME_CONFLICT', '标签名已存在');
      }
      throw new AppError('INTERNAL', `重命名标签失败：${error.message}`);
    }
    return (data as Tag | null) ?? null;
  }

  async deleteTag(id: string): Promise<number> {
    const { data: links } = await this.client
      .from('item_tags')
      .select('item_id')
      .eq('tag_id', id);
    const unbound = ((links as Array<{ item_id: string }>) ?? []).length;

    const { data, error } = await this.client
      .from('tags')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId)
      .select('id');
    if (error) throw new AppError('INTERNAL', `删除标签失败：${error.message}`);

    return ((data as unknown[]) ?? []).length > 0 ? unbound : 0;
  }

  async countTagUsage(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    const { data } = await this.client
      .from('item_tags')
      .select('tag_id');
    const tags = await this.listTags();
    const usage = new Map<string, number>();
    for (const t of tags) usage.set(t.id, 0);
    for (const row of (data as Array<{ tag_id: string }>) ?? []) {
      usage.set(row.tag_id, (usage.get(row.tag_id) ?? 0) + 1);
    }
    for (const t of tags) counts.set(t.name, usage.get(t.id) ?? 0);
    return counts;
  }

  // ---------------------------------------------------------------- notes --

  async listNotes(itemId: string): Promise<Note[]> {
    const { data, error } = await this.client
      .from('notes')
      .select('*')
      .eq('item_id', itemId)
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false });
    if (error) throw new AppError('INTERNAL', '读取笔记失败');
    return (data as Note[]) ?? [];
  }

  async getNote(id: string): Promise<Note | null> {
    const { data, error } = await this.client
      .from('notes')
      .select('*')
      .eq('id', id)
      .eq('user_id', this.userId)
      .maybeSingle();
    if (error) throw new AppError('INTERNAL', '读取笔记失败');
    return (data as Note | null) ?? null;
  }

  async createNote(itemId: string, bodyMd: string): Promise<Note> {
    const { data, error } = await this.client
      .from('notes')
      .insert({ item_id: itemId, user_id: this.userId, body_md: bodyMd })
      .select()
      .single();
    if (error) throw new AppError('INTERNAL', `创建笔记失败：${error.message}`);
    return data as Note;
  }

  async updateNote(id: string, bodyMd: string): Promise<Note | null> {
    const { data, error } = await this.client
      .from('notes')
      .update({ body_md: bodyMd })
      .eq('id', id)
      .eq('user_id', this.userId)
      .select()
      .maybeSingle();
    if (error) throw new AppError('INTERNAL', `更新笔记失败：${error.message}`);
    return (data as Note | null) ?? null;
  }

  async deleteNote(id: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('notes')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId)
      .select('id');
    if (error) throw new AppError('INTERNAL', `删除笔记失败：${error.message}`);
    return ((data as unknown[]) ?? []).length > 0;
  }

  // ---------------------------------------------------------- click_events --

  async listClicks(itemId: string, limit = 20): Promise<ClickEvent[]> {
    const { data, error } = await this.client
      .from('click_events')
      .select('*')
      .eq('item_id', itemId)
      .eq('user_id', this.userId)
      .order('clicked_at', { ascending: false })
      .limit(limit);
    if (error) throw new AppError('INTERNAL', '读取点击记录失败');
    return (data as ClickEvent[]) ?? [];
  }

  // -------------------------------------------------------------- profile --

  async getProfile(): Promise<Profile | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', this.userId)
      .maybeSingle();
    if (error) throw new AppError('INTERNAL', '读取用户资料失败');
    return (data as Profile | null) ?? null;
  }

  async updateProfile(patch: Partial<Profile>): Promise<Profile | null> {
    const { data, error } = await this.client
      .from('profiles')
      .update(patch)
      .eq('id', this.userId)
      .select()
      .maybeSingle();
    if (error) throw new AppError('INTERNAL', '更新用户资料失败');
    return (data as Profile | null) ?? null;
  }

  // ------------------------------------------------------------- api_keys --

  async listApiKeys(): Promise<ApiKey[]> {
    const { data, error } = await this.client
      .from('api_keys')
      .select('*')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false });
    if (error) throw new AppError('INTERNAL', '读取 API Key 失败');
    return (data as ApiKey[]) ?? [];
  }

  async createApiKey(
    name: string,
    prefix: string,
    keyHash: string,
    scopes: string[],
  ): Promise<ApiKey> {
    const { data, error } = await this.client
      .from('api_keys')
      .insert({ user_id: this.userId, name, prefix, key_hash: keyHash, scopes })
      .select()
      .single();
    if (error) throw new AppError('INTERNAL', `创建 API Key 失败：${error.message}`);
    return data as ApiKey;
  }

  async revokeApiKey(id: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', this.userId)
      .select('id');
    if (error) throw new AppError('INTERNAL', `吊销 API Key 失败：${error.message}`);
    return ((data as unknown[]) ?? []).length > 0;
  }

  async touchApiKey(id: string): Promise<void> {
    await this.client
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', id);
  }

  /**
   * 认证前置查询：按哈希找未吊销的 API Key。
   * 此时还不知道 userId，因此不能用实例方法；用静态方法把 `.from('api_keys')`
   * 依然收口在 trove-db.ts 这一个文件里。
   */
  static async findApiKeyByHash(
    keyHash: string,
  ): Promise<{ id: string; user_id: string; scopes: string[] } | null> {
    const client = createAdminClient();
    const { data, error } = await client
      .from('api_keys')
      .select('id,user_id,scopes')
      .eq('key_hash', keyHash)
      .is('revoked_at', null)
      .maybeSingle();

    if (error) throw new AppError('INTERNAL', '校验 API Key 失败');
    return (data as { id: string; user_id: string; scopes: string[] } | null) ?? null;
  }

  /** 更新最后使用时间（不抛错，失败不应影响主流程）。 */
  static async markApiKeyUsed(id: string): Promise<void> {
    try {
      const client = createAdminClient();
      await client
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', id);
    } catch {
      // 忽略：使用时间只是辅助信息
    }
  }

  // ---------------------------------------------------------------- misc --

  /** 导出用的全量数据。 */
  async exportAll(): Promise<{
    profile: Profile | null;
    tags: Tag[];
    items: Item[];
    notes: Note[];
    click_events: ClickEvent[];
  }> {
    const [profile, tags, items, notes, click_events] = await Promise.all([
      this.getProfile(),
      this.listTags(),
      this.client
        .from('items')
        .select('*')
        .eq('user_id', this.userId)
        .order('collected_at', { ascending: false }),
      this.client
        .from('notes')
        .select('*')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: true }),
      this.client
        .from('click_events')
        .select('*')
        .eq('user_id', this.userId)
        .order('clicked_at', { ascending: true }),
    ]);

    return {
      profile,
      tags: tags as Tag[],
      items: (items.data as Item[]) ?? [],
      notes: (notes.data as Note[]) ?? [],
      click_events: (click_events.data as ClickEvent[]) ?? [],
    };
  }
}

export type { ContentType };
