import { expect, test } from './fixtures'

test('mobile remote lobby: join, chat và voice receive-only', async ({ page, browser }) => {
  const viewport = page.viewportSize()
  expect(viewport?.width).toBeLessThanOrEqual(430)
  await page.goto('/')
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)

  await page.getByRole('button', { name: 'Tạo ván mới' }).click()
  await page.getByRole('button', { name: /Quản trò/ }).click()
  await page.getByRole('radio', { name: /Chơi từ xa/ }).check()
  await page.getByRole('button', { name: /Tạo phòng và lấy mã/ }).click()
  const codeLabel = await page.getByRole('img', { name: /Mã phòng/ }).getAttribute('aria-label')
  const code = codeLabel!.replace('Mã phòng', '').replace(/\s/g, '')

  const playerContext = await browser.newContext({
    viewport: viewport ?? { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: await page.evaluate(() => navigator.userAgent),
  })
  const player = await playerContext.newPage()
  await player.goto(`/?join=${code}`)
  await player.getByLabel('Tên của bạn').fill('Người chơi mobile')
  await player.getByRole('button', { name: 'Vào phòng' }).click()
  await expect(player.getByRole('heading', { name: 'Đã vào phòng' })).toBeVisible()
  await expect(page.getByText('Người chơi mobile')).toBeVisible()

  await player.getByLabel('Tin nhắn').fill('Tin nhắn từ mobile')
  await player.getByRole('button', { name: 'Gửi', exact: true }).click()
  await expect(page.getByText('Tin nhắn từ mobile')).toBeVisible()

  const hostVoice = page.getByRole('region', { name: 'Voice lobby' })
  const playerVoice = player.getByRole('region', { name: 'Voice lobby' })
  await hostVoice.getByRole('button', { name: 'Tham gia voice' }).click()
  await playerVoice.getByRole('button', { name: 'Tham gia voice' }).click()
  await expect(hostVoice.getByText('2 người đang tham gia')).toBeVisible()
  await expect(playerVoice.getByText('2 người đang tham gia')).toBeVisible()
  await expect
    .poll(() => player.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)

  await page.getByRole('button', { name: 'Đóng phòng' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Đóng phòng' }).click()
  await expect(player.getByText('Phòng đã đóng')).toBeVisible()
})
