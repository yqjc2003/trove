'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { createBrowserSupabaseClient } from '@/lib/supabase/client';

type Mode = 'password' | 'magic';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';

  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const redirect = () => {
    router.replace(next);
    router.refresh();
  };

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const supabase = createBrowserSupabaseClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    redirect();
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const supabase = createBrowserSupabaseClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}${next}` },
    });

    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setNotice('登录链接已发送，请查收邮件。');
  }

  async function handleGithub() {
    setBusy(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}${next}` },
    });

    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    // 成功时浏览器会跳转到 GitHub，交给 OAuth 回调用处理
  }

  return (
    <main className="page">
      <div className="wrap-narrow">
        <h1>trove</h1>
        <p className="page-sub">
          把散落在各处收藏的链接，统一收敛到一处：标签、笔记、归档与阅读追踪。
        </p>

        <div className="section">
          <div className="filter-group" style={{ marginBottom: 24 }}>
            <button
              type="button"
              className="chip"
              aria-pressed={mode === 'password'}
              onClick={() => setMode('password')}
            >
              密码登录
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={mode === 'magic'}
              onClick={() => setMode('magic')}
            >
              邮件验证码
            </button>
          </div>

          <form onSubmit={mode === 'password' ? handlePasswordSignIn : handleMagicLink}>
            <label className="field">
              <span className="field-label">邮箱</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>

            {mode === 'password' ? (
              <label className="field">
                <span className="field-label">密码</span>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
            ) : null}

            {error ? <p className="callout callout-error small">{error}</p> : null}
            {notice ? <p className="callout small">{notice}</p> : null}

            <div className="form-row" style={{ marginTop: 20 }}>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {mode === 'password' ? '登录' : '发送登录链接'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleGithub}
                disabled={busy}
              >
                使用 GitHub 登录
              </button>
            </div>
          </form>

          <p className="small faint" style={{ marginTop: 24 }}>
            首次登录会自动创建账号与空白的个人标签空间（不预置任何标签）。
          </p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
