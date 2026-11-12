import { AppError, toAppError } from '@/lib/domain/errors';
import { resolveAuth } from '@/lib/auth/resolve';
import { TroveDb } from '@/lib/db/trove-db';
import type { ServiceContext } from '@/lib/services/context';

export interface ApiEnvelope<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** 成功响应：`{ data }` */
export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ data }, init);
}

/** 失败响应：`{ error: { code, message, details } }`，状态码由错误类型决定。 */
export function fail(error: unknown): Response {
  const err = toAppError(error);
  const body: ApiEnvelope<never> = {
    error: {
      code: err.code,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    },
  };
  return Response.json(body, { status: err.status });
}

/**
 * 统一鉴权入口：解析凭据 → 构造 ServiceContext → 调用 handler。
 *
 * 会话模式用会话客户端（RLS 保护）；API Key 模式用 service-role，
 * 但两条路径都经过 TroveDb 强制 user_id 过滤。
 */
export async function withAuth(
  req: Request,
  handler: (ctx: ServiceContext) => Promise<unknown>,
): Promise<Response> {
  try {
    const auth = await resolveAuth(req);
    if (!auth) {
      throw new AppError('UNAUTHORIZED', '需要登录或提供有效的 API Key');
    }

    const db =
      auth.mode === 'session' && auth.sessionClient
        ? TroveDb.forSession(auth.userId, auth.sessionClient)
        : TroveDb.forUser(auth.userId);

    const data = await handler({
      db,
      userId: auth.userId,
      scopes: auth.scopes,
    });

    return ok(data);
  } catch (e) {
    return fail(e);
  }
}

/** 解析 JSON 请求体；非法 JSON 抛 VALIDATION_ERROR。 */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new AppError('VALIDATION_ERROR', '请求体必须是 JSON 对象');
    }
    return body as Record<string, unknown>;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('VALIDATION_ERROR', '请求体不是合法 JSON');
  }
}

/** 读取 query 参数（兼容重复参数）。 */
export function queryList(params: URLSearchParams, key: string): string[] {
  return params.getAll(key).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
}
