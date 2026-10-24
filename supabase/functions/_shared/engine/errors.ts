/** Lỗi nghiệp vụ: lệnh không hợp lệ ở trạng thái hiện tại. Message hiển thị được cho quản trò. */
export class EngineError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'EngineError'
    this.code = code
  }
}

export function assert(cond: unknown, code: string, message: string): asserts cond {
  if (!cond) throw new EngineError(code, message)
}
