import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { AutosshfsService, mergeEntry } from '../host/service.js'
import { createTool, summarizeResult } from '../host/tool.js'

/** A dependency snapshot that never touches the machine. */
function fakeDependencies(overrides = {}) {
  return {
    platform: 'linux',
    supported: true,
    root: false,
    checkedAt: new Date(0).toISOString(),
    sshfs: { present: true, path: '/usr/bin/sshfs', version: '3.7.3' },
    tools: { mount: '/usr/bin/mount', umount: '/usr/bin/umount', fusermount: '/usr/bin/fusermount3' },
    fuse: { device: true, conf: { present: true, enabled: true, path: '/etc/fuse.conf' } },
    elevation: { root: false, sudo: '/usr/bin/sudo', noPrompt: false },
    installer: {
      kind: 'apt',
      sshfsArgv: ['/usr/bin/sudo', '-n', 'apt-get', 'install', '-y', 'sshfs'],
      allowOtherArgv: ['/usr/bin/sudo', '-n', 'sed', '-i', '-e', 's/^#\\s*user_allow_other/user_allow_other/', '/etc/fuse.conf'],
      sshfsCommand: 'sudo -n apt-get install -y sshfs',
      allowOtherCommand: "sudo -n sed -i -e 's/^#\\s*user_allow_other/user_allow_other/' /etc/fuse.conf",
      canInstallSshfs: false,
      canEnableAllowOther: false,
      guide: [],
    },
    issues: [],
    ...overrides,
  }
}

/**
 * Create a service bound to a temporary configuration file.
 * @param {Record<string, any>} [dependencies] - dependency snapshot override.
 * @returns {Promise<{ service: AutosshfsService, directory: string, configPath: string }>} the fixture.
 */
async function fixture(dependencies = fakeDependencies()) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'autosshfs-service-'))
  const configPath = path.join(directory, 'config.json')
  const previous = process.env.AUTOSSHFS_CONFIG
  process.env.AUTOSSHFS_CONFIG = configPath
  const service = new AutosshfsService({ platform: () => 'linux' })
  service.dependencies = async () => dependencies
  return {
    service,
    directory,
    configPath,
    restore: () => {
      if (previous === undefined) delete process.env.AUTOSSHFS_CONFIG
      else process.env.AUTOSSHFS_CONFIG = previous
    },
  }
}

test('mergeEntry copies only writable fields and refuses prototype keys', () => {
  const merged = mergeEntry(
    { name: 'old', unknownField: 7 },
    { name: 'new', password: null, injected: 'x', __proto__: { poisoned: true } },
  )
  assert.equal(merged.name, 'new')
  assert.equal(merged.password, '')
  assert.equal(merged.unknownField, 7)
  assert.equal(merged.injected, undefined)
  assert.equal(Object.prototype.poisoned, undefined)
})

test('state, add, update, enable, detail, and remove form one round-trip', async () => {
  const { service, directory, configPath, restore } = await fixture()
  try {
    const empty = await service.call('state')
    assert.equal(empty.ok, true)
    assert.equal(empty.data.items.length, 0)
    assert.equal(empty.data.configPath, configPath)
    assert.equal(empty.data.configExists, false)

    const added = await service.call('add', {
      item: {
        name: 'project',
        host: 'example.com',
        user: 'me',
        remotePath: '/srv/data',
        mount: '/mnt/data',
        password: 'secret',
        extraOptions: 'reconnect',
      },
    })
    assert.equal(added.ok, true)
    assert.equal(added.data.item.hasPassword, true)
    assert.equal(added.data.item.password, undefined, 'the password never leaves the Host')

    const stored = JSON.parse(await fs.readFile(configPath, 'utf8'))
    assert.equal(stored.list[0].password, 'secret')
    assert.equal((await fs.stat(configPath)).mode & 0o777, 0o600)

    const duplicate = await service.call('add', { item: { name: 'project', host: 'h', remotePath: '/r', mount: '/mnt/other' } })
    assert.equal(duplicate.ok, false)
    assert.equal(duplicate.error.code, 'validation')
    assert.equal(duplicate.error.fields.name, 'duplicate')

    const relative = await service.call('add', { item: { name: 'other', host: 'h', remotePath: '/r', mount: 'mnt/x' } })
    assert.equal(relative.error.fields.mount, 'absolute')

    const renamed = await service.call('update', { name: 'project', item: { name: 'project-2' } })
    assert.equal(renamed.ok, true)
    assert.equal(renamed.data.item.name, 'project-2')
    assert.equal(renamed.data.item.hasPassword, true, 'omitted fields keep their stored value')

    const cleared = await service.call('update', { name: 'project-2', item: { password: '' } })
    assert.equal(cleared.ok, true)
    assert.equal(cleared.data.item.hasPassword, false)

    const disabled = await service.call('enable', { name: 'project-2', enable: false })
    assert.equal(disabled.ok, true)
    assert.equal(disabled.data.item.enable, false)

    const detail = await service.call('detail', { name: 'project-2' })
    assert.equal(detail.ok, true)
    assert.equal(detail.data.password, undefined)
    assert.equal(detail.data.mount.mounted, false)
    assert.equal(detail.data.index, 0)

    const missing = await service.call('detail', { name: 'nope' })
    assert.equal(missing.ok, false)
    assert.equal(missing.error.code, 'not-found')

    const removed = await service.call('remove', { name: 'project-2' })
    assert.equal(removed.ok, true)
    assert.equal(removed.data.removed, 'project-2')
    assert.deepEqual(JSON.parse(await fs.readFile(configPath, 'utf8')).list, [])
  } finally {
    restore()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('mount reports a missing sshfs instead of pretending to succeed', async () => {
  const missing = fakeDependencies({
    sshfs: { present: false },
    issues: [{ id: 'sshfs-missing', severity: 'error', message: 'no sshfs', installable: false }],
  })
  const { service, directory, restore } = await fixture(missing)
  try {
    await service.call('add', { item: { name: 'a', host: 'h', user: 'me', remotePath: '/r', mount: path.join(os.tmpdir(), 'autosshfs-mnt-a') } })
    const mounted = await service.call('mount', { name: 'a' })
    assert.equal(mounted.ok, false)
    assert.equal(mounted.data.results.length, 1)
    assert.equal(mounted.data.results[0].code, 'sshfs-missing')
    assert.equal(mounted.data.summary.failed, 1)
  } finally {
    restore()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('mount refuses a non-root allow_other mount when /etc/fuse.conf disables it', async () => {
  const disabled = fakeDependencies({
    fuse: { device: true, conf: { present: true, enabled: false, path: '/etc/fuse.conf' } },
  })
  const { service, directory, restore } = await fixture(disabled)
  try {
    await service.call('add', { item: { name: 'a', host: 'h', user: 'me', remotePath: '/r', mount: path.join(os.tmpdir(), 'autosshfs-mnt-b'), allowOther: true } })
    const mounted = await service.call('mount', { name: 'a' })
    assert.equal(mounted.ok, false)
    assert.equal(mounted.data.results[0].code, 'allow-other-disabled')
    assert.match(mounted.data.results[0].hint, /user_allow_other/u)
  } finally {
    restore()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('unmount of an entry that is not mounted is a no-op success', async () => {
  const { service, directory, restore } = await fixture()
  try {
    await service.call('add', { item: { name: 'a', host: 'h', user: 'me', remotePath: '/r', mount: path.join(os.tmpdir(), 'autosshfs-mnt-c') } })
    const unmounted = await service.call('umount', { name: 'a' })
    assert.equal(unmounted.ok, true)
    assert.equal(unmounted.data.results[0].code, 'not-mounted')
  } finally {
    restore()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('an unknown name or action produces a stable error code', async () => {
  const { service, directory, restore } = await fixture()
  try {
    const unknownEntry = await service.call('mount', { name: 'nope' })
    assert.equal(unknownEntry.ok, false)
    assert.equal(unknownEntry.error.code, 'not-found')
    assert.deepEqual(unknownEntry.data.results, [])

    const unknownAction = await service.call('explode')
    assert.equal(unknownAction.ok, false)
    assert.equal(unknownAction.error.code, 'invalid-action')

    const badInstall = await service.call('install', { target: 'nope' })
    assert.equal(badInstall.ok, false)
    assert.equal(badInstall.error.code, 'validation')
  } finally {
    restore()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('a corrupt configuration file surfaces as config-read-failed', async () => {
  const { service, directory, configPath, restore } = await fixture()
  try {
    await fs.writeFile(configPath, '{ oops')
    const state = await service.call('state')
    assert.equal(state.ok, false)
    assert.equal(state.error.code, 'config-read-failed')
  } finally {
    restore()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('the agent tool returns lossless JSON and a rendered summary', async () => {
  const { service, directory, restore } = await fixture()
  try {
    await service.call('add', { item: { name: 'a', host: 'h', user: 'me', remotePath: '/r', mount: '/mnt/a', enable: true } })
    const tool = createTool(service)
    assert.equal(tool.name, 'autosshfs')
    assert.ok(tool.parameters.properties.action.enum.includes('mount'))

    const result = await tool.execute({ action: 'state' })
    assert.equal(result.ok, true)
    assert.equal(typeof result.summary, 'string')
    assert.match(result.summary, /1 entries/u)
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result, 'the value must survive the JSON boundary')

    const rendered = tool.output.render({}, result)
    assert.equal(rendered[0].type, 'text')
    assert.match(rendered[0].text, /autosshfs/u)

    const failed = await tool.execute({ action: 'detail', name: 'missing' })
    assert.equal(failed.ok, false)
    assert.match(failed.summary, /failed/u)
    assert.equal(JSON.parse(JSON.stringify(failed)).ok, false)
    await assert.rejects(tool.execute({ action: 'nope' }), /action must be one of/u)
  } finally {
    restore()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('summarizeResult covers every action shape', () => {
  const mount = summarizeResult('mount', {
    ok: true,
    data: {
      summary: { ok: 1, total: 1 },
      results: [{ name: 'a', mount: '/mnt/a', ok: true, warnings: [{ code: 'lazy-umount' }] }],
    },
  })
  assert.match(mount, /1\/1 succeeded/u)
  assert.match(mount, /\[lazy-umount\]/u)
  assert.match(summarizeResult('remove', { ok: true, data: { removed: 'a' } }), /removed entry a/u)
  assert.match(summarizeResult('check', { ok: true, data: { sshfs: { present: true, version: '3.7.3' }, issues: [] } }), /3\.7\.3/u)
  assert.match(summarizeResult('detail', { ok: true, data: { name: 'a', mounted: false } }), /not mounted/u)
})

test('an index addresses one entry even when names repeat', async () => {
  const { service, directory, restore } = await fixture()
  try {
    await fs.mkdir(path.join(directory), { recursive: true })
    await fs.writeFile(
      path.join(directory, 'config.json'),
      JSON.stringify({
        list: [
          { name: 'dup', host: 'one', user: 'me', remotePath: '/a', mount: '/mnt/a', enable: true },
          { name: 'dup', host: 'two', user: 'me', remotePath: '/b', mount: '/mnt/b', enable: true },
        ],
      }),
    )

    const second = await service.call('detail', { name: 'dup', index: 1 })
    assert.equal(second.ok, true)
    assert.equal(second.data.index, 1)
    assert.equal(second.data.host, 'two')

    const first = await service.call('detail', { name: 'dup' })
    assert.equal(first.data.index, 0)

    const staleIndex = await service.call('detail', { name: 'dup', index: 9 })
    assert.equal(staleIndex.data.index, 0, 'an out-of-range index falls back to the name')

    const wrongName = await service.call('detail', { name: 'other', index: 1 })
    assert.equal(wrongName.ok, false, 'an index that does not carry the given name is not used blindly')

    const disabled = await service.call('enable', { name: 'dup', index: 1, enable: false })
    assert.equal(disabled.ok, true)
    const list = JSON.parse(await fs.readFile(path.join(directory, 'config.json'), 'utf8')).list
    assert.equal(list[0].enable, true)
    assert.equal(list[1].enable, false)

    const updated = await service.call('update', { name: 'dup', index: 1, item: { remotePath: '/c' } })
    assert.equal(updated.ok, true)
    assert.equal(updated.data.item.remotePath, '/c')
    const afterUpdate = JSON.parse(await fs.readFile(path.join(directory, 'config.json'), 'utf8')).list
    assert.equal(afterUpdate[0].remotePath, '/a')
    assert.equal(afterUpdate[1].remotePath, '/c')

    const mounted = await service.call('mount', { name: 'dup', index: 0 })
    assert.equal(mounted.data.results[0].mount, '/mnt/a')

    const removed = await service.call('remove', { name: 'dup', index: 1 })
    assert.equal(removed.ok, true)
    const afterRemove = JSON.parse(await fs.readFile(path.join(directory, 'config.json'), 'utf8')).list
    assert.equal(afterRemove.length, 1)
    assert.equal(afterRemove[0].mount, '/mnt/a')

    const missing = await service.call('update', { item: { host: 'x' } })
    assert.equal(missing.ok, false)
    assert.equal(missing.error.code, 'validation')
  } finally {
    restore()
    await fs.rm(directory, { recursive: true, force: true })
  }
})
