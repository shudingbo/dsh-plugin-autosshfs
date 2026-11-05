import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  booleanOr,
  itemView,
  loadConfig,
  maskItem,
  normalizeExtraOptions,
  normalizeItem,
  normalizePort,
  resolveConfigPath,
  saveConfig,
  validateItem,
} from '../host/config.js'

test('resolveConfigPath honors AUTOSSHFS_CONFIG and defaults to ~/.autosshfs.json', () => {
  const previous = process.env.AUTOSSHFS_CONFIG
  try {
    delete process.env.AUTOSSHFS_CONFIG
    assert.deepEqual(resolveConfigPath(), {
      path: path.join(os.homedir(), '.autosshfs.json'),
      source: 'default',
    })
    process.env.AUTOSSHFS_CONFIG = '~/custom/autosshfs.json'
    assert.deepEqual(resolveConfigPath(), {
      path: path.join(os.homedir(), 'custom/autosshfs.json'),
      source: 'env',
    })
    process.env.AUTOSSHFS_CONFIG = '  '
    assert.equal(resolveConfigPath().source, 'default')
  } finally {
    if (previous === undefined) delete process.env.AUTOSSHFS_CONFIG
    else process.env.AUTOSSHFS_CONFIG = previous
  }
})

test('normalizeItem keeps the CLI shape and preserves unknown keys', () => {
  const item = normalizeItem({
    name: '  project ',
    host: ' example.com ',
    user: 'me',
    remotePath: ' /srv/data ',
    mount: ' /mnt/data ',
    extraOptions: 'reconnect, ServerAliveInterval=15',
    reconnect: 3,
  })
  assert.equal(item.name, 'project')
  assert.equal(item.host, 'example.com')
  assert.equal(item.remotePath, '/srv/data')
  assert.equal(item.mount, '/mnt/data')
  assert.equal(item.port, 22, 'a missing port falls back to 22')
  assert.equal(item.enable, false, 'a missing enable stays disabled, like the CLI mount loop')
  assert.equal(item.allowOther, true, 'allowOther defaults to true')
  assert.deepEqual(item.extraOptions, ['reconnect', 'ServerAliveInterval=15'])
  assert.equal(item.reconnect, 3, 'unknown keys round-trip')
  assert.equal(item.uid, undefined)
})

test('booleanOr accepts the spellings a hand-written config may contain', () => {
  assert.equal(booleanOr('no', true), false)
  assert.equal(booleanOr('YES', false), true)
  assert.equal(booleanOr(0, true), false)
  assert.equal(booleanOr(undefined, true), true)
  assert.equal(booleanOr('maybe', false), false)
})

test('normalizePort clamps to a usable port', () => {
  assert.equal(normalizePort('2222'), 2222)
  assert.equal(normalizePort(0), 22)
  assert.equal(normalizePort(70_000), 22)
  assert.equal(normalizePort('abc'), 22)
})

test('normalizeExtraOptions accepts arrays and delimited strings', () => {
  assert.deepEqual(normalizeExtraOptions(['a', ' b ']), ['a', 'b'])
  assert.deepEqual(normalizeExtraOptions('a b,c'), ['a', 'b', 'c'])
  assert.deepEqual(normalizeExtraOptions(undefined), [])
})

test('validateItem reports the same required fields the CLI needs', () => {
  const valid = normalizeItem({ name: 'a', host: 'h', remotePath: '/r', mount: '/mnt/a', port: 22 })
  assert.deepEqual(validateItem(valid, { list: [] }), {})
  assert.deepEqual(
    validateItem(normalizeItem({}), { list: [] }),
    { name: 'required', host: 'required', remotePath: 'required', mount: 'required' },
  )
  const relative = normalizeItem({ name: 'a', host: 'h', remotePath: '/r', mount: 'mnt/a' })
  assert.equal(validateItem(relative, { list: [] }).mount, 'absolute')
  const duplicate = normalizeItem({ name: 'a', host: 'h', remotePath: '/r', mount: '/mnt/a' })
  assert.equal(validateItem(duplicate, { list: [{ name: 'a', mount: '/mnt/other' }] }).name, 'duplicate')
  assert.equal(validateItem(duplicate, { list: [{ name: 'b', mount: '/mnt/a' }] }).mount, 'duplicate')
  assert.deepEqual(
    validateItem(duplicate, { list: [{ name: 'a', mount: '/mnt/a' }], originalName: 'a' }),
    {},
    'the entry does not collide with itself while editing',
  )
})

test('maskItem hides the password but reports whether one is stored', () => {
  const item = normalizeItem({ name: 'a', host: 'h', remotePath: '/r', mount: '/mnt/a', password: 'secret' })
  const masked = maskItem(item)
  assert.equal(masked.password, undefined)
  assert.equal(masked.hasPassword, true)
  assert.equal(itemView(item, undefined).mounted, false)
  assert.equal(itemView(item, { source: 's', mountPoint: '/mnt/a', fstype: 'fuse.sshfs', options: ['rw', 'allow_other'] }).mounted, true)
})

test('the configuration file round-trips and stays mode 0600', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'autosshfs-config-'))
  const file = path.join(directory, 'nested', '.autosshfs.json')
  try {
    const missing = await loadConfig(file)
    assert.equal(missing.existed, false)
    assert.deepEqual(missing.config.list, [])

    const document = { list: [{ name: 'a', host: 'h', remotePath: '/r', mount: '/mnt/a', password: 'secret' }] }
    await saveConfig(file, document)
    const mode = (await fs.stat(file)).mode & 0o777
    assert.equal(mode, 0o600, 'entries may hold a password, so the file is private')
    const loaded = await loadConfig(file)
    assert.equal(loaded.existed, true)
    assert.equal(loaded.config.list[0].password, 'secret')
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('a malformed configuration file fails with an actionable message', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'autosshfs-bad-'))
  const file = path.join(directory, 'bad.json')
  try {
    await fs.writeFile(file, '{ not json')
    await assert.rejects(loadConfig(file), /cannot parse/u)
    await fs.writeFile(file, '[]')
    await assert.rejects(loadConfig(file), /root value must be a JSON object/u)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
