/** Sao chép văn bản. Trả về false nếu trình duyệt không cho (người dùng tự sao chép từ ô hiển thị). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // thử cách cũ bên dưới
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

/** Link mời thật từ origin hiện tại. */
export function inviteUrl(code: string): string {
  const u = new URL(window.location.href)
  u.search = ''
  u.hash = ''
  u.searchParams.set('join', code)
  return u.toString()
}
