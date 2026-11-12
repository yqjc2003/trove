import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ItemEditor } from '@/components/ItemEditor';
import { ItemRow } from '@/components/ItemRow';
import { ReviewDesk } from '@/components/ReviewDesk';
import { TagInput } from '@/components/TagInput';
import { FakeTroveDb, fakeContext } from '../helpers/fake-db';
import { getItem, saveItem } from '@/lib/services/items';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
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
    const row = renderToStaticMarkup(createElement(ItemRow, { item }));
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
});
