import { expect, test } from './fixtures'

test('tab mới giành quyền điều khiển và tab cũ chuyển sang chỉ dẫn an toàn', async ({
  browser,
}) => {
  const host = await (
    await browser.newContext({ viewport: { width: 1280, height: 860 } })
  ).newPage()
  const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const first = await playerContext.newPage()

  await host.goto('/')
  await host.getByRole('button', { name: 'Tạo ván mới' }).click()
  await host.getByRole('button', { name: /Quản trò/ }).click()
  await host.getByRole('radio', { name: /Từ xa/ }).check()
  await host.getByRole('button', { name: /Tạo phòng và lấy mã/ }).click()
  const codeLabel = await host.getByRole('img', { name: /Mã phòng/ }).getAttribute('aria-label')
  const code = codeLabel!.replace('Mã phòng', '').replace(/\s/g, '')

  await first.goto(`/?join=${code}`)
  await first.getByLabel('Tên của bạn').fill('Cùng tài khoản')
  await first.getByRole('button', { name: 'Vào phòng' }).click()
  await expect(first.getByRole('heading', { name: 'Đã vào phòng' })).toBeVisible()

  const second = await playerContext.newPage()
  await second.goto(`/?join=${code}`)
  await expect(second.getByRole('heading', { name: 'Đã vào phòng' })).toBeVisible()
  await second.getByRole('button', { name: 'Sẵn sàng', exact: true }).click()
  await expect(host.getByText('Đã sẵn sàng')).toHaveCount(1)
  await expect(first.getByRole('heading', { name: 'Thiết bị khác đang điều khiển' })).toBeVisible()
})
