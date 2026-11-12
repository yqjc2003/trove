'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

const LINKS = [
  { href: '/', label: '回看台' },
  { href: '/stream', label: '收集流' },
  { href: '/items', label: '藏库' },
  { href: '/settings', label: '我的语言' },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const opened = useRef(false);

  useEffect(() => {
    function track(event: MouseEvent) {
      const anchor =
        event.target instanceof Element
          ? event.target.closest('a[href]')
          : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (
        anchor.origin === window.location.origin &&
        anchor.pathname.startsWith('/r/')
      )
        opened.current = true;
    }
    function refresh() {
      if (opened.current && document.visibilityState === 'visible') {
        opened.current = false;
        router.refresh();
      }
    }
    document.addEventListener('click', track);
    document.addEventListener('auxclick', track);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      document.removeEventListener('click', track);
      document.removeEventListener('auxclick', track);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router]);

  const isActive = (href: string) =>
    href === '/'
      ? pathname === '/' || pathname === '/reminders'
      : pathname.startsWith(href);

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
        <Link href="/items/new" className="nav-capture">
          收一条链接
        </Link>
        <form action="/api/auth/signout" method="post">
          <button type="submit" className="btn-quiet">
            退出
          </button>
        </form>
      </div>
    </nav>
  );
}
