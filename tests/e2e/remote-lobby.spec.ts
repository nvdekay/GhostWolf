import { expect, test, type Browser, type Page } from '@playwright/test'

async function isolated(browser: Browser, width: number): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height: 844 } })
  return context.newPage()
}

test('remote lobby: ready, chat, reconnect và moderation', async ({ browser }) => {
  const host = await isolated(browser, 1280)
  const an = await isolated(browser, 390)
  const binh = await isolated(browser, 390)

  await host.goto('/')
  await host.getByRole('button', { name: 'Tạo ván mới' }).click()
  await host.getByRole('button', { name: /Quản trò/ }).click()
  await host.getByRole('radio', { name: /Từ xa/ }).check()
  await host.getByRole('button', { name: /Tạo phòng và lấy mã/ }).click()
  const codeLabel = await host.getByRole('img', { name: /Mã phòng/ }).getAttribute('aria-label')
  const code = codeLabel!.replace('Mã phòng', '').replace(/\s/g, '')

  for (const [page, name] of [
    [an, 'An'],
    [binh, 'Bình'],
  ] as const) {
    await page.goto(`/?join=${code}`)
    await page.getByLabel('Tên của bạn').fill(name)
    await page.getByRole('button', { name: 'Vào phòng' }).click()
    await expect(page.getByRole('heading', { name: 'Đã vào phòng' })).toBeVisible()
  }
  for (const name of ['Chi', 'Dũng']) {
    await host.getByLabel('Thêm người không dùng điện thoại').fill(name)
    await host.getByRole('button', { name: 'Thêm', exact: true }).click()
  }

  await expect(host.getByRole('button', { name: 'Chờ 2 người sẵn sàng' })).toBeDisabled()
  await an.getByRole('button', { name: 'Sẵn sàng', exact: true }).click()
  await binh.getByRole('button', { name: 'Sẵn sàng', exact: true }).click()
  await expect(host.getByText('Đã sẵn sàng')).toHaveCount(2)
  await expect(host.getByRole('button', { name: /Chốt phòng · 4 người/ })).toBeEnabled()

  await an.getByLabel('Tin nhắn').fill('Xin chào từ An')
  await an.getByRole('button', { name: 'Gửi', exact: true }).click()
  await expect(host.getByText('Xin chào từ An')).toBeVisible()
  await expect(binh.getByText('Xin chào từ An')).toBeVisible()

  await binh.reload()
  await expect(binh.getByText('Xin chào từ An')).toBeVisible()
  await host
    .getByText('Xin chào từ An')
    .locator('..')
    .getByRole('button', { name: 'Xóa tin nhắn' })
    .click()
  await expect(an.getByText('Tin nhắn đã bị quản trò xóa')).toBeVisible()

  await host.getByRole('button', { name: /Chốt phòng · 4 người/ }).click()
  await expect(an.getByRole('heading', { name: 'Phòng đã chốt' })).toBeVisible()
})
