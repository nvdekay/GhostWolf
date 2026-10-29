import { appendFile } from 'node:fs/promises'

const required = (name) => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`)
  return value.replace(/\/$/, '')
}

const timedFetch = async (url, init = {}) => {
  const started = performance.now()
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10_000),
  })
  return { response, ms: Math.round(performance.now() - started) }
}

const readJson = async (url, serviceKey) => {
  const { response, ms } = await timedFetch(url, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  if (!response.ok) throw new Error(`${url} trả HTTP ${response.status}`)
  return { data: await response.json(), ms }
}

const main = async () => {
  const productionUrl = required('PRODUCTION_URL')
  const supabaseUrl = required('SUPABASE_URL')
  const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY')
  const maxExpiredPrompts = Number(process.env.MAX_EXPIRED_PROMPTS_24H ?? 20)
  const failures = []

  const site = await timedFetch(productionUrl, { redirect: 'follow' })
  if (!site.response.ok) failures.push(`frontend HTTP ${site.response.status}`)
  for (const header of [
    'content-security-policy',
    'strict-transport-security',
    'x-content-type-options',
  ]) {
    if (!site.response.headers.has(header)) failures.push(`frontend thiếu header ${header}`)
  }

  const functions = {}
  for (const name of ['game-command', 'player-command']) {
    const probe = await timedFetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: 'OPTIONS',
      headers: { Origin: productionUrl },
    })
    functions[name] = { status: probe.response.status, ms: probe.ms }
    if (!probe.response.ok) failures.push(`${name} HTTP ${probe.response.status}`)
  }

  const metricsResult = await readJson(`${supabaseUrl}/rest/v1/rpc/gw_remote_metrics`, serviceKey)
  const cronResult = await readJson(`${supabaseUrl}/rest/v1/rpc/gw_cron_health`, serviceKey)
  const metrics = metricsResult.data
  const cron = cronResult.data

  if (!cron.scheduled || !cron.active) failures.push('retention cron không active')
  if (cron.last_status && !['succeeded', 'running'].includes(cron.last_status))
    failures.push(`retention cron gần nhất: ${cron.last_status}`)
  if (Number(metrics.expired_prompts_24h) > maxExpiredPrompts)
    failures.push(`expired prompts 24h ${metrics.expired_prompts_24h} > ${maxExpiredPrompts}`)

  const report = {
    checked_at: new Date().toISOString(),
    ok: failures.length === 0,
    frontend: { status: site.response.status, ms: site.ms },
    functions,
    rpc_ms: { metrics: metricsResult.ms, cron: cronResult.ms },
    metrics,
    cron,
    failures,
  }
  console.log(JSON.stringify(report, null, 2))
  if (process.env.GITHUB_STEP_SUMMARY) {
    const funnel = metrics.funnel_24h ?? {}
    const created = Number(funnel.created ?? 0)
    const percent = (value) => (created ? `${Math.round((Number(value) / created) * 100)}%` : '—')
    const rows = [
      ['Tạo phòng', funnel.created, percent(funnel.created)],
      ['Có người join', funnel.joined, percent(funnel.joined)],
      ['Ready', funnel.ready, percent(funnel.ready)],
      ['Bắt đầu', funnel.started, percent(funnel.started)],
      ['Hoàn tất', funnel.finished, percent(funnel.finished)],
    ]
    const summary = [
      '## Ghostwolf production health',
      '',
      `- Checked: ${report.checked_at}`,
      `- Status: ${report.ok ? '✅ healthy' : '❌ failed'}`,
      `- Frontend: HTTP ${report.frontend.status} (${report.frontend.ms} ms)`,
      `- Retention cron: ${cron.last_status ?? 'chưa có lần chạy'}`,
      '',
      '### Remote funnel · 24 giờ',
      '',
      '| Giai đoạn | Phòng | Tỷ lệ trên số tạo |',
      '| --- | ---: | ---: |',
      ...rows.map(([stage, count, ratio]) => `| ${stage} | ${Number(count ?? 0)} | ${ratio} |`),
      '',
    ].join('\n')
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summary)
  }
  if (failures.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(
    JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'unknown' }),
  )
  process.exitCode = 1
})
