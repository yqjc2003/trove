import type { TroveDb } from '@/lib/db/trove-db';
import type { Scope } from '@/lib/auth/api-keys';

/** 所有 service 共享的上下文：数据入口 + 归属用户 + 权限范围。 */
export interface ServiceContext {
  db: TroveDb;
  userId: string;
  scopes: string[];
}

export function requireScope(ctx: ServiceContext, scope: Scope): void {
  if (!ctx.scopes.includes(scope)) {
    throw new Error(`FORBIDDEN_SCOPE:${scope}`);
  }
}
