import { handleGameCommand } from './game-command/index.ts'
import { handlePlayerCommand } from './player-command/index.ts'
import { handleVoiceIce } from './voice-ice/index.ts'

const port = Number(Deno.env.get('PORT') ?? 54329)
Deno.serve({ port }, (request) => {
  const path = new URL(request.url).pathname
  if (path.endsWith('/player-command')) return handlePlayerCommand(request)
  if (path.endsWith('/voice-ice')) return handleVoiceIce(request)
  return handleGameCommand(request)
})
