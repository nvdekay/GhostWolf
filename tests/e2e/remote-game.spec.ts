import { expect, test, type Browser, type Page } from '@playwright/test'
import { curtainGone } from './helpers'

interface PlayerClient {
  page: Page
  name: string
  role?: string
}

async function makePlayer(browser: Browser, name: string): Promise<PlayerClient> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  return { page: await context.newPage(), name }
}

test('remote full flow: role → night → discussion → private vote → result', async ({ browser }) => {
  const host = await (
    await browser.newContext({ viewport: { width: 1280, height: 860 } })
  ).newPage()
  const players = await Promise.all(
    ['An', 'Bình', 'Chi', 'Dũng'].map((name) => makePlayer(browser, name)),
  )

  await host.goto('/')
  await host.getByRole('button', { name: 'Tạo ván mới' }).click()
  await host.getByRole('button', { name: /Quản trò/ }).click()
  await host.getByRole('radio', { name: /Từ xa/ }).check()
  await host.getByRole('button', { name: /Tạo phòng và lấy mã/ }).click()
  const codeLabel = await host.getByRole('img', { name: /Mã phòng/ }).getAttribute('aria-label')
  const code = codeLabel!.replace('Mã phòng', '').replace(/\s/g, '')

  for (const player of players) {
    await player.page.goto(`/?join=${code}`)
    await player.page.getByLabel('Tên của bạn').fill(player.name)
    await player.page.getByRole('button', { name: 'Vào phòng' }).click()
    await player.page.getByRole('button', { name: 'Sẵn sàng', exact: true }).click()
  }
  await expect(host.getByText('Đã sẵn sàng')).toHaveCount(4)
  await host.getByRole('button', { name: /Chốt phòng · 4 người/ }).click()

  // Bộ một Sói + ba Dân tạo một đêm và một vòng vote quyết định được toàn ván.
  await host.getByRole('button', { name: 'Bớt một Tiên tri' }).click()
  await host.getByRole('button', { name: 'Thêm một Dân làng' }).click()
  await host.getByRole('button', { name: /Tiếp tục: chia vai/ }).click()
  await host.getByRole('button', { name: /Chia vai ngẫu nhiên/ }).click()
  await host.getByRole('button', { name: /Gửi vai cho người chơi/ }).click()

  for (const player of players) {
    await player.page.getByRole('button', { name: /Chạm để lật thẻ/ }).click()
    player.role = (await player.page.locator('.flip__name').textContent()) ?? undefined
    await player.page.getByRole('button', { name: /Tôi đã nhớ vai/ }).click()
  }
  const wolf = players.find((player) => player.role === 'Ma sói')!
  const villagers = players.filter((player) => player.role === 'Dân làng')
  expect(villagers).toHaveLength(3)

  await expect(host.getByText('4/4 người đã xem vai').first()).toBeVisible()
  await host.getByRole('button', { name: /Bắt đầu Đêm 1/ }).click()
  await wolf.page.getByRole('button', { name: villagers[0]!.name, exact: true }).click()
  await wolf.page.getByRole('button', { name: 'Xác nhận hành động' }).click()
  await expect(host.getByText('Remote · 1/1 đã gửi')).toBeVisible()
  await host.getByRole('button', { name: 'Khóa lượt và áp dụng' }).click()
  await host.getByRole('button', { name: /Trời sáng/ }).click()
  await curtainGone(host)

  const victim = villagers[0]!
  await expect(victim.page.getByText(/Bạn đã bị loại/)).toBeVisible()
  await host.getByRole('button', { name: 'Bắt đầu thảo luận' }).click()
  const alive = players.filter((player) => player !== victim)
  await alive[0]!.page.getByLabel('Tin nhắn').fill('Bắt đầu thảo luận online')
  await alive[0]!.page.getByRole('button', { name: 'Gửi', exact: true }).click()
  await expect(alive[1]!.page.getByText('Bắt đầu thảo luận online')).toBeVisible()
  await expect(victim.page.getByLabel('Tin nhắn')).toBeDisabled()

  await host.getByRole('button', { name: 'Chuyển sang bỏ phiếu' }).click()
  for (const player of alive) {
    await expect(player.page.getByRole('heading', { name: 'Bỏ phiếu', level: 1 })).toBeVisible()
    await player.page.getByRole('button', { name: wolf.name, exact: true }).click()
    await player.page.getByRole('button', { name: 'Gửi phiếu' }).click()
    await expect(player.page.getByText(/Đã ghi nhận · lần 1/)).toBeVisible()
  }
  await expect(victim.page.getByRole('heading', { name: 'Bỏ phiếu', level: 1 })).toBeVisible()
  await expect(victim.page.getByRole('button', { name: 'Gửi phiếu' })).toHaveCount(0)

  await expect(host.getByText('Remote · 3/3 đã gửi')).toBeVisible()
  await host.getByRole('button', { name: 'Khóa lượt và áp dụng' }).click()
  await expect(alive[0]!.page.getByRole('heading', { name: 'Kết quả bỏ phiếu' })).toBeVisible()
  await expect(alive[0]!.page.getByText(`${wolf.name}: 3 phiếu`)).toBeVisible()
  await host.getByRole('button', { name: `Loại ${wolf.name}` }).click()
  await host.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận loại' }).click()
  await host.getByRole('alertdialog').getByRole('button', { name: 'Công bố kết quả' }).click()

  for (const player of players)
    await expect(
      player.page.getByRole('heading', { name: 'Phe Dân làng chiến thắng' }),
    ).toBeVisible()
})
