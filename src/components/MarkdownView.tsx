import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Markdown 渲染（代码块 / 表格 / 任务列表）。 */
export function MarkdownView({ body }: { body: string }) {
  if (!body.trim()) {
    return <p className="faint small">（空笔记）</p>;
  }

  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
    </div>
  );
}
