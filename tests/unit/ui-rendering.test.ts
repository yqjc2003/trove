import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ItemEditor } from '@/components/ItemEditor';
import { ItemRow } from '@/components/ItemRow';
import { ReviewDesk } from '@/components/ReviewDesk';
import { TagInput } from '@/components/TagInput';
import { AgentSetupGuide } from '@/components/AgentSetupGuide';
import { ApiKeyManager } from '@/components/ApiKeyManager';
import { FakeTroveDb, fakeContext } from '../helpers/fake-db';
import { getItem, saveItem } from '@/lib/services/items';
import ItemDetailPage from '@/app/items/[id]/page';
import { getServerContext } from '@/lib/server-context';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/server-context', () => ({ getServerContext: vi.fn() }));
vi.mock('@/app/actions/items', () => ({
  setItemStatusAction: vi.fn(),
  updateItemFieldsAction: vi.fn(),
}));

describe('收集流 / 回看台渲染约束', () => {
  it('回看操作经过受控跳转，标签进入藏库镜头', async () => {
    const ctx = fakeContext(new FakeTroveDb());
    const saved = await saveItem(ctx, {
      url: 'https://example.com/article',
      title: '收藏',
      tags: ['数据库'],
    });
    const { item } = await getItem(ctx, saved.id);
    const html = renderToStaticMarkup(
      createElement(ReviewDesk, { items: [item], overdue: true }),
    );
    expect(html).toContain(`href="/r/${item.id}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('稍后再看');
    expect(html).toContain('当前候选 1 条');
    expect(html).toContain('/items?tag=%E6%95%B0%E6%8D%AE%E5%BA%93');
    expect(html).toContain(`<h2 class="desk-title"><a href="/r/${item.id}"`);
    expect(html).toContain(`href="/items/${item.id}"`);
    const row = renderToStaticMarkup(createElement(ItemRow, { item }));
    expect(row).toContain(`<p class="row-title"><a href="/r/${item.id}"`);
    expect(row).toContain(`href="/items/${item.id}"`);
    expect(row).toContain(`href="/r/${item.id}"`);
  });

  it('详情保留完整摘要并允许换行，不复用列表截断样式', () => {
    const summary = '第一段\n第二段'.repeat(30);
    const html = renderToStaticMarkup(
      createElement(ItemEditor, { itemId: 'item', title: '标题', summary }),
    );
    expect(html).toContain(summary);
    expect(html).toContain('class="detail-summary"');
    expect(html).not.toContain('class="row-summary"');
  });

  it('详情只提供受控原文入口，整理操作默认折叠', async () => {
    const ctx = fakeContext(new FakeTroveDb());
    const saved = await saveItem(ctx, {
      url: 'https://example.com/detail', title: '需要整理的收藏', summary: '完整摘要', tags: ['java'],
    });
    vi.mocked(getServerContext).mockResolvedValue(ctx);
    const page = await ItemDetailPage({ params: Promise.resolve({ id: saved.id }) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain(`href="/r/${saved.id}"`);
    expect(html).not.toContain('href="https://example.com/detail"');
    expect(html).toContain('<details class="item-organize">');
    expect(html).not.toContain('直接访问');
    expect(html).not.toContain('最近打开记录');
    expect(html).toContain('id="notes"');
  });

  it('空回看台给出藏库入口，手工新增时标签输入不会嵌套表单', () => {
    const empty = renderToStaticMarkup(
      createElement(ReviewDesk, { items: [], overdue: false }),
    );
    expect(empty).toContain('暂时没有待回看的链接');
    expect(empty).toContain('href="/items"');
    const form = renderToStaticMarkup(
      createElement(
        'form',
        null,
        createElement(TagInput, {
          tags: [],
          options: [],
          onChange: () => undefined,
        }),
      ),
    );
    expect(form.match(/<form/g)).toHaveLength(1);
    expect(form).toContain('type="button"');
  });

  it('首次空藏库提供 Agent 连接 Key 的生成入口', () => {
    const html = renderToStaticMarkup(
      createElement(AgentSetupGuide, { apiBase: 'https://catchlinger.example/api/trove' }),
    );
    expect(html).toContain('让 Agent 替你收下第一条。');
    expect(html).toContain('生成连接 Key');
    expect(html).not.toContain('CATCHLINGER_API_KEY=');
  });

  it('已有 API Key 时提供一键复制 Agent 安装提示入口', () => {
    const html = renderToStaticMarkup(
      createElement(ApiKeyManager, {
        siteUrl: 'https://catchlinger.example',
        keys: [{
          id: 'key-1',
          user_id: 'user-1',
          name: '已有连接',
          prefix: 'trv_12345678',
          scopes: [],
          created_at: '2026-11-13T00:00:00.000Z',
          last_used_at: null,
          revoked_at: null,
        }],
      }),
    );
    expect(html).toContain('一键复制 Agent 安装提示');
    expect(html).toContain('已有 Key 的明文无法再次读取。');
  });
});
