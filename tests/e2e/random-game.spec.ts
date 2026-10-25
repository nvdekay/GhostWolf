import { expect, test, type Page } from '@playwright/test'

// Chơi ngẫu nhiên trọn ván 10 người (đủ vai đặc biệt + Trưởng làng) để bắt chỗ kẹt luồng / lỗi UI.
const NAMES = ['Một', 'Hai', 'Ba', 'Bốn', 'Năm', 'Sáu', 'Bảy', 'Tám', 'Chín', 'Mười']
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]!

async function dialogStep(page: Page, log: string[]) {
  const dlg = page.locator('[role="dialog"], [role="alertdialog"]').first()
  if (!(await dlg.count())) return false
  const title = (await dlg.innerText()).split('\n')[0]
  const publish = dlg.getByRole('button', { name: 'Công bố kết quả' })
  if (await publish.count()) {
    log.push('THẮNG: ' + title)
    await publish.click()
    return true
  }
  const buttons = await dlg
    .getByRole('button')
    .filter({ hasNotText: /Hoàn tác|Hủy|Đóng/ })
    .all()
  const enabled = []
  for (const b of buttons) if (await b.isEnabled()) enabled.push(b)
  const b = pick(enabled)
  log.push(`hộp thoại "${title}" → ${(await b.textContent())?.trim()}`)
  await b.click()
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
  await page.waitForTimeout(1800)

  let stuck = 0
  let lastSig = ''
  let chiefSet = false
  for (let i = 0; i < 200; i++) {
    if (await page.locator('.result').count()) break
    await page.waitForTimeout(250)
    if (await dialogStep(page, log)) {
      await page.waitForTimeout(500)
      continue
    }
    const phase = (await page.locator('.board-top__label').textContent()) ?? ''
    const primary = page.locator('.panel-card__foot .btn-ink').first()
    const label = (await primary.count()) ? ((await primary.textContent()) ?? '').trim() : ''
    const sig = phase + '|' + label + '|' + (await page.locator('.seat[data-dead="true"]').count())
    stuck = sig === lastSig ? stuck + 1 : 0
    lastSig = sig
    if (stuck > 6) throw new Error(`Kẹt ở "${sig}"\n${log.join('\n')}`)

    if (phase.startsWith('Đêm')) {
      if (await primary.isDisabled()) {
        const free = await page.locator('.seat[data-dimmed="false"][data-picked="false"]').all()
        if (free.length) await pick(free).click()
        continue
      }
      log.push(`${phase}: ${label}`)
      await primary.click()
      if (label.startsWith('Trời sáng')) await page.waitForTimeout(1800)
      continue
    }

    // Ban ngày
    if (phase === 'Ngày 1' && !chiefSet && label === 'Bắt đầu thảo luận') {
      chiefSet = true
      const alive = await page.locator('.seat[data-dead="false"]').all()
      await pick(alive).click()
      const set = page.getByRole('button', { name: /Đặt làm Trưởng làng/ })
      if (await set.count()) {
        await set.click()
        log.push('đặt Trưởng làng')
      } else await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
      continue
    }
    if (label === 'Xem kết quả' || label === 'Chưa có phiếu') {
      const plus = await page.getByRole('button', { name: /^Thêm phiếu cho / }).all()
      const target = pick(plus)
      await target.click()
      await target.click().catch(() => {})
      const sum = (await page.locator('.votes__foot .tabular').textContent()) ?? ''
      if (/vượt/.test(sum))
        await page
          .getByRole('button', { name: /^Bớt phiếu cho / })
          .first()
          .click()
      await page.locator('.panel-card__foot .btn-ink', { hasText: 'Xem kết quả' }).click()
      continue
    }
    const elim = page.locator('.panel-card__foot .btn-ink', { hasText: /^Loại / })
    if (await elim.count()) {
      log.push(`${phase}: ${(await elim.textContent())?.trim()}`)
      await elim.click()
      continue
    }
    const tie = page.getByRole('button', { name: 'Bỏ phiếu lại giữa những người hòa' })
    if (await tie.count()) {
      await page.getByRole('button', { name: 'Hôm nay không ai bị loại' }).first().click()
      continue
    }
    if (label) {
      log.push(`${phase}: ${label}`)
      await primary.click()
      if (label.startsWith('Đi ngủ')) await page.waitForTimeout(1800)
    }
  }
  await expect(page.locator('.result')).toBeVisible()
  const title = await page.locator('.result h1').textContent()
  console.log(`KẾT QUẢ: ${title}\n` + log.join('\n'))
  expect(errors).toEqual([])
})
