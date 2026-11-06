import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const assetsDir = new URL('../dist/assets/', import.meta.url)
const files = (await readdir(assetsDir)).filter((name) => name.endsWith('.js'))
const entry = files.find((name) => name.startsWith('index-'))
if (!entry) throw new Error('Không tìm thấy entry JavaScript trong dist/assets. Chạy build trước.')

const entryBytes = (await stat(join(assetsDir.pathname, entry))).size
const budgetBytes = 500_000
if (entryBytes > budgetBytes)
  throw new Error(`Entry bundle ${entryBytes} B vượt budget ${budgetBytes} B.`)
if (files.length < 7)
  throw new Error(
    `Chỉ có ${files.length} JavaScript chunk; route code-splitting có thể đã regression.`,
  )

console.log(
  JSON.stringify({
    ok: true,
    entry,
    entryBytes,
    budgetBytes,
    javascriptChunks: files.length,
  }),
)
