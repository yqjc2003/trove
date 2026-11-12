'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { signUpAction } from '@/app/actions/auth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

type Mode = 'password' | 'signup' | 'magic';

const MODES: Array<{ id: Mode; label: string }> = [
  { id: 'password', label: '密码登录' },
  { id: 'signup', label: '创建账号' },
  { id: 'magic', label: '邮件验证码' },
];

/** 只允许站内相对路径，避免 next 被当成开放重定向。 */
function safeNext(raw: string | null): string {
  if (!raw) return '/';
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));

  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // OAuth 失败时 Supabase 会把错误参数回传到 /login，直接在初始化时推导，
  // 不放进 effect（避免级联渲染）。
  const [error, setError] = useState<string | null>(() => {
    const err = params.get('error');
    return err ? describeAuthError(err, params.get('error_description')) : null;
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [githubEnabled, setGithubEnabled] = useState<boolean | null>(null);

  // 探测 GitHub provider 是否已在 Supabase 后台启用，没启用就别给一个死按钮
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!base || !key) return;

    let cancelled = false;
    fetch(`${base}/auth/v1/settings`, { headers: { apikey: key } })
      .then((r) => r.json())
      .then((s) => {
        if (!cancelled) setGithubEnabled(Boolean(s?.external?.github));
      })
      .catch(() => {
        if (!cancelled) setGithubEnabled(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
      setError(
        /invalid login credentials/i.test(err.message)
          ? '邮箱或密码不对。如果这是第一次使用，请切到「创建账号」。'
          : err.message,
      );
      return;
    }
    redirect();
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    // 注册走 Server Action：自动确认邮箱需要 service-role，不能在前端做
    const result = await signUpAction(email.trim(), password, next);

    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.signedIn) {
      redirect();
      return;
    }
    // 只有在服务端没配 service-role 时才会走到这里
    setNotice('确认邮件已发送，点里面的链接完成注册后即可登录。');
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const supabase = createBrowserSupabaseClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });

    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setNotice('登录链接已发送，请查收邮件。首次使用这个邮箱会自动创建账号。');
  }

  async function handleGithub() {
    setBusy(true);
    setError(null);
    setNotice(null);

    const supabase = createBrowserSupabaseClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    // 成功时浏览器会跳转到 GitHub，交给 OAuth 回调处理
  }

  const showPassword = mode === 'password' || mode === 'signup';

  return (
    <main className="page">
      <div className="wrap-narrow">
        <h1>trove</h1>
        <p className="page-sub">
          把散落在各处收藏的链接，统一收敛到一处：标签、笔记、归档与阅读追踪。
        </p>

        <div className="section">
          <div className="filter-group" style={{ marginBottom: 24 }}>
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className="chip"
                aria-pressed={mode === m.id}
                onClick={() => {
                  setMode(m.id);
                  setError(null);
                  setNotice(null);
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          <form onSubmit={mode === 'password' ? handlePasswordSignIn : mode === 'signup' ? handleSignUp : handleMagicLink}>
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

            {showPassword ? (
              <label className="field">
                <span className="field-label">密码</span>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                />
              </label>
            ) : null}

            {error ? <p className="callout callout-error small">{error}</p> : null}
            {notice ? <p className="callout small">{notice}</p> : null}

            <div className="form-row" style={{ marginTop: 20 }}>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {mode === 'password' ? '登录' : mode === 'signup' ? '创建账号' : '发送登录链接'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleGithub}
                disabled={busy || githubEnabled === false}
                title={githubEnabled === false ? '需先在 Supabase 后台启用 GitHub 登录' : undefined}
              >
                使用 GitHub 登录
              </button>
            </div>

            {githubEnabled === false ? (
              <p className="small faint" style={{ marginTop: 12 }}>
                GitHub 登录尚未在 Supabase 后台启用（Authentication → Providers → GitHub）。
                先用「创建账号」或「邮件验证码」也能直接开始用。
              </p>
            ) : null}
          </form>

          <p className="small faint" style={{ marginTop: 24 }}>
            首次登录会自动创建账号与空白的个人标签空间（不预置任何标签）。
          </p>
        </div>
      </div>
    </main>
  );
}

/** 把 Supabase 回传的 OAuth 错误码翻成人话。 */
function describeAuthError(code: string, detail?: string | null): string {
  const map: Record<string, string> = {
    access_denied: '你取消了授权。',
    missing_code: '回调缺少 code，登录没有完成，请重试。',
    missing_config: '服务端缺少 Supabase 环境变量。',
    exchange_failed: '用 code 换 session 失败，请重试。',
    server_error: 'Supabase 内部错误，请稍后重试。',
  };
  const base = map[code] ?? `登录失败（${code}）`;
  return detail ? `${base} ${detail}` : base;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
