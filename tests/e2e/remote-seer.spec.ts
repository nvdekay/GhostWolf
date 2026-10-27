import { expect, test, type Browser, type Page } from '@playwright/test'

async function phone(browser: Browser): Promise<Page> {
  return (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
}

test('Tiên tri reconnect sau khi soi và phải xác nhận đã xem', async ({ browser }) => {
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
  const label = await host.getByRole('img', { name: /Mã phòng/ }).getAttribute('aria-label')
  const code = label!.replace('Mã phòng', '').replace(/\s/g, '')

  for (const [index, page] of players.entries()) {
    await page.goto(`/?join=${code}`)
    await page.getByLabel('Tên của bạn').fill(`S${index + 1}`)
    await page.getByRole('button', { name: 'Vào phòng' }).click()
    await page.getByRole('button', { name: 'Sẵn sàng', exact: true }).click()
  }
  await expect(host.getByText('Đã sẵn sàng')).toHaveCount(4)
  await host.getByRole('button', { name: /Chốt phòng · 4 người/ }).click()
  await host.getByRole('button', { name: /Tiếp tục: chia vai/ }).click()
  await host.getByRole('button', { name: /Chia vai ngẫu nhiên/ }).click()
  await host.getByRole('button', { name: /Gửi vai cho người chơi/ }).click()

  let wolf: Page | undefined
  let seer: Page | undefined
  let wolfName = ''
  for (const [index, page] of players.entries()) {
    await page.getByRole('button', { name: /Chạm để lật thẻ/ }).click()
    const role = await page.locator('.flip__name').textContent()
    if (role === 'Ma sói') {
      wolf = page
      wolfName = `S${index + 1}`
    }
    if (role === 'Tiên tri') seer = page
    await page.getByRole('button', { name: /Tôi đã nhớ vai/ }).click()
  }
  expect(wolf).toBeTruthy()
  expect(seer).toBeTruthy()

  await expect(host.getByText('4/4 người đã xem vai').first()).toBeVisible()
  await host.getByRole('button', { name: /Bắt đầu Đêm 1/ }).click()
  await wolf!.locator('.remote-prompt__targets button').first().click()
  await wolf!.getByRole('button', { name: 'Xác nhận hành động' }).click()
  await expect(host.getByText('Remote · 1/1 đã gửi')).toBeVisible()
  await host.getByRole('button', { name: 'Khóa lượt và áp dụng' }).click()

  await expect(seer!.getByRole('heading', { name: 'Tiên tri' })).toBeVisible()
  await seer!.getByRole('button', { name: wolfName, exact: true }).click()
  await seer!.getByRole('button', { name: 'Xác nhận hành động' }).click()
  await expect(host.getByText('Remote · 1/1 đã gửi')).toBeVisible()
  await host.getByRole('button', { name: 'Khóa lượt và áp dụng' }).click()

  await expect(seer!.getByRole('heading', { name: 'Kết quả soi' })).toBeVisible()
  await expect(
    seer!.locator('.remote-notebook').getByText(new RegExp(`${wolfName}: Ma sói`)),
  ).toBeVisible()
  await seer!.reload()
  await expect(seer!.getByRole('heading', { name: 'Kết quả soi' })).toBeVisible()
  await expect(
    seer!.locator('.remote-notebook').getByText(new RegExp(`${wolfName}: Ma sói`)),
  ).toBeVisible()
  await seer!.getByRole('button', { name: 'Đã xem, đi ngủ' }).click()
  await expect(host.getByText('Remote · 1/1 đã gửi')).toBeVisible()
  await host.getByRole('button', { name: 'Khóa lượt và áp dụng' }).click()
  await expect(host.getByRole('button', { name: /Trời sáng/ })).toBeVisible()
})
