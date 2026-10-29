import { expect, test } from './fixtures'

test('kick, mất mạng rồi vào lại, đóng phòng: máy người chơi xử lý đúng', async ({ browser }) => {
  const host = await (
    await browser.newContext({ viewport: { width: 1280, height: 860 } })
  ).newPage()
  await host.goto('/')
  await host.getByRole('button', { name: 'Tạo ván mới' }).click()
  await host.getByRole('button', { name: /Quản trò/ }).click()
  await host.getByRole('button', { name: /Tạo phòng và lấy mã/ }).click()
  const label = await host.getByRole('img', { name: /Mã phòng/ }).getAttribute('aria-label')
  const code = label!.replace('Mã phòng', '').replace(/\s/g, '')

  const join = async (name: string) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const p = await ctx.newPage()
    await p.goto(`/?join=${code}`)
    await p.getByLabel('Tên của bạn').fill(name)
    await p.getByRole('button', { name: 'Vào phòng' }).click()
    await expect(p.getByRole('heading', { name: 'Đã vào phòng' })).toBeVisible()
    return { ctx, p }
  }

  // Kick
  const a = await join('Khách')
  await host.getByRole('button', { name: 'Mời Khách rời phòng' }).click()
  await expect(a.p.getByRole('heading', { name: 'Bạn đã được mời rời phòng' })).toBeVisible()

  // Mất mạng → presence offline → có mạng lại → vẫn trong phòng
  const b = await join('Bé')
  await expect(host.getByText('Đang online').first()).toBeVisible()
  await b.ctx.setOffline(true)
  await b.ctx.setOffline(false)
  await b.p.reload()
  await expect(b.p.getByRole('heading', { name: 'Đã vào phòng' })).toBeVisible()
  await expect(b.p.getByText('Bé · Bạn')).toBeVisible()

  // Đóng phòng
  await host.getByRole('button', { name: 'Đóng phòng' }).first().click()
  await host.getByRole('alertdialog').getByRole('button', { name: 'Đóng phòng' }).click()
  await expect(b.p.getByRole('heading', { name: 'Phòng đã đóng' })).toBeVisible()
})
