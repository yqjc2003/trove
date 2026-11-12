import { fetchGithubIdentity } from '@/lib/auth/github-identity';
import type { ServiceContext } from './context';

/**
 * 账号信息 —— 只返回**当前用户自己**的资料。
 *
 * 为什么要有这个接口：客户端要读 GitHub 的 star 列表，
 * 公开端点 `GET /users/{username}/starred` 需要知道 username。
 * trove 用 GitHub OAuth 登录时已经把 username 存进了 `auth.users`，
 * 所以这里把它交出去，客户端就**不需要配 GITHUB_TOKEN**。
 */

export interface AccountInfo {
  user_id: string;
  email: string | null;
  display_name: string | null;
  /** GitHub 登录名；账号不是用 GitHub 注册的则为 null */
  github_username: string | null;
  /** GitHub 数字 user id */
  github_account_id: string | null;
  github_avatar_url: string | null;
}

export async function getAccountInfo(ctx: ServiceContext): Promise<AccountInfo> {
  const [profile, github] = await Promise.all([
    ctx.db.getProfile(),
    fetchGithubIdentity(ctx.userId),
  ]);

  return {
    user_id: ctx.userId,
    email: profile?.email ?? null,
    display_name: profile?.display_name ?? null,
    github_username: github.username,
    github_account_id: github.accountId,
    github_avatar_url: github.avatarUrl,
  };
}
