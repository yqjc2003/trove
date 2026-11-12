/**
 * 统一的错误类型：code 决定 HTTP 状态与客户端行为，message 用于人类可读提示。
 */
export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'MAX_TAGS_EXCEEDED'
  | 'INVALID_SCHEME'
  | 'TAG_NAME_CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  MAX_TAGS_EXCEEDED: 422,
  INVALID_SCHEME: 422,
  TAG_NAME_CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** 把任意异常收敛成 AppError，避免把栈或内部细节泄露给客户端。 */
export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;

  if (e instanceof Error) {
    const message = e.message ?? '';
    if (message.includes('MAX_TAGS_EXCEEDED')) {
      return new AppError('MAX_TAGS_EXCEEDED', '每个收藏最多 3 个标签');
    }
    if (message.includes('NOT_FOUND')) {
      return new AppError('NOT_FOUND', '资源不存在');
    }
    if (message.includes('AUTH_REQUIRED')) {
      return new AppError('UNAUTHORIZED', '需要登录');
    }
    if (message.includes('TAG_NAME_CONFLICT')) {
      return new AppError('TAG_NAME_CONFLICT', '标签名已存在');
    }
    return new AppError('INTERNAL', '服务器内部错误');
  }

  return new AppError('INTERNAL', '服务器内部错误');
}
