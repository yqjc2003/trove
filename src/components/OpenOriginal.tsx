'use client';

export function OpenOriginal({
  id,
  read = false,
  onOpen,
}: {
  id: string;
  read?: boolean;
  onOpen?: () => void;
}) {
  return (
    <a
      className="btn btn-primary"
      href={`/r/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        onOpen?.();
      }}
    >
      {read ? '再次打开' : '打开并阅读'}
      <span className="sr-only">（在新标签页打开）</span>
    </a>
  );
}
