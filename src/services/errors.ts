/** Lỗi đã chuẩn hóa từ RPC / Edge Function / mạng, message hiển thị được. */
export class AppError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status = 0) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
  }
}

const NETWORK = 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'

/** PostgrestError: mã nghiệp vụ nằm ở `details` (gw_error trong migration). */
export function fromPostgrest(e: {
  message: string
  details?: string | null
  code?: string
}): AppError {
  if (/Failed to fetch|NetworkError|fetch failed/i.test(e.message))
    return new AppError('NETWORK', NETWORK)
  return new AppError(e.details || e.code || 'DB_ERROR', e.message)
}

export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e
  if (e && typeof e === 'object' && 'message' in e)
    return fromPostgrest(e as { message: string; details?: string })
  return new AppError('UNKNOWN', 'Đã có lỗi. Thử lại.')
}

export const networkError = () => new AppError('NETWORK', NETWORK)
