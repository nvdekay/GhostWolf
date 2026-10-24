/** Chuẩn hóa để tìm kiếm tiếng Việt không dấu: "Tiên tri" → "tien tri". */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
}
