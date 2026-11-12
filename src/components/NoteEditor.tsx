'use client';

import { useState, useTransition } from 'react';

import { addNoteAction, deleteNoteAction, updateNoteAction } from '@/app/actions/notes';
import { MarkdownView } from '@/components/MarkdownView';
import { formatDateTime } from '@/lib/format';
import type { Note } from '@/types';

/** Markdown 笔记编辑器：多条笔记，可增删改，带预览切换。 */
export function NoteEditor({ itemId, notes }: { itemId: string; notes: Note[] }) {
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submitNew() {
    if (!draft.trim()) return;
    startTransition(async () => {
      const res = await addNoteAction(itemId, draft);
      if (!res.ok) {
        setError(res.error ?? '保存失败');
        return;
      }
      setDraft('');
      setError(null);
    });
  }

  function submitEdit(noteId: string) {
    startTransition(async () => {
      const res = await updateNoteAction(noteId, editingBody);
      if (!res.ok) {
        setError(res.error ?? '保存失败');
        return;
      }
      setEditingId(null);
      setEditingBody('');
      setError(null);
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
      {notes.length === 0 ? (
        <p className="faint small">还没有笔记。</p>
      ) : (
        <ul className="rows">
          {notes.map((note) => (
            <li key={note.id} className="note">
              <div className="note-head">
                <span className="note-time">{formatDateTime(note.created_at)}</span>
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
      )}

      <div className="section">
        <div className="section-head">
          <h2 id="new-note-heading">写一条新笔记</h2>
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
            onChange={(e) => setDraft(e.target.value)}
            placeholder="支持 Markdown：代码块、列表、表格…"
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
            保存笔记
          </button>
        </div>
      </div>
    </div>
  );
}
