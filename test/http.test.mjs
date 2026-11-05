import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import test from 'node:test'

import { handleRpcRequest, RPC_PATH } from '../host/http.js'

/**
 * Build a request stream carrying one body.
 * @param {{ method?: string, body?: string, headers?: Record<string, string> }} input - request shape.
 * @returns {import('node:stream').PassThrough} the fake request.
 */
function request({ method = 'POST', body = '', headers = {} } = {}) {
  const stream = new PassThrough()
  stream.method = method
  stream.headers = { host: '127.0.0.1:3090', 'content-type': 'application/json', ...headers }
  stream.url = RPC_PATH
  stream.end(body)
  return stream
}

/**
 * Build a response that records what the handler wrote.
 * @returns {{ res: Record<string, any>, status: () => number, body: () => string }} the fake response.
 */
function response() {
  const state = { statusCode: 200, headers: {}, chunks: [] }
  const res = {
    writeHead(status, headers) {
      state.statusCode = status
      Object.assign(state.headers, headers ?? {})
      return res
    },
    end(chunk) {
      if (chunk !== undefined) state.chunks.push(String(chunk))
    },
  }
  return {
    res,
    status: () => state.statusCode,
    headers: () => state.headers,
    body: () => state.chunks.join(''),
  }
}

/** A connection stub whose fence accepts everything. */
const trusted = { requestRejection: () => undefined }

test('the route path is the documented /api path', () => {
  assert.equal(RPC_PATH, '/api/autosshfs/rpc')
})

test('an untrusted request is rejected before any dispatch', async () => {
  const output = response()
  let dispatched = 0
  await handleRpcRequest({
    req: request({ body: '{"action":"state"}' }),
    res: output.res,
    service: { call: async () => { dispatched++; return { ok: true } } },
    connection: { requestRejection: () => 401 },
  })
  assert.equal(output.status(), 401)
  assert.equal(dispatched, 0)
})

test('a cross-site origin is refused', async () => {
  const output = response()
  await handleRpcRequest({
    req: request({ body: '{"action":"state"}', headers: { origin: 'http://evil.example' } }),
    res: output.res,
    service: { call: async () => ({ ok: true }) },
    connection: trusted,
  })
  assert.equal(output.status(), 403)
  assert.match(output.body(), /cross-site/u)
})

test('the same origin is accepted', async () => {
  const output = response()
  await handleRpcRequest({
    req: request({ body: '{"action":"state"}', headers: { origin: 'http://127.0.0.1:3090' } }),
    res: output.res,
    service: { call: async (action) => ({ ok: true, action }) },
    connection: trusted,
  })
  assert.equal(output.status(), 200)
})

test('method, content type, and body are validated', async () => {
  const cases = [
    { req: request({ method: 'GET' }), status: 405, pattern: /method not allowed/u },
    { req: request({ headers: { 'content-type': 'text/plain' } }), status: 415, pattern: /application\/json/u },
    { req: request({ body: '{ nope' }), status: 400, pattern: /invalid-json/u },
    { req: request({ body: '{}' }), status: 400, pattern: /action/u },
    { req: request({ body: '[]' }), status: 400, pattern: /JSON object/u },
    { req: request({ body: '{"action":"   "}' }), status: 400, pattern: /action/u },
  ]
  for (const item of cases) {
    const output = response()
    await handleRpcRequest({
      req: item.req,
      res: output.res,
      service: { call: async () => ({ ok: true }) },
      connection: trusted,
    })
    assert.equal(output.status(), item.status, `status for ${JSON.stringify(item.req.body)}`)
    assert.match(output.body(), item.pattern)
  }
})

test('a valid request dispatches the action and its payload', async () => {
  const output = response()
  const seen = []
  await handleRpcRequest({
    req: request({ body: JSON.stringify({ action: 'mount', payload: { name: 'project' } }) }),
    res: output.res,
    service: {
      call: async (action, payload) => {
        seen.push([action, payload])
        return { ok: true, action, data: { summary: { total: 1, ok: 1 } } }
      },
    },
    connection: trusted,
  })
  assert.equal(output.status(), 200)
  assert.deepEqual(seen, [['mount', { name: 'project' }]])
  assert.deepEqual(JSON.parse(output.body()), { ok: true, action: 'mount', data: { summary: { total: 1, ok: 1 } } })
  assert.equal(output.headers()['cache-control'], 'no-store')
})

test('a missing payload becomes an empty object', async () => {
  const output = response()
  let received
  await handleRpcRequest({
    req: request({ body: '{"action":"state"}' }),
    res: output.res,
    service: { call: async (_action, payload) => { received = payload; return { ok: true } } },
    connection: trusted,
  })
  assert.deepEqual(received, {})
})

test('a body over the limit is refused with 413', async () => {
  const output = response()
  const big = JSON.stringify({ action: 'state', payload: { blob: 'x'.repeat(300 * 1024) } })
  await handleRpcRequest({
    req: request({ body: big }),
    res: output.res,
    service: { call: async () => ({ ok: true }) },
    connection: trusted,
  })
  assert.equal(output.status(), 413)
})

test('a service throw becomes a 500 envelope', async () => {
  const output = response()
  await handleRpcRequest({
    req: request({ body: '{"action":"state"}' }),
    res: output.res,
    service: { call: async () => { throw new Error('boom') } },
    connection: trusted,
  })
  assert.equal(output.status(), 500)
  assert.equal(JSON.parse(output.body()).error.message, 'boom')
})
