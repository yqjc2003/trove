'use client';

import { useState, useTransition } from 'react';

import {
  addNoteAction,
  deleteNoteAction,
  updateNoteAction,
} from '@/app/actions/notes';
import { MarkdownView } from '@/components/MarkdownView';
import { formatDateTime } from '@/lib/format';
import type { Note } from '@/types';

/** Markdown 笔记编辑器：多条笔记，可增删改，带预览切换。 */
export function NoteEditor({
  itemId,
  notes,
}: {
  itemId: string;
  notes: Note[];
}) {
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState('');

  function submitNew() {
    if (!draft.trim()) return;
    setNotice('');
    startTransition(async () => {
      try {
        const res = await addNoteAction(itemId, draft);
        if (!res.ok) {
          setError(res.error ?? '保存失败');
          return;
        }
        setDraft('');
        setError(null);
        setNotice('笔记已保存。');
      } catch {
        setError('连接失败，草稿已保留，请重试。');
      }
    });
  }

  function submitEdit(noteId: string) {
    setNotice('');
    startTransition(async () => {
      try {
        const res = await updateNoteAction(noteId, editingBody);
        if (!res.ok) {
          setError(res.error ?? '保存失败');
          return;
        }
        setEditingId(null);
        setEditingBody('');
        setError(null);
        setNotice('笔记已更新。');
      } catch {
        setError('连接失败，修改已保留，请重试。');
      }
    });
  }

  function remove(noteId: string) {
    if (!window.confirm('删除这条笔记？')) return;
    startTransition(async () => {
      const res = await deleteNoteAction(noteId);
      if (!res.ok) setError(res.error ?? '删除失败');
    });
  }

  return (
    <div>
      {notes.length > 0 ? (
        <ul className="rows">
          {notes.map((note) => (
            <li key={note.id} className="note">
              <div className="note-head">
                <span className="note-time">
                  {formatDateTime(note.created_at)}
                </span>
                <span style={{ display: 'flex', gap: 12 }}>
                  <button
                    type="button"
                    className="btn-quiet"
                    disabled={pending}
                    onClick={() => {
                      setEditingId(note.id);
                      setEditingBody(note.body_md);
                    }}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    className="btn-quiet"
                    disabled={pending}
                    onClick={() => remove(note.id)}
                  >
                    删除
                  </button>
                </span>
              </div>

              {editingId === note.id ? (
                <div>
                  <textarea
                    className="textarea textarea-mono"
                    name="note"
                    value={editingBody}
                    disabled={pending}
                    onChange={(e) => setEditingBody(e.target.value)}
                    aria-label="编辑笔记"
                    autoComplete="off"
                    spellCheck
                  />
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={pending}
                      onClick={() => submitEdit(note.id)}
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={pending}
                      onClick={() => {
                        setEditingId(null);
                        setEditingBody('');
                      }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <MarkdownView body={note.body_md} />
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="note-compose">
        <div className="section-head">
          <h2 id="new-note-heading">写下你的理解</h2>
          <button
            type="button"
            className="btn-quiet"
            onClick={() => setPreview((v) => !v)}
          >
            {preview ? '编辑' : '预览'}
          </button>
        </div>

        {preview ? (
          <div style={{ paddingTop: 12 }}>
            <MarkdownView body={draft} />
          </div>
        ) : (
          <textarea
            id="new-note"
            className="textarea textarea-mono"
            name="note"
            value={draft}
            disabled={pending}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="为什么收下它？什么值得下次再用？支持 Markdown。"
            autoComplete="off"
            aria-labelledby="new-note-heading"
            style={{ marginTop: 12 }}
          />
        )}

        {error ? (
          <p className="small danger" role="alert">
            {error}
          </p>
        ) : null}

        <div className="row-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={submitNew}
            disabled={pending || !draft.trim()}
          >
            {pending ? '保存中…' : '保存笔记'}
          </button>
        </div>
        <p className="small muted" role="status">
          {notice}
        </p>
      </div>
    </div>
  );
}
