'use client';

import { useId, useState } from 'react';

export interface TagOption {
  id: string;
  name: string;
}

/**
 * 标签输入（受控组件）。
 *
 * 回车或点「添加」加入一个标签，× 移除；也可以从已有标签里选。
 * **不限制数量**——Web 端是人工整理；Agent 通道（MCP / Skill）的 3 个上限在服务端拦。
 */
export function TagInput({
  tags,
  onChange,
  options,
  placeholder = '添加标签…',
  disabled,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  options: TagOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listId = useId();

  function addTag(raw: string) {
    const name = raw.trim().replace(/^#+/, '').toLowerCase();
    if (!name) return;
    if (tags.includes(name)) {
      setError('该标签已存在');
      return;
    }
    setError(null);
    setInput('');
    onChange([...tags, name]);
  }

  return (
    <div>
      <div className="tags">
        {tags.map((t) => (
          <span key={t} className="tag">
            {t}
            <button
              type="button"
              className="btn-quiet"
              style={{ fontSize: 12, lineHeight: 1 }}
              onClick={() => onChange(tags.filter((x) => x !== t))}
              disabled={disabled}
              aria-label={`移除标签 ${t}`}
            >
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 ? <span className="faint small">尚未打标签</span> : null}
      </div>

      <form
        className="form-row"
        style={{ marginTop: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          addTag(input);
        }}
      >
        <input
          className="input"
          name="tag"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder.endsWith('…') ? placeholder : `${placeholder}…`}
          disabled={disabled}
          list={listId}
          aria-label="标签名"
          autoComplete="off"
          spellCheck={false}
        />
        <datalist id={listId}>
          {options
            .filter((o) => !tags.includes(o.name))
            .map((o) => (
              <option key={o.id} value={o.name} />
            ))}
        </datalist>
        <button type="submit" className="btn btn-sm" disabled={disabled}>
          添加
        </button>
      </form>

      {error ? (
        <p className="small danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
