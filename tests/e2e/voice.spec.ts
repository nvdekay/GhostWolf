import { expect, test, type Browser, type Page } from './fixtures'

async function voicePage(browser: Browser, width: number): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height: 844 } })
  await context.addInitScript(() => {
    const media = navigator.mediaDevices
    if (!media) return
    Object.defineProperty(media, 'getUserMedia', {
      configurable: true,
      value: async () => {
        const AudioContextClass = window.AudioContext
        const audio = new AudioContextClass()
        const oscillator = audio.createOscillator()
        const output = audio.createMediaStreamDestination()
        oscillator.connect(output)
        oscillator.start()
        return output.stream
      },
    })
  })
  return context.newPage()
}

test('voice lobby: join, bật/tắt mic, truyền audio và rời kênh', async ({ browser }) => {
  const host = await voicePage(browser, 1280)
  const player = await voicePage(browser, 390)

  await host.goto('/')
  await host.getByRole('button', { name: 'Tạo ván mới' }).click()
  await host.getByRole('button', { name: /Quản trò/ }).click()
  await host.getByRole('radio', { name: /Chơi từ xa/ }).check()
  await host.getByRole('button', { name: /Tạo phòng và lấy mã/ }).click()
  const codeLabel = await host.getByRole('img', { name: /Mã phòng/ }).getAttribute('aria-label')
  const code = codeLabel!.replace('Mã phòng', '').replace(/\s/g, '')

  await player.goto(`/?join=${code}`)
  await player.getByLabel('Tên của bạn').fill('An Voice')
  await player.getByRole('button', { name: 'Vào phòng' }).click()

  const hostVoice = host.getByRole('region', { name: 'Voice lobby' })
  const playerVoice = player.getByRole('region', { name: 'Voice lobby' })
  await hostVoice.getByRole('button', { name: 'Tham gia voice' }).click()
  await playerVoice.getByRole('button', { name: 'Tham gia voice' }).click()
  await expect(hostVoice.getByText('2 người đang tham gia')).toBeVisible()
  await expect(playerVoice.getByText('2 người đang tham gia')).toBeVisible()

  await playerVoice.getByRole('button', { name: 'Bật mic' }).click()
  await expect(playerVoice.getByRole('button', { name: 'Tắt mic' })).toBeVisible()
  await expect(hostVoice.getByText('An Voice').locator('..')).toContainText('Đang bật mic')
  await expect(hostVoice.getByLabel('Âm thanh từ An Voice')).toBeAttached()

  await playerVoice.getByRole('button', { name: 'Tắt mic' }).click()
  await expect(hostVoice.getByText('An Voice').locator('..')).toContainText('Đang tắt mic')

  await hostVoice.getByRole('button', { name: 'Bật mic' }).click()
  await expect(playerVoice.getByLabel('Âm thanh từ Quản trò')).toBeAttached()

  await playerVoice.getByRole('button', { name: 'Rời voice' }).click()
  await expect(playerVoice.getByRole('button', { name: 'Tham gia voice' })).toBeVisible()
  await expect(hostVoice.getByText('1 người đang tham gia')).toBeVisible()
})
