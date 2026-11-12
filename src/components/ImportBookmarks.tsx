'use client';

import { useRef, useState } from 'react';

type ImportItem = {
  url: string;
  title: string;
  source: 'bookmark';
  source_ref?: string;
};

type ImportOutcome = {
  created: number;
  updated: number;
  errors: Array<{ index: number; code: string; message: string }>;
};

const MAX_IMPORT_ITEMS = 500;

function titleFor(anchor: HTMLAnchorElement): string {
  return anchor.textContent?.replace(/\s+/g, ' ').trim() || anchor.href;
}

/** 解析 Chrome/Edge 导出的 Netscape bookmark HTML；只保留 http(s) 链接。 */
function parseBookmarkHtml(markup: string): ImportItem[] {
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  const seen = new Set<string>();
  const items: ImportItem[] = [];

  for (const anchor of doc.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    let parsed: URL;
    try {
      parsed = new URL(anchor.href);
    } catch {
      continue;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
    if (seen.has(parsed.href)) continue;
    seen.add(parsed.href);

    const folder = anchor.closest('dl')?.previousElementSibling?.textContent
      ?.replace(/\s+/g, ' ')
      .trim();
    items.push({
      url: parsed.href,
      title: titleFor(anchor),
      source: 'bookmark',
      ...(folder ? { source_ref: folder } : {}),
    });
    if (items.length >= MAX_IMPORT_ITEMS) break;
  }
  return items;
}

function parseCachetExport(raw: string): ImportItem[] {
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object' || !Array.isArray((data as { items?: unknown }).items)) {
    throw new Error('请选择 Cachet 导出的 JSON 文件。');
  }
  return (data as { items: Array<{ url?: unknown; title?: unknown; source_ref?: unknown }> }).items
    .flatMap((item) => {
      if (typeof item.url !== 'string' || typeof item.title !== 'string') return [];
      return [{
        url: item.url,
        title: item.title,
        source: 'bookmark' as const,
        ...(typeof item.source_ref === 'string' ? { source_ref: item.source_ref } : {}),
      }];
    })
    .slice(0, MAX_IMPORT_ITEMS);
}

export function ImportBookmarks() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<ImportItem[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  async function selectFile(file: File | undefined) {
    setError(null);
    setOutcome(null);
    setSelected(null);
    if (!file) return;

    try {
      const raw = await file.text();
      const items = file.name.toLowerCase().endsWith('.json')
        ? parseCachetExport(raw)
        : parseBookmarkHtml(raw);
      if (items.length === 0) {
        throw new Error('没有找到可导入的 http(s) 链接。');
      }
      setSelected(items);
      setFileName(file.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法读取该文件。');
    }
  }

  async function startImport() {
    if (!selected || selected.length === 0) return;
    setBusy(true);
    setError(null);
    setOutcome(null);

    try {
      const response = await fetch('/api/trove/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'merge', items: selected }),
      });
      const body = (await response.json()) as { data?: ImportOutcome; error?: { message?: string } };
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message ?? '导入失败。');
      }
      setOutcome(body.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导入失败。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="import-bookmarks">
      <p className="small muted">
        支持 Chrome/Edge 导出的书签 HTML，或 Cachet 的 JSON 导出。重复链接会合并，不会新增副本；每次最多导入 {MAX_IMPORT_ITEMS} 条。
      </p>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".html,.htm,text/html,.json,application/json"
        onChange={(event) => void selectFile(event.target.files?.[0])}
      />
      <div className="row-actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn" onClick={() => inputRef.current?.click()} disabled={busy}>
          选择导出文件
        </button>
        {selected ? (
          <button type="button" className="btn btn-primary" onClick={() => void startImport()} disabled={busy}>
            {busy ? '导入中…' : `导入 ${selected.length} 条`}
          </button>
        ) : null}
      </div>
      {selected ? <p className="small faint" style={{ marginTop: 10 }}>已读取 {fileName}，待导入 {selected.length} 条链接。</p> : null}
      {error ? <p className="callout callout-error small" role="alert" style={{ marginTop: 12 }}>{error}</p> : null}
      {outcome ? (
        <p className="callout small" role="status" style={{ marginTop: 12 }}>
          导入完成：新增 {outcome.created} 条，更新 {outcome.updated} 条，失败 {outcome.errors.length} 条。
        </p>
      ) : null}
    </div>
  );
}
