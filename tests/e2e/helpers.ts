import { expect, type Page } from '@playwright/test'

/** Chờ trình duyệt vẽ xong (sau khi đổi kích thước, mở dialog…) thay cho sleep cố định. */
export const nextFrame = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

/** Chờ màn chuyển cảnh ngày/đêm biến mất. */
export const curtainGone = (page: Page) =>
  expect(page.locator('.curtain')).toHaveCount(0, { timeout: 10_000 })

/** Bàn quản trò đã xử lý xong lệnh trước: nút Hoàn tác chỉ tắt khi đang bận (độ trễ mạng thật). */
export const boardIdle = (page: Page) =>
  expect(page.getByRole('button', { name: 'Hoàn tác thao tác vừa rồi' })).toBeEnabled({
    timeout: 15_000,
  })
