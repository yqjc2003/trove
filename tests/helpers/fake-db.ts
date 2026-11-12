import type {
  ApiKey,
  ClickEvent,
  Item,
  Note,
  Profile,
  Tag,
} from '@/types';
import type { ItemFilters } from '@/types';

/**
 * 内存版 TroveDb。
 *
 * upsert 语义严格照抄 `trove_upsert_item` 的 SQL：
 *   · 只有 payload 里显式出现的 key 才会覆盖旧值
 *   · collected_at / status / archived_at / read_at / click_count / url 永不被覆盖
 *   · 去重键是 normalized_url
 */
export class FakeTroveDb {
  readonly userId: string;

  items = new Map<string, Item>();
  tags = new Map<string, Tag>();
  /** itemId → tagId[] */
  itemTags = new Map<string, string[]>();
  notes = new Map<string, Note>();
  clicks: ClickEvent[] = [];
  apiKeys: ApiKey[] = [];

  profile: Profile = {
    id: 'user-1',
    email: 'a@example.com',
    display_name: 'A',
    reminder_days: 14,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  private seq = 0;
  private tick = 0;

  /**
   * 单调递增的模拟时钟。
   * 每次调用前进 1 秒，这样 updated_at 在两次写入之间必然不同（便于断言）。
   */
  private currentTime(): string {
    this.tick += 1;
    return new Date(Date.UTC(2026, 0, 1) + this.tick * 1000).toISOString();
  }

  constructor(userId = 'user-1') {
    this.userId = userId;
  }

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  private tagName(id: string): string {
    return this.tags.get(id)?.name ?? '';
  }

  // ------------------------------------------------------------- items --

  async getItem(id: string): Promise<Item | null> {
    for (const item of this.items.values()) {
      if (item.id === id) return { ...item };
    }
    return null;
  }

  async getItemByNormalizedUrl(normalizedUrl: string): Promise<Item | null> {
    for (const item of this.items.values()) {
      if (item.normalized_url === normalizedUrl) return { ...item };
    }
    return null;
  }

  async listItems(filters: ItemFilters): Promise<{
    items: Item[];
    total: number;
    limit: number;
    offset: number;
  }> {
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

    let list = [...this.items.values()];

    if (status !== 'all') list = list.filter((i) => i.status === status);
    if (domain) list = list.filter((i) => i.domain === domain);
    if (content_type) list = list.filter((i) => i.content_type === content_type);
    if (source) list = list.filter((i) => i.source === source);
    if (read === 'unread') list = list.filter((i) => !i.read_at);
    if (read === 'read') list = list.filter((i) => Boolean(i.read_at));
    if (collected_from) {
      list = list.filter((i) => i.collected_at >= collected_from!);
    }
    if (collected_to) list = list.filter((i) => i.collected_at <= collected_to!);

    if (overdue) {
      const cutoff = new Date(
        Date.now() - this.profile.reminder_days * 24 * 60 * 60 * 1000,
      ).toISOString();
      list = list.filter((i) => i.status === 'active' && !i.read_at && i.collected_at < cutoff);
    }

    if (q && q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(needle) ||
          (i.summary ?? '').toLowerCase().includes(needle) ||
          i.url.toLowerCase().includes(needle),
      );
    }

    if (tags && tags.length > 0) {
      list = list.filter((i) => {
        const names = (this.itemTags.get(i.id) ?? []).map((t) => this.tagName(t));
        return tags.every((t) => names.includes(t));
      });
    }

    const dir = order === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sort === 'click_count') return (a.click_count - b.click_count) * dir;
      if (sort === 'title') return a.title.localeCompare(b.title) * dir;
      return (a.collected_at < b.collected_at ? -1 : 1) * dir;
    });

    const total = list.length;
    const page = list.slice(offset, offset + limit);

    return {
      items: page.map((i) => ({ ...i })),
      total,
      limit,
      offset,
    };
  }

  async upsertItem(
    payload: Record<string, unknown>,
    existed: boolean,
  ): Promise<{ item: Item; created: boolean }> {
    const key = String(payload.normalized_url);
    let item = [...this.items.values()].find((i) => i.normalized_url === key);
    const createdAt = this.currentTime();
    const updatedAt = this.currentTime();

    if (!item) {
      item = {
        id: this.id('item'),
        user_id: this.userId,
        url: String(payload.url),
        normalized_url: key,
        domain: String(payload.domain),
        title: String(payload.title ?? ''),
        summary: (payload.summary as string) ?? null,
        content_excerpt: (payload.content_excerpt as string) ?? null,
        content_type: (payload.content_type as Item['content_type']) ?? 'other',
        source: (payload.source as Item['source']) ?? 'manual',
        source_ref: (payload.source_ref as string) ?? null,
        status: 'active',
        archived_at: null,
        collected_at: createdAt,
        read_at: null,
        click_count: 0,
        last_clicked_at: null,
        created_at: createdAt,
        updated_at: updatedAt,
      };
    } else {
      // 只覆盖 payload 里显式出现且非空的字段
      if ('title' in payload && payload.title) item.title = String(payload.title);
      if ('summary' in payload && payload.summary) item.summary = String(payload.summary);
      if ('content_excerpt' in payload && payload.content_excerpt) {
        item.content_excerpt = String(payload.content_excerpt);
      }
      if ('content_type' in payload && payload.content_type) {
        item.content_type = payload.content_type as Item['content_type'];
      }
      if ('source' in payload && payload.source) {
        item.source = payload.source as Item['source'];
      }
      if ('source_ref' in payload && payload.source_ref) {
        item.source_ref = String(payload.source_ref);
      }
      item.updated_at = updatedAt;
      // collected_at / status / archived_at / read_at / click_count / url 不动
    }

    this.items.set(key, item);
    return { item: { ...item }, created: !existed };
  }

  async updateItem(id: string, patch: Partial<Item>): Promise<Item | null> {
    const item = await this.getItem(id);
    if (!item) return null;
    const merged = { ...item, ...patch, updated_at: this.currentTime() };
    this.items.set(merged.normalized_url, merged);
    return { ...merged };
  }

  async deleteItem(id: string): Promise<boolean> {
    for (const [key, item] of this.items) {
      if (item.id === id) {
        this.items.delete(key);
        this.itemTags.delete(id);
        for (const [noteId, note] of this.notes) {
          if (note.item_id === id) this.notes.delete(noteId);
        }
        return true;
      }
    }
    return false;
  }

  async deleteAllItems(): Promise<number> {
    const n = this.items.size;
    this.items.clear();
    this.itemTags.clear();
    this.notes.clear();
    return n;
  }

  async getTagsForItems(itemIds: string[]): Promise<Map<string, Tag[]>> {
    const out = new Map<string, Tag[]>();
    for (const itemId of itemIds) {
      const ids = this.itemTags.get(itemId) ?? [];
      out.set(
        itemId,
        ids
          .map((tid) => this.tags.get(tid))
          .filter((t): t is Tag => Boolean(t))
          .map((t) => ({ ...t })),
      );
    }
    return out;
  }

  async replaceItemTags(
    itemId: string,
    tagNames: string[],
    origin: Tag['origin'] = 'agent',
  ): Promise<Tag[]> {
    const names = [...new Set(tagNames.map((n) => n.trim().toLowerCase()).filter(Boolean))];
    // 不在这里限制数量：DB 层的「至多 3 个」现在按 auth.role() 分流
    // （service_role 的 Agent 通道限 3，会话通道不限），假实现没有角色概念。
    // Agent 通道的上限由 service 层的 normalizeTags 保证（单测覆盖），
    // DB 层的角色分流由 tests/integration/ 覆盖。

    const tagIds: string[] = [];
    const createdAt = this.currentTime();
    const updatedAt = this.currentTime();
    for (const name of names) {
      let tag = [...this.tags.values()].find(
        (t) => t.user_id === this.userId && t.name === name,
      );
      if (!tag) {
        tag = {
          id: this.id('tag'),
          user_id: this.userId,
          name,
          origin,
          created_at: createdAt,
          updated_at: updatedAt,
        };
        this.tags.set(tag.id, tag);
      }
      tagIds.push(tag.id);
    }

    this.itemTags.set(itemId, tagIds);
    return tagIds.map((tid) => ({ ...this.tags.get(tid)! }));
  }

  // -------------------------------------------------------------- tags --

  async listTags(): Promise<Tag[]> {
    return [...this.tags.values()]
      .filter((t) => t.user_id === this.userId)
      .map((t) => ({ ...t }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getTag(id: string): Promise<Tag | null> {
    const tag = this.tags.get(id);
    return tag ? { ...tag } : null;
  }

  async getTagByName(name: string): Promise<Tag | null> {
    const tag = [...this.tags.values()].find(
      (t) => t.user_id === this.userId && t.name === name,
    );
    return tag ? { ...tag } : null;
  }

  async createTag(name: string, origin: Tag['origin'] = 'user'): Promise<Tag> {
    const createdAt = this.currentTime();
    const updatedAt = this.currentTime();
    const tag: Tag = {
      id: this.id('tag'),
      user_id: this.userId,
      name,
      origin,
      created_at: createdAt,
      updated_at: updatedAt,
    };
    this.tags.set(tag.id, tag);
    return { ...tag };
  }

  async renameTag(id: string, name: string): Promise<Tag | null> {
    const tag = this.tags.get(id);
    if (!tag) return null;
    const conflict = [...this.tags.values()].find(
      (t) => t.user_id === this.userId && t.name === name && t.id !== id,
    );
    if (conflict) throw new Error('TAG_NAME_CONFLICT');
    tag.name = name;
    tag.updated_at = this.currentTime();
    return { ...tag };
  }

  async deleteTag(id: string): Promise<number> {
    if (!this.tags.has(id)) return 0;
    let unbound = 0;
    for (const [itemId, ids] of this.itemTags) {
      if (ids.includes(id)) {
        this.itemTags.set(
          itemId,
          ids.filter((x) => x !== id),
        );
        unbound += 1;
      }
    }
    this.tags.delete(id);
    return unbound;
  }

  async countTagUsage(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const tag of this.tags.values()) {
      if (tag.user_id !== this.userId) continue;
      let n = 0;
      for (const ids of this.itemTags.values()) {
        if (ids.includes(tag.id)) n += 1;
      }
      counts.set(tag.name, n);
    }
    return counts;
  }

  // ------------------------------------------------------------- notes --

  async listNotes(itemId: string): Promise<Note[]> {
    return [...this.notes.values()]
      .filter((n) => n.item_id === itemId && n.user_id === this.userId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((n) => ({ ...n }));
  }

  async getNote(id: string): Promise<Note | null> {
    const note = this.notes.get(id);
    return note ? { ...note } : null;
  }

  async createNote(itemId: string, bodyMd: string): Promise<Note> {
    const createdAt = this.currentTime();
    const updatedAt = this.currentTime();
    const note: Note = {
      id: this.id('note'),
      item_id: itemId,
      user_id: this.userId,
      body_md: bodyMd,
      created_at: createdAt,
      updated_at: updatedAt,
    };
    this.notes.set(note.id, note);
    return { ...note };
  }

  async updateNote(id: string, bodyMd: string): Promise<Note | null> {
    const note = this.notes.get(id);
    if (!note) return null;
    note.body_md = bodyMd;
    note.updated_at = this.currentTime();
    return { ...note };
  }

  async deleteNote(id: string): Promise<boolean> {
    return this.notes.delete(id);
  }

  // ------------------------------------------------------------ clicks --

  async listClicks(itemId: string, limit = 20): Promise<ClickEvent[]> {
    return this.clicks
      .filter((c) => c.item_id === itemId)
      .slice(0, limit)
      .map((c) => ({ ...c }));
  }

  // ----------------------------------------------------------- profile --

  async getProfile(): Promise<Profile | null> {
    return { ...this.profile };
  }

  async updateProfile(patch: Partial<Profile>): Promise<Profile | null> {
    this.profile = { ...this.profile, ...patch };
    return { ...this.profile };
  }

  // --------------------------------------------------------- api_keys --

  async listApiKeys(): Promise<ApiKey[]> {
    return this.apiKeys.map((k) => ({ ...k }));
  }

  async createApiKey(
    name: string,
    prefix: string,
    keyHash: string,
    scopes: string[],
  ): Promise<ApiKey> {
    const createdAt = this.currentTime();
    const key: ApiKey = {
      id: this.id('key'),
      user_id: this.userId,
      name,
      prefix,
      scopes,
      created_at: createdAt,
      last_used_at: null,
      revoked_at: null,
    };
    this.apiKeys.push(key);
    return { ...key };
  }

  async revokeApiKey(id: string): Promise<boolean> {
    const key = this.apiKeys.find((k) => k.id === id);
    if (!key) return false;
    key.revoked_at = this.currentTime();
    return true;
  }

  async touchApiKey(): Promise<void> {}

  async exportAll() {
    return {
      profile: await this.getProfile(),
      tags: await this.listTags(),
      items: [...this.items.values()].map((i) => ({ ...i })),
      notes: [...this.notes.values()].map((n) => ({ ...n })),
      click_events: this.clicks.map((c) => ({ ...c })),
    };
  }
}

/** 把 FakeTroveDb 包装成 service 层需要的 ServiceContext。 */
export function fakeContext(db: FakeTroveDb = new FakeTroveDb()) {
  return {
    db: db as never,
    userId: db.userId,
    scopes: ['items:read', 'items:write', 'notes:write', 'stats:read'],
  };
}
