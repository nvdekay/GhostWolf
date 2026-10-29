import { expect, test, type Locator, type Page } from './fixtures'
import { boardIdle, curtainGone } from './helpers'

// Chơi ngẫu nhiên trọn ván 10 người (đủ vai đặc biệt + Trưởng làng) để bắt chỗ kẹt luồng / lỗi UI.
const NAMES = ['Một', 'Hai', 'Ba', 'Bốn', 'Năm', 'Sáu', 'Bảy', 'Tám', 'Chín', 'Mười']
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]!

/** Ảnh chụp trạng thái nhìn thấy được của bàn quản trò. */
const signature = (page: Page) =>
  page.evaluate(() => {
    const text = (s: string) => document.querySelector(s)?.textContent?.trim() ?? ''
    const count = (s: string) => document.querySelectorAll(s).length
    return [
      text('.board-top__label'),
      text('.board-top__sub'),
      text('.panel-card__foot .btn-ink'),
      count('.seat[data-dead="true"]'),
      [...document.querySelectorAll('.seat[data-picked="true"]')]
        .map((e) => e.getAttribute('aria-label'))
        .join(','),
      text('[role="dialog"], [role="alertdialog"]'),
      text('.votes__foot'),
      text('.vote-result'),
      count('.result'),
      count('.sheet'),
    ].join('|')
  })

const idle = boardIdle

/** Bấm rồi chờ tới khi bàn thật sự đổi (thay cho sleep cố định); không đổi = kẹt luồng. */
async function step(page: Page, target: Locator, log: string[]) {
  await idle(page)
  const before = await signature(page)
  await target.click()
  await expect
    .poll(() => signature(page), {
      timeout: 10_000,
      message: `Kẹt ở "${before}"\n${log.join('\n')}`,
    })
    .not.toBe(before)
  await curtainGone(page)
}

async function dialogStep(page: Page, log: string[]) {
  // Hộp thoại xác nhận tự đóng khi lệnh xong: chờ hết bận rồi mới xem còn hộp thoại không.
  await idle(page)
  const dlg = page.locator('[role="dialog"], [role="alertdialog"]').first()
  if (!(await dlg.count())) return false
  const title = (await dlg.innerText()).split('\n')[0]
  const publish = dlg.getByRole('button', { name: 'Công bố kết quả' })
  if (await publish.count()) {
    log.push('THẮNG: ' + title)
    await step(page, publish, log)
    return true
  }
  const choices = dlg.getByRole('button').filter({ hasNotText: /Hoàn tác|Hủy|Đóng/ })
  // Nút trong hộp thoại tắt khi đang gửi lệnh: chờ bật lại rồi mới chọn.
  await expect(choices.first()).toBeEnabled({ timeout: 15_000 })
  const enabled = []
  for (const b of await choices.all()) if (await b.isEnabled()) enabled.push(b)
  const b = pick(enabled)
  log.push(`hộp thoại "${title}" → ${(await b.textContent())?.trim()}`)
  await step(page, b, log)
  return true
}

test('chơi ngẫu nhiên trọn ván 10 người', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  const log: string[] = []

  await page.setViewportSize({ width: 1280, height: 860 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Tạo ván mới' }).click()
  await page.getByRole('button', { name: /Quản trò/ }).click()
  await page.getByRole('button', { name: /Tạo phòng và lấy mã/ }).click()
  for (const n of NAMES) {
    await page.getByLabel('Thêm người không dùng điện thoại').fill('Người ' + n)
    await page.getByRole('button', { name: 'Thêm', exact: true }).click()
    await expect(page.getByText('Người ' + n, { exact: true })).toBeVisible()
  }
  await page.getByRole('button', { name: /Chốt phòng/ }).click()
  await expect(page.getByText('Khớp 10/10 người').first()).toBeVisible()
  await page.getByRole('button', { name: /Tiếp tục: chia vai/ }).click()
  await page.getByRole('button', { name: /Chia vai ngẫu nhiên/ }).click()
  await page.getByRole('button', { name: /Gửi vai cho người chơi/ }).click()
  await page.getByRole('button', { name: /Bắt đầu Đêm 1/ }).click()
  await page.getByRole('button', { name: 'Vẫn bắt đầu' }).click()
  await expect(page.locator('.board-top__label')).toHaveText('Đêm 1')
  await curtainGone(page)

  let chiefSet = false
  for (let i = 0; i < 300; i++) {
    if (await page.locator('.result').count()) break
    if (await dialogStep(page, log)) continue
    await idle(page)
    const phase = (await page.locator('.board-top__label').textContent()) ?? ''
    const primary = page.locator('.panel-card__foot .btn-ink').first()
    const label = (await primary.count()) ? ((await primary.textContent()) ?? '').trim() : ''

    if (phase.startsWith('Đêm')) {
      if (await primary.isDisabled()) {
        const free = await page.locator('.seat[data-dimmed="false"][data-picked="false"]').all()
        expect(free.length, `Không còn ai để chọn ở "${label}"`).toBeGreaterThan(0)
        await step(page, pick(free), log)
        continue
      }
      log.push(`${phase}: ${label}`)
      await step(page, primary, log)
      continue
    }

    // Ban ngày
    if (phase === 'Ngày 1' && !chiefSet && label === 'Bắt đầu thảo luận') {
      chiefSet = true
      const alive = await page.locator('.seat[data-dead="false"]').all()
      await step(page, pick(alive), log)
      const set = page.getByRole('button', { name: /Đặt làm Trưởng làng/ })
      if (await set.count()) {
        await set.click()
        log.push('đặt Trưởng làng')
      } else await page.keyboard.press('Escape')
      await expect(page.locator('.sheet')).toHaveCount(0)
      continue
    }
    if (label === 'Xem kết quả' || label === 'Chưa có phiếu') {
      const plus = await page.getByRole('button', { name: /^Thêm phiếu cho / }).all()
      const target = pick(plus)
      await step(page, target, log)
      await step(page, target, log)
      const sum = (await page.locator('.votes__foot .tabular').textContent()) ?? ''
      if (/vượt/.test(sum))
        await step(page, page.getByRole('button', { name: /^Bớt phiếu cho / }).first(), log)
      await step(page, page.locator('.panel-card__foot .btn-ink', { hasText: 'Xem kết quả' }), log)
      continue
    }
    const elim = page.locator('.panel-card__foot .btn-ink', { hasText: /^Loại / })
    if (await elim.count()) {
      log.push(`${phase}: ${(await elim.textContent())?.trim()}`)
      await step(page, elim, log)
      continue
    }
    const tie = page.getByRole('button', { name: 'Bỏ phiếu lại giữa những người hòa' })
    if (await tie.count()) {
      await step(page, page.getByRole('button', { name: 'Hôm nay không ai bị loại' }).first(), log)
      continue
    }
    if (label) {
      log.push(`${phase}: ${label}`)
      await step(page, primary, log)
    }
  }
  await expect(page.locator('.result')).toBeVisible()
  const title = await page.locator('.result h1').textContent()
  console.log(`KẾT QUẢ: ${title}\n` + log.join('\n'))
  expect(errors).toEqual([])
})
