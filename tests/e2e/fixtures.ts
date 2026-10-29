import { expect, test as base } from '@playwright/test'

/** Các test tự tạo nhiều context/thiết bị; luôn đóng hết để không rò Realtime/heartbeat sang test sau. */
export const test = base

test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((context) => context.close()))
})

export { expect }
export type { Browser, Locator, Page } from '@playwright/test'
