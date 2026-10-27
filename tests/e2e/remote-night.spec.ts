import { expect, test, type Browser, type Page } from '@playwright/test'

async function phone(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  return context.newPage()
}

test('remote night: hai Sói reconnect, chat kín, gửi và khóa lựa chọn', async ({ browser }) => {
  const host = await (
    await browser.newContext({ viewport: { width: 1280, height: 860 } })
  ).newPage()
  const players = await Promise.all([
    phone(browser),
    phone(browser),
    phone(browser),
    phone(browser),
  ])

  await host.goto('/')
  await host.getByRole('button', { name: 'Tạo ván mới' }).click()
  await host.getByRole('button', { name: /Quản trò/ }).click()
  await host.getByRole('radio', { name: /Từ xa/ }).check()
  await host.getByRole('button', { name: /Tạo phòng và lấy mã/ }).click()
  const codeLabel = await host.getByRole('img', { name: /Mã phòng/ }).getAttribute('aria-label')
  const code = codeLabel!.replace('Mã phòng', '').replace(/\s/g, '')

  for (const [index, page] of players.entries()) {
    await page.goto(`/?join=${code}`)
    await page.getByLabel('Tên của bạn').fill(`Người ${index + 1}`)
    await page.getByRole('button', { name: 'Vào phòng' }).click()
    await page.getByRole('button', { name: 'Sẵn sàng', exact: true }).click()
  }
  await expect(host.getByText('Đã sẵn sàng')).toHaveCount(4)
  await host.getByRole('button', { name: /Chốt phòng · 4 người/ }).click()

  // Bộ 2 Sói + 2 Dân bảo đảm có hai client cùng dùng chat kín.
  await host.getByRole('button', { name: 'Thêm một Ma sói' }).click()
  await host.getByRole('button', { name: 'Bớt một Tiên tri' }).click()
  await expect(host.getByText('Khớp 4/4 người')).toBeVisible()
  await host.getByRole('button', { name: /Tiếp tục: chia vai/ }).click()
  await host.getByRole('button', { name: /Chia vai ngẫu nhiên/ }).click()
  await host.getByRole('button', { name: /Gửi vai cho người chơi/ }).click()

  const wolves: Page[] = []
  const villagers: Page[] = []
  for (const page of players) {
    await page.getByRole('button', { name: /Chạm để lật thẻ/ }).click()
    const role = await page.locator('.flip__name').textContent()
    ;(role === 'Ma sói' ? wolves : villagers).push(page)
    await page.getByRole('button', { name: /Tôi đã nhớ vai/ }).click()
  }
  expect(wolves).toHaveLength(2)
  expect(villagers).toHaveLength(2)
  await expect(host.getByText('4/4 người đã xem vai').first()).toBeVisible()
  await host.getByRole('button', { name: /Bắt đầu Đêm 1/ }).click()

  await expect(wolves[0]!.getByRole('heading', { name: 'Ma sói' })).toBeVisible()
  await expect(villagers[0]!.getByText(/chờ trong im lặng/i)).toBeVisible()
  await wolves[0]!.getByLabel('Tin nhắn').fill('Cùng chọn mục tiêu đầu tiên')
  await wolves[0]!.getByRole('button', { name: 'Gửi', exact: true }).click()
  await expect(wolves[1]!.getByText('Cùng chọn mục tiêu đầu tiên')).toBeVisible()
  await expect(villagers[0]!.getByText('Cùng chọn mục tiêu đầu tiên')).toHaveCount(0)

  // Snapshot server dựng lại đúng prompt sau refresh.
  await wolves[0]!.reload()
  await expect(wolves[0]!.getByRole('heading', { name: 'Ma sói' })).toBeVisible()
  const victim = await wolves[0]!.locator('.remote-prompt__targets button').first().textContent()
  for (const wolf of wolves) {
    await wolf.getByRole('button', { name: victim!, exact: true }).click()
    await wolf.getByRole('button', { name: 'Xác nhận hành động' }).click()
    await expect(wolf.getByText(/Đã ghi nhận · lần 1/)).toBeVisible()
  }

  await expect(host.getByText('Remote · 2/2 đã gửi')).toBeVisible()
  await host.getByRole('button', { name: 'Khóa lượt và áp dụng' }).click()
  await expect(host.getByRole('button', { name: /Trời sáng/ })).toBeVisible()
  for (const wolf of wolves) {
    await expect(wolf.getByRole('heading', { name: /xem lại kết quả đêm/i })).toBeVisible()
    await expect(wolf.getByLabel('Tin nhắn')).toHaveCount(0)
  }
})
