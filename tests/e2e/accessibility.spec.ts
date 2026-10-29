import { expect, test } from './fixtures'

test('sheet giữ focus, đóng bằng Escape và trả focus về nút mở', async ({ page }) => {
  await page.goto('/')
  const opener = page.getByRole('button', { name: 'Cách chơi' })
  await opener.click()

  const sheet = page.getByRole('dialog', { name: 'Cách chơi' })
  const close = sheet.getByRole('button', { name: 'Đóng' })
  await expect(close).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(opener).toBeFocused()
})

test('dialog tuần hoàn focus và trả focus về nút mở', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Tạo ván mới' }).click()
  await page.getByRole('button', { name: /Quản trò/ }).click()
  await page.getByRole('button', { name: /Tạo phòng và lấy mã/ }).click()

  const opener = page.getByRole('button', { name: 'Đóng phòng', exact: true })
  await opener.click()
  const dialog = page.getByRole('alertdialog', { name: 'Đóng phòng?' })
  const stay = dialog.getByRole('button', { name: 'Ở lại' })
  const close = dialog.getByRole('button', { name: 'Đóng phòng' })
  await expect(stay).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(stay).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
})
