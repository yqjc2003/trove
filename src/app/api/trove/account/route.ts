import { withAuth } from '@/lib/http';
import { getAccountInfo } from '@/lib/services/account';

/**
 * GET /api/trove/account —— 当前账号信息
 *
 * 除了邮箱 / 昵称，重点是 `github_username`：
 * 客户端拿它就能走 GitHub 的公开端点 `GET /users/{username}/starred` 读 star 列表，
 * **不需要 GITHUB_TOKEN**。
 */
export async function GET(req: Request) {
  return withAuth(req, async (ctx) => getAccountInfo(ctx));
}
