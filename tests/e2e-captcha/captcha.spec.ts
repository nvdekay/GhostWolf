import { expect, test } from '@playwright/test'

test('Turnstile token bảo vệ anonymous sign-in', async ({ page }) => {
  let captchaToken: unknown
  page.on('request', (request) => {
    if (!request.url().includes('/auth/v1/signup')) return
    const body = request.postDataJSON() as {
      gotrue_meta_security?: { captcha_token?: unknown }
    }
    captchaToken = body.gotrue_meta_security?.captcha_token
  })

  await page.route(
    'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `window.turnstile = {
        render: function (_container, options) {
          setTimeout(function () { options.callback('captcha-e2e-token') }, 500)
          return 'captcha-e2e-widget'
        },
        remove: function () {}
      }`,
      }),
  )

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Ghostwolf' })).toBeVisible()
  await expect(page.getByText('Xác minh kết nối')).toBeVisible()
  await expect(page.getByTestId('turnstile-widget')).toBeAttached()
  await expect(page.getByRole('button', { name: 'Tạo ván mới' })).toBeVisible()
  expect(captchaToken).toBe('captcha-e2e-token')
})
