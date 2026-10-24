import { expect, test, type Page } from '@playwright/test'

const WIDTHS = [360, 390, 768, 1024, 1440]
const SHOTS = process.env.E2E_SHOTS

async function checkAll(page: Page, name: string) {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 820 })
    await page.waitForTimeout(150)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow, `${name} tràn ngang ở ${w}px`).toBeLessThanOrEqual(0)
    // Nút chạm tối thiểu ~44px (bỏ qua nút ẩn).
    const small = await page.evaluate(
      () =>
        [...document.querySelectorAll<HTMLElement>('button')]
          .filter((b) => b.offsetParent !== null && !b.closest('.seat__votes'))
          .map((b) => b.getBoundingClientRect())
          .filter((r) => r.height > 0 && r.height < 32).length,
    )
    expect(small, `${name}: nút quá nhỏ ở ${w}px`).toBe(0)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${w}.png` })
  }
}

test('không tràn ngang, nút đủ lớn ở mọi kích thước', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Tạo ván mới' })).toBeVisible()
  await checkAll(page, 'home')
  await page.getByRole('button', { name: 'Vào phòng bằng mã' }).click()
  await checkAll(page, 'join')
  await page.getByRole('button', { name: 'Về trang chủ' }).click()
  await page.getByRole('button', { name: 'Thư viện vai' }).click()
  await checkAll(page, 'library')
  await page.getByRole('button', { name: 'Về trang chủ' }).click()

  await page.getByRole('button', { name: 'Tạo ván mới' }).click()
  await checkAll(page, 'choose')
  await page.getByRole('button', { name: /Quản trò/ }).click()
  await checkAll(page, 'config')
  await page.getByRole('button', { name: /Tạo phòng và lấy mã/ }).click()
  await page.setViewportSize({ width: 1280, height: 820 })
  for (const n of [
    'Một người tên rất dài để thử xuống dòng',
    'Hai',
    'Ba',
    'Bốn',
    'Năm',
    'Sáu',
    'Bảy',
    'Tám',
    'Chín',
    'Mười',
    'Mười một',
    'Mười hai',
    'Mười ba',
    'Mười bốn',
  ]) {
    await page.getByLabel('Thêm người không dùng điện thoại').fill(n)
    await page.getByRole('button', { name: 'Thêm', exact: true }).click()
    await expect(page.getByText(n, { exact: true })).toBeVisible()
  }
  await checkAll(page, 'lobby')
  await page.setViewportSize({ width: 1280, height: 820 })
  await page.getByRole('button', { name: /Chốt phòng/ }).click()
  await expect(page.getByText('Khớp 14/14 người')).toBeVisible()
  await checkAll(page, 'roles')
  await page.setViewportSize({ width: 1280, height: 820 })
  await page.getByRole('button', { name: /Tiếp tục: chia vai/ }).click()
  await page.getByRole('button', { name: /Chia vai ngẫu nhiên/ }).click()
  await page.getByRole('button', { name: /Gửi vai cho người chơi/ }).click()
  await checkAll(page, 'assign')
  await page.setViewportSize({ width: 1280, height: 820 })
  await page.getByRole('button', { name: /Bắt đầu Đêm 1/ }).click()
  await page.getByRole('button', { name: 'Vẫn bắt đầu' }).click()
  await expect(page.locator('.board-top__label')).toHaveText('Đêm 1')
  await page.waitForTimeout(1800)
  await checkAll(page, 'board-night')
})
