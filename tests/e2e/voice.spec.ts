import { expect, test, type Browser, type Page } from './fixtures'

async function voicePage(
  browser: Browser,
  width: number,
  blockFirstPlayback = false,
): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height: 844 } })
  await context.addInitScript((shouldBlockFirstPlayback) => {
    if (shouldBlockFirstPlayback) {
      ;(
        window as typeof window & { __ghostwolfAllowAudioPlayback?: boolean }
      ).__ghostwolfAllowAudioPlayback = false
      Object.defineProperty(HTMLMediaElement.prototype, 'play', {
        configurable: true,
        value: () => {
          const allowed = (window as typeof window & { __ghostwolfAllowAudioPlayback?: boolean })
            .__ghostwolfAllowAudioPlayback
          return allowed
            ? Promise.resolve()
            : Promise.reject(new DOMException('Autoplay blocked', 'NotAllowedError'))
        },
      })
    }
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
        ;(
          window as typeof window & { __ghostwolfLastAudioTrack?: MediaStreamTrack }
        ).__ghostwolfLastAudioTrack = output.stream.getAudioTracks()[0]
        return output.stream
      },
    })
  }, blockFirstPlayback)
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

  await player.evaluate(() => {
    const track = (window as typeof window & { __ghostwolfLastAudioTrack?: MediaStreamTrack })
      .__ghostwolfLastAudioTrack
    track?.dispatchEvent(new Event('ended'))
  })
  await expect(playerVoice.getByRole('button', { name: 'Bật mic' })).toBeVisible()
  await expect(hostVoice.getByText('An Voice').locator('..')).toContainText('Đang tắt mic')

  await playerVoice.getByRole('button', { name: 'Bật mic' }).click()
  await expect(playerVoice.getByRole('button', { name: 'Tắt mic' })).toBeVisible()
  await playerVoice.getByRole('button', { name: 'Tắt mic' }).click()
  await expect(hostVoice.getByText('An Voice').locator('..')).toContainText('Đang tắt mic')

  await hostVoice.getByRole('button', { name: 'Bật mic' }).click()
  await expect(playerVoice.getByLabel('Âm thanh từ Quản trò')).toBeAttached()

  await playerVoice.getByRole('button', { name: 'Rời voice' }).click()
  await expect(playerVoice.getByRole('button', { name: 'Tham gia voice' })).toBeVisible()
  await expect(hostVoice.getByText('1 người đang tham gia')).toBeVisible()
})

test('voice reconnect sau khi người chơi reload không tạo session trùng', async ({ browser }) => {
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
  await player.getByLabel('Tên của bạn').fill('An Reconnect')
  await player.getByRole('button', { name: 'Vào phòng' }).click()

  const hostVoice = host.getByRole('region', { name: 'Voice lobby' })
  let playerVoice = player.getByRole('region', { name: 'Voice lobby' })
  await hostVoice.getByRole('button', { name: 'Tham gia voice' }).click()
  await playerVoice.getByRole('button', { name: 'Tham gia voice' }).click()
  await expect(hostVoice.getByText('2 người đang tham gia')).toBeVisible()
  await playerVoice.getByRole('button', { name: 'Bật mic' }).click()
  await expect(hostVoice.getByLabel('Âm thanh từ An Reconnect')).toBeAttached()

  await player.reload()
  playerVoice = player.getByRole('region', { name: 'Voice lobby' })
  await expect(playerVoice.getByRole('button', { name: 'Tham gia voice' })).toBeVisible()
  await playerVoice.getByRole('button', { name: 'Tham gia voice' }).click()
  await expect(hostVoice.getByText('2 người đang tham gia')).toBeVisible()
  await expect(hostVoice.getByText('An Reconnect')).toHaveCount(1)

  await playerVoice.getByRole('button', { name: 'Bật mic' }).click()
  await expect(hostVoice.getByText('An Reconnect').locator('..')).toContainText('Đang bật mic')
  await expect(hostVoice.getByLabel('Âm thanh từ An Reconnect')).toBeAttached()
})

test('voice cho phép phát lại khi trình duyệt chặn autoplay', async ({ browser }) => {
  const host = await voicePage(browser, 1280, true)
  const player = await voicePage(browser, 390)

  await host.goto('/')
  await host.getByRole('button', { name: 'Tạo ván mới' }).click()
  await host.getByRole('button', { name: /Quản trò/ }).click()
  await host.getByRole('radio', { name: /Chơi từ xa/ }).check()
  await host.getByRole('button', { name: /Tạo phòng và lấy mã/ }).click()
  const codeLabel = await host.getByRole('img', { name: /Mã phòng/ }).getAttribute('aria-label')
  const code = codeLabel!.replace('Mã phòng', '').replace(/\s/g, '')

  await player.goto(`/?join=${code}`)
  await player.getByLabel('Tên của bạn').fill('An Autoplay')
  await player.getByRole('button', { name: 'Vào phòng' }).click()

  const hostVoice = host.getByRole('region', { name: 'Voice lobby' })
  const playerVoice = player.getByRole('region', { name: 'Voice lobby' })
  await hostVoice.getByRole('button', { name: 'Tham gia voice' }).click()
  await playerVoice.getByRole('button', { name: 'Tham gia voice' }).click()
  await expect(hostVoice.getByText('2 người đang tham gia')).toBeVisible()
  await expect(playerVoice.getByText('2 người đang tham gia')).toBeVisible()
  await playerVoice.getByRole('button', { name: 'Bật mic' }).click()
  await expect(hostVoice.getByLabel('Âm thanh từ An Autoplay')).toBeAttached()

  const retry = hostVoice.getByRole('button', { name: 'Phát âm thanh từ An Autoplay' })
  await expect(retry).toBeVisible()
  await host.evaluate(() => {
    ;(
      window as typeof window & { __ghostwolfAllowAudioPlayback?: boolean }
    ).__ghostwolfAllowAudioPlayback = true
  })
  await retry.click()
  await expect(retry).toBeHidden()
})
