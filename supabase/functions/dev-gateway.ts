import { handleGameCommand } from './game-command/index.ts'
import { handlePlayerCommand } from './player-command/index.ts'

const port = Number(Deno.env.get('PORT') ?? 54329)
Deno.serve({ port }, (request) => {
  const path = new URL(request.url).pathname
  return path.endsWith('/player-command')
    ? handlePlayerCommand(request)
    : handleGameCommand(request)
})
