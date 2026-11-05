/**
 * Autosshfs — Host half.
 *
 * Owns one {@link AutosshfsService} and hands it to the two callers that need
 * it: the Web UI (over `POST /api/autosshfs/rpc`) and the `autosshfs` agent
 * tool. The configuration file stays `~/.autosshfs.json` (or
 * `$AUTOSSHFS_CONFIG`), byte-compatible with `nrs-tools/lib/autosshfs.js`, so
 * the CLI and this plugin manage the same entries.
 *
 * Both extensions are optional: a profile without `webServer`/`connection` has
 * no browser, so only the tool is registered, and a profile without `tools`
 * registers only the HTTP route.
 */

import { registerApi } from './host/http.js'
import { AutosshfsService } from './host/service.js'
import { createTool } from './host/tool.js'

/** Stable plugin name shown in the Loader. */
export const name = 'autosshfs'

/**@type {AutosshfsService | undefined} */
let sharedService

/**
 * Return the process-wide service instance.
 *
 * The HTTP route and the agent tool are registered on different service
 * contexts, and both must observe the same serialized operation queue.
 * @returns {AutosshfsService} the shared service.
 */
function serviceOf() {
  if (sharedService === undefined) sharedService = new AutosshfsService()
  return sharedService
}

/**
 * Mount the Host half.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @returns {void}
 */
export function apply(ctx) {
  const service = serviceOf()

  ctx.inject(['tools'], (toolCtx) => {
    toolCtx.effect(() => toolCtx.tools.register(createTool(service)), 'autosshfs: agent tool')
  })

  ctx.inject(['webServer', 'connection'], (webCtx) => {
    registerApi(webCtx, service)
  })
}
