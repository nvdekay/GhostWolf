import { expect, test, type Browser, type Page } from '@playwright/test'
import { boardIdle } from './helpers'

const DESKTOP = { width: 1280, height: 860 }
const PHONE = { width: 390, height: 844 }
const ROLE_NAMES = ['Dân làng', 'Tiên tri', 'Bảo vệ', 'Phù thủy', 'Thợ săn', 'Cupid', 'Ma sói']

async function newPage(browser: Browser, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return { page, errors }
}

/** Ghi lại mọi phản hồi đọc bảng assignments của một máy. */
function watchAssignments(page: Page) {
  const seen: unknown[][] = []
  page.on('response', async (res) => {
    if (res.url().includes('/rest/v1/assignments') && res.request().method() === 'GET') {
      try {
        seen.push((await res.json()) as unknown[])
      } catch {
        // bỏ qua
      }
    }
  })
  return seen
}

test('quản trò và hai người chơi trên ba thiết bị', async ({ browser }) => {
  const host = await newPage(browser, DESKTOP)
  const p1 = await newPage(browser, PHONE)
  const p2 = await newPage(browser, PHONE)
  const seen1 = watchAssignments(p1.page)
  const seen2 = watchAssignments(p2.page)

  // — Quản trò tạo phòng —
  await host.page.goto('/')
  await host.page.getByRole('button', { name: 'Tạo ván mới' }).click()
  await host.page.getByRole('button', { name: /Quản trò/ }).click()
  await host.page.getByRole('button', { name: /Tạo phòng và lấy mã/ }).click()
  const codeLabel = await host.page
    .getByRole('img', { name: /Mã phòng/ })
    .getAttribute('aria-label')
  const code = codeLabel!.replace('Mã phòng', '').replace(/\s/g, '')
  expect(code).toMatch(/^[A-Z0-9]{6}$/)

  // — Hai người chơi mở link mời —
  for (const [p, name] of [
    [p1.page, 'An'],
    [p2.page, 'Bình'],
  ] as const) {
    await p.goto(`/?join=${code}`)
    await p.getByLabel('Tên của bạn').fill(name)
    await p.getByRole('button', { name: 'Vào phòng' }).click()
    await expect(p.getByRole('heading', { name: 'Đã vào phòng' })).toBeVisible()
  }
  // Tên trùng bị từ chối.
  const dup = await newPage(browser, PHONE)
  await dup.page.goto(`/?join=${code}`)
  await dup.page.getByLabel('Tên của bạn').fill('an')
  await dup.page.getByRole('button', { name: 'Vào phòng' }).click()
  await expect(dup.page.getByRole('alert')).toContainText('Tên này đã có')
  await dup.page.context().close()

  // — Lobby realtime + người không có điện thoại —
  await expect(host.page.getByText('An', { exact: true })).toBeVisible()
  await expect(host.page.getByText('Bình', { exact: true })).toBeVisible()
  let addMemberRequests = 0
  host.page.on('request', (request) => {
    if (request.url().includes('/rpc/host_add_member')) addMemberRequests++
  })
  for (const [index, name] of ['Bà Tư', 'Ông Năm'].entries()) {
    const manualName = host.page.getByLabel('Thêm người không dùng điện thoại')
    await manualName.fill(name)
    if (index === 0) {
      // Enter lặp khi request đầu còn chạy không được gửi RPC lần hai.
      await manualName.press('Enter')
      await manualName.press('Enter')
    } else {
      await host.page.getByRole('button', { name: 'Thêm', exact: true }).click()
    }
    await expect(host.page.getByText(name, { exact: true })).toBeVisible()
    await expect(host.page.getByRole('alert')).toHaveCount(0)
  }
  expect(addMemberRequests).toBe(2)
  await expect(host.page.getByText('4 người trong phòng')).toBeVisible()
  await host.page.getByRole('button', { name: /Chốt phòng/ }).click()
  await expect(p1.page.getByRole('heading', { name: 'Phòng đã chốt' })).toBeVisible()

  // — Bộ vai gợi ý → chia → gửi —
  await expect(host.page.locator('.topbar__title', { hasText: 'Chọn bộ vai' })).toBeVisible()
  await expect(host.page.getByText('Khớp 4/4 người')).toBeVisible()
  await host.page.getByRole('button', { name: /Tiếp tục: chia vai/ }).click()
  await host.page.getByRole('button', { name: /Chia vai ngẫu nhiên/ }).click()
  await expect(
    host.page.getByRole('status', { name: 'Đang xáo và chia vai ngẫu nhiên' }),
  ).toBeVisible()
  await expect(host.page.getByText('Đang chọn vai cho')).toBeVisible()
  await expect(host.page.getByRole('heading', { name: 'Kiểm tra trước khi gửi' })).toBeVisible()
  // Trước khi gửi, máy người chơi chưa nhận được vai.
  await expect(p1.page.getByText('Quản trò đã gửi vai')).toHaveCount(0)
  await host.page.getByRole('button', { name: /Gửi vai cho người chơi/ }).click()
  await expect(host.page.getByRole('heading', { name: 'Đã gửi vai' })).toBeVisible()

  // — Mỗi người chơi xem đúng vai của mình —
  // Thẻ vừa lật úp lại khi rời cửa sổ hoặc chuyển tab.
  await expect(p1.page.getByText('Quản trò đã gửi vai')).toBeVisible()
  const flip = p1.page.getByRole('button', { name: /Chạm để lật thẻ/ })
  await flip.click()
  await expect(p1.page.getByRole('button', { name: /Tôi đã nhớ vai/ })).toBeVisible()
  await p1.page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(flip).toBeVisible()
  await expect(p1.page.getByRole('button', { name: /Tôi đã nhớ vai/ })).toHaveCount(0)
  await flip.click()
  await p1.page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })
  await expect(flip).toBeVisible()

  const roles: string[] = []
  for (const p of [p1.page, p2.page]) {
    await expect(p.getByText('Quản trò đã gửi vai')).toBeVisible()
    await p.getByRole('button', { name: /Chạm để lật thẻ/ }).click()
    const name = await p.locator('.flip__name').textContent()
    expect(ROLE_NAMES).toContain(name)
    roles.push(name!)
    await p.getByRole('button', { name: /Tôi đã nhớ vai/ }).click()
    await expect(p.getByText('Nhấn giữ để xem vai')).toBeVisible()
  }
  // Mỗi lần đọc bảng vai chỉ trả về đúng một dòng (của chính người đó) hoặc không có dòng nào.
  for (const seen of [seen1, seen2]) {
    expect(seen.length).toBeGreaterThan(0)
    seen.forEach((rows) => expect(rows.length).toBeLessThanOrEqual(1))
  }

  // — Quản trò cho hai người không có điện thoại xem trên máy này —
  await expect(host.page.getByText('2/4 người đã xem vai').first()).toBeVisible()
  for (let i = 0; i < 2; i++) {
    await host.page
      .getByRole('button', { name: /Xem trên máy này/ })
      .first()
      .click()
    await host.page.getByRole('button', { name: /Xem vai của tôi/ }).click()
    await host.page.getByRole('button', { name: /Ẩn vai và hoàn tất/ }).click()
    await host.page.getByRole('button', { name: /Quản trò: quay lại/ }).click()
  }
  await expect(host.page.getByText('4/4 người đã xem vai').first()).toBeVisible()
  await host.page.getByRole('button', { name: /Bắt đầu Đêm 1/ }).click()
  await expect(p1.page.getByRole('heading', { name: 'Đêm 1' })).toBeVisible()

  // — Màn hình chung không lộ vai —
  await host.page.getByRole('button', { name: 'Chuyển sang màn hình chung' }).click()
  const board = host.page.locator('.board')
  await expect(board.getByRole('heading', { name: 'Mọi người nhắm mắt' })).toBeVisible()
  const sharedText = await board.innerText()
  for (const r of ROLE_NAMES) expect(sharedText).not.toContain(r)
  await host.page
    .getByRole('button', { name: /màn hình riêng/ })
    .first()
    .click()

  // — Gọi hết các vai trong đêm (chọn người hợp lệ đầu tiên) rồi trời sáng —
  for (let i = 0; i < 8; i++) {
    // Chọn người khi bàn còn bận thì lựa chọn bị xóa lúc dữ liệu mới về: chờ hết bận trước.
    await boardIdle(host.page)
    const primary = host.page.locator('.panel-card__foot .btn-ink')
    const label = (await primary.textContent()) ?? ''
    if (label.includes('Trời sáng')) break
    if (
      (await primary.isDisabled()) &&
      (await host.page.locator('.seat[data-dimmed="false"]').count())
    ) {
      const need = label.includes('Cupid') ? 2 : 1
      for (let k = 0; k < need; k++)
        await host.page.locator('.seat[data-dimmed="false"][data-picked="false"]').first().click()
    }
    // Chờ bước đêm đổi (nhãn nút hoặc "bước x/y") thay cho sleep cố định.
    const state = async () =>
      `${await host.page.locator('.board-top__sub').textContent()}|${await primary.textContent()}`
    const before = await state()
    await primary.click()
    await expect.poll(state).not.toBe(before)
  }
  await host.page.locator('.panel-card__foot .btn-ink', { hasText: 'Trời sáng' }).click()
  await expect(p1.page.getByRole('heading', { name: 'Ngày 1' })).toBeVisible()
  await expect(p2.page.getByRole('heading', { name: 'Ngày 1' })).toBeVisible()

  // — Refresh máy người chơi: vẫn đúng danh tính và vai —
  await p1.page.reload()
  await expect(p1.page.getByRole('heading', { name: 'Ngày 1' })).toBeVisible()
  const hold = p1.page.getByRole('button', { name: /Nhấn giữ để xem vai/ })
  await hold.dispatchEvent('pointerdown')
  await expect(p1.page.locator('.hold__role')).toHaveText(roles[0]!)
  await hold.dispatchEvent('pointerup')
  await expect(p1.page.locator('.hold__role')).toHaveCount(0)

  // — Quản trò kết thúc ván: người chơi thấy kết quả —
  await host.page.getByRole('button', { name: 'Menu ván' }).click()
  await host.page.getByRole('button', { name: 'Kết thúc ván' }).click()
  await host.page.getByRole('radio', { name: 'Kết thúc không phân thắng bại' }).click()
  await host.page.getByRole('button', { name: 'Công bố kết quả' }).click()
  await expect(
    host.page.getByRole('heading', { name: 'Kết thúc không phân thắng bại' }),
  ).toBeVisible()
  await expect(
    p1.page.getByRole('heading', { name: 'Kết thúc không phân thắng bại' }),
  ).toBeVisible()

  expect([...host.errors, ...p1.errors, ...p2.errors]).toEqual([])
})
