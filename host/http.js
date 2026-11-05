/**
 * The HTTP entry point the Web UI half talks to.
 *
 * One exact route (`POST /api/autosshfs/rpc`) under the same browser-trust and
 * cookie fence every other `/api` route uses: `ctx.connection.requestRejection`
 * answers 401/403 for untrusted authorities and unauthenticated browsers, and
 * the same-origin check below rejects a cross-site request that somehow carried
 * the session cookie.
 *
 * The route carries no static files and no HTML: the page is a React component
 * in the Settings panel, so the theme and locale stay the Host's.
 */

/** Exact path of the JSON RPC endpoint. Mirrored in `client.js`. */
export const RPC_PATH = '/api/autosshfs/rpc'

/** Largest accepted request body. Entries are small; anything bigger is a mistake. */
const MAX_BODY_BYTES = 256 * 1024

/**
 * Write one JSON response.
 * @param {import('node:http').ServerResponse} res - response to finish.
 * @param {number} status - HTTP status.
 * @param {unknown} payload - JSON-serializable body.
 * @returns {void}
 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload ?? null)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/**
 * Read and parse a bounded JSON body.
 * @param {import('node:http').IncomingMessage} req - request to read.
 * @returns {Promise<unknown>} the parsed body.
 * @throws {Error} with `code` `too-large` or `invalid-json`.
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('request body is too large'), { code: 'too-large' }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined)
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(Object.assign(new Error('request body is not valid JSON'), { code: 'invalid-json' }))
      }
    })
    req.on('error', (error) => { reject(error) })
  })
}

/**
 * Reject a cross-site request that reached the route with a valid cookie.
 * @param {import('node:http').IncomingMessage} req - request to check.
 * @returns {boolean} true when the request must be rejected.
 */
function isCrossSite(req) {
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '' || origin === 'null') return false
  const host = req.headers.host
  if (typeof host !== 'string' || host === '') return true
  try {
    return new URL(origin).host !== host
  } catch {
    return true
  }
}

/**
 * Answer one RPC request.
 * @param {{ req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, service: { call: (action: string, payload?: Record<string, any>) => Promise<Record<string, any>> }, connection: { requestRejection: (request: unknown) => number | undefined } }} input - request context.
 * @returns {Promise<void>} resolves when the response is written.
 */
export async function handleRpcRequest({ req, res, service, connection }) {
  // Same fence the shipped /api routes use: 403 for an untrusted authority,
  // 401 for a browser without a valid session cookie.
  const rejection = connection.requestRejection(req)
  if (rejection !== undefined) {
    res.writeHead(rejection, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
    return
  }
  if (isCrossSite(req)) {
    sendJson(res, 403, { ok: false, error: { code: 'cross-site', message: 'cross-site requests are not allowed' } })
    return
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST', 'content-type': 'text/plain; charset=utf-8' })
    res.end('method not allowed')
    return
  }
  const essence = String(req.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase()
  if (essence !== 'application/json') {
    sendJson(res, 415, { ok: false, error: { code: 'unsupported-media-type', message: 'content-type must be application/json' } })
    return
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch (error) {
    const code = (error)?.code === 'too-large' ? 'too-large' : 'invalid-json'
    sendJson(res, code === 'too-large' ? 413 : 400, {
      ok: false,
      error: { code, message: String((error)?.message ?? error) },
    })
    return
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    sendJson(res, 400, { ok: false, error: { code: 'invalid-request', message: 'the body must be a JSON object' } })
    return
  }
  const action = (body).action
  if (typeof action !== 'string' || action.trim() === '') {
    sendJson(res, 400, { ok: false, error: { code: 'invalid-request', message: 'the body needs a string "action"' } })
    return
  }
  const payload = (body).payload
  try {
    const envelope = await service.call(action.trim(), payload !== null && typeof payload === 'object' ? payload : {})
    sendJson(res, 200, envelope)
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: { code: 'internal', message: String((error)?.message ?? error) },
    })
  }
}

/**
 * Register the RPC route on the Host context.
 * @param {import('@deepseek-ai/cordis').Context} ctx - context carrying `webServer` and `connection`.
 * @param {{ call: (action: string, payload?: Record<string, any>) => Promise<Record<string, any>> }} service - the Autosshfs service.
 * @returns {() => void} the disposer removing the route.
 */
export function registerApi(ctx, service) {
  const webServer = ctx.get('webServer')
  const connection = ctx.get('connection')
  if (webServer === undefined || connection === undefined) {
    return () => {}
  }
  return ctx.effect(() => webServer.register({
    kind: 'exact',
    path: RPC_PATH,
    handler: (req, res) => handleRpcRequest({ req, res, service, connection }),
  }), 'autosshfs: rpc route')
}
