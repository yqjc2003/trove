'use client';

import { useRef, useState } from 'react';
import { useTranslation } from '@/components/LocaleProvider';

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

function parseCatchLingerExport(raw: string): ImportItem[] {
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object' || !Array.isArray((data as { items?: unknown }).items)) {
    throw new Error('INVALID_EXPORT');
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
  const { t } = useTranslation();
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
        ? parseCatchLingerExport(raw)
        : parseBookmarkHtml(raw);
      if (items.length === 0) {
        throw new Error('NO_LINKS');
      }
      setSelected(items);
      setFileName(file.name);
    } catch (cause) {
      setError(cause instanceof Error && cause.message === 'INVALID_EXPORT' ? t('import.invalidExport') : cause instanceof Error && cause.message === 'NO_LINKS' ? t('import.noLinks') : t('import.readFailed'));
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
        throw new Error(body.error?.message ?? 'IMPORT_FAILED');
      }
      setOutcome(body.data);
    } catch {
      setError(t('import.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="import-bookmarks">
      <p className="small muted">
        {t('import.help', { count: MAX_IMPORT_ITEMS })}
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
          {t('import.chooseFile')}
        </button>
        {selected ? (
          <button type="button" className="btn btn-primary" onClick={() => void startImport()} disabled={busy}>
            {busy ? t('import.importing') : t('import.start', { count: selected.length })}
          </button>
        ) : null}
      </div>
      {selected ? <p className="small faint" style={{ marginTop: 10 }}>{t('import.selected', { file: fileName, count: selected.length })}</p> : null}
      {error ? <p className="callout callout-error small" role="alert" style={{ marginTop: 12 }}>{error}</p> : null}
      {outcome ? (
        <p className="callout small" role="status" style={{ marginTop: 12 }}>
          {t('import.complete', { created: outcome.created, updated: outcome.updated, failed: outcome.errors.length })}
        </p>
      ) : null}
    </div>
  );
}
