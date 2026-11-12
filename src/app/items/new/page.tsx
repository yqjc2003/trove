import Link from 'next/link';

import { getServerContext } from '@/lib/server-context';
import { listTags } from '@/lib/services/tags';
import { ItemCreateForm } from '@/components/ItemCreateForm';

export const dynamic = 'force-dynamic';

/** 手工添加一条收藏（Web 手工通道，标签不限数量）。 */
export default async function NewItemPage() {
  const ctx = await getServerContext();
  if (!ctx) return null;

  const tags = await listTags(ctx);

  return (
    <main className="page">
      <div className="wrap-narrow">
        <p className="small faint" style={{ marginBottom: 20 }}>
          <Link href="/items">← 返回收藏列表</Link>
        </p>

        <h1>新增收藏</h1>
        <p className="page-sub">
          手工添加一条链接。内容形态按域名自动识别，标签数量不限。
        </p>

        <ItemCreateForm options={tags.map((t) => ({ id: t.id, name: t.name }))} />
      </div>
    </main>
  );
}
