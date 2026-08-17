export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return json({
      error: true,
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    }, error.status);
  }

  const message = error instanceof Error ? error.message : String(error);
  return json({ error: true, code: 'INTERNAL_ERROR', message: '服务器内部错误' }, 500, {
    'X-Error-Message': encodeURIComponent(message).slice(0, 512),
  });
}

export async function readJson<T extends object>(request: Request, maxBytes = 64 * 1024): Promise<T> {
  const contentLengthHeader = request.headers.get('Content-Length');
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
  if (contentLength !== null && Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大');
  }

  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'INVALID_JSON', '请求体必须是有效 JSON');
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new ApiError(400, 'INVALID_JSON', '请求体必须是有效 JSON');
  }
}

export function requiredString(value: unknown, field: string, maxLength = 100): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field}不能为空`, { field });
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field}长度不能超过${maxLength}`, { field });
  }
  return normalized;
}

export function optionalString(value: unknown, maxLength = 500): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new ApiError(400, 'VALIDATION_ERROR', '文本字段格式不正确');
  }
  return value.trim();
}

export function pagination(url: URL): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function parseJsonField<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
