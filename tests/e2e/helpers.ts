import { expect, type Page } from '@playwright/test'

/** Chờ trình duyệt vẽ xong (sau khi đổi kích thước, mở dialog…) thay cho sleep cố định. */
export const nextFrame = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

/** Chờ màn chuyển cảnh ngày/đêm biến mất. */
export const curtainGone = (page: Page) =>
  expect(page.locator('.curtain')).toHaveCount(0, { timeout: 10_000 })
