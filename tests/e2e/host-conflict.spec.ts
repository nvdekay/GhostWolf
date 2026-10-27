import { expect, test } from '@playwright/test'

test('hai tab quản trò cùng thao tác thì tab conflict tự tải state mới', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    reducedMotion: 'reduce',
  })
  const first = await context.newPage()

  await first.goto('/')
  await first.getByRole('button', { name: 'Tạo ván mới' }).click()
  await first.getByRole('button', { name: /Quản trò/ }).click()
  await first.getByRole('button', { name: /Tạo phòng và lấy mã/ }).click()
  for (const name of ['An', 'Bình', 'Chi', 'Dũng']) {
    await first.getByLabel('Thêm người không dùng điện thoại').fill(name)
    await first.getByRole('button', { name: 'Thêm', exact: true }).click()
  }
  await first.getByRole('button', { name: /Chốt phòng · 4 người/ }).click()
  await expect(first.getByText('Chọn bộ vai', { exact: true }).first()).toBeVisible()

  const second = await context.newPage()
  await second.goto('/')
  await expect(second.getByText('Chọn bộ vai', { exact: true }).first()).toBeVisible()

  await Promise.all(
    [first, second].map((page) => page.getByRole('button', { name: 'Tiếp tục: chia vai' }).click()),
  )
  await Promise.all(
    [first, second].map((page) =>
      expect(page.getByRole('heading', { name: 'Chia vai ngẫu nhiên' })).toBeVisible(),
    ),
  )

  await Promise.all(
    [first, second].map((page) =>
      page.getByRole('button', { name: 'Chia vai ngẫu nhiên' }).click(),
    ),
  )

  for (const page of [first, second]) {
    await expect(page.getByRole('heading', { name: 'Kiểm tra trước khi gửi' })).toBeVisible()
    await expect(page.locator('.assign__row')).toHaveCount(4)
    await expect(page.getByRole('button', { name: 'Gửi vai cho người chơi' })).toBeEnabled()
  }
})
