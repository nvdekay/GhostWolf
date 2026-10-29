import { expect, test } from './fixtures'

test('mã một lần chuyển quyền quản trò sang thiết bị mới', async ({ browser }) => {
  const oldContext = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  const oldHost = await oldContext.newPage()
  await oldHost.goto('/')
  await oldHost.getByRole('button', { name: 'Tạo ván mới' }).click()
  await oldHost.getByRole('button', { name: /Quản trò/ }).click()
  await oldHost.getByRole('radio', { name: /Từ xa/ }).check()
  await oldHost.getByRole('button', { name: /Tạo phòng và lấy mã/ }).click()

  await oldHost.getByRole('button', { name: 'Mã khôi phục' }).click()
  const recoveryDialog = oldHost.getByRole('alertdialog', {
    name: 'Mã khôi phục quản trò',
  })
  const recoveryKey = await recoveryDialog.getByLabel('Mã khôi phục quản trò').inputValue()
  expect(recoveryKey).toMatch(/^[A-F0-9]{6}(?:-[A-F0-9]{6}){3}$/)
  await recoveryDialog.getByRole('button', { name: 'Đóng' }).click()

  const codeLabel = await oldHost.getByRole('img', { name: /Mã phòng/ }).getAttribute('aria-label')
  const roomCode = codeLabel!.replace('Mã phòng', '').replace(/\s/g, '')

  const newContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const newHost = await newContext.newPage()
  await newHost.goto('/')
  await newHost.getByRole('button', { name: 'Khôi phục quản trò' }).click()
  await newHost.getByLabel('Mã phòng khôi phục').fill(roomCode)
  await newHost.getByLabel('Mã khôi phục quản trò').fill(recoveryKey)
  await newHost.getByRole('button', { name: 'Khôi phục quyền quản trò' }).click()
  await expect(newHost.getByRole('img', { name: /Mã phòng/ })).toBeVisible()

  const rotatedKey = await newHost.evaluate(
    () =>
      Object.entries(localStorage).find(([key]) => key.startsWith('ghostwolf:host-recovery:'))?.[1],
  )
  expect(rotatedKey).toMatch(/^[A-F0-9]{6}(?:-[A-F0-9]{6}){3}$/)
  expect(rotatedKey).not.toBe(recoveryKey)

  const thirdContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const third = await thirdContext.newPage()
  await third.goto('/')
  await third.getByRole('button', { name: 'Khôi phục quản trò' }).click()
  await third.getByLabel('Mã phòng khôi phục').fill(roomCode)
  await third.getByLabel('Mã khôi phục quản trò').fill(recoveryKey)
  await third.getByRole('button', { name: 'Khôi phục quyền quản trò' }).click()
  await expect(third.getByRole('alert')).toContainText('không đúng')

  await oldHost.reload()
  await expect(oldHost.getByRole('heading', { name: 'Không mở được phòng' })).toBeVisible()

  await newHost.getByRole('button', { name: 'Đóng phòng' }).first().click()
  await newHost.getByRole('alertdialog').getByRole('button', { name: 'Đóng phòng' }).click()
  await expect(newHost.getByRole('button', { name: 'Tạo ván mới' })).toBeVisible()

  await Promise.all([oldContext.close(), newContext.close(), thirdContext.close()])
})
