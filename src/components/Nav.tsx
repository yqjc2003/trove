'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: '概览' },
  { href: '/items', label: '收藏' },
  { href: '/reminders', label: '待读' },
  { href: '/archive', label: '归档' },
  { href: '/settings', label: '设置' },
];

export function Nav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="nav-brand" translate="no">
          trove
        </Link>
        <div className="nav-links">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? 'page' : undefined}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="nav-spacer" />
        <form action="/api/auth/signout" method="post">
          <button type="submit" className="btn-quiet">
            退出
          </button>
        </form>
      </div>
    </nav>
  );
}
