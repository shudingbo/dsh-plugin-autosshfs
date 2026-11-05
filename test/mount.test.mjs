import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { mountEntry, umountEntry } from '../host/sshfs.js'

/**
 * Write one executable shell stub.
 * @param {string} file - target path.
 * @param {string} body - shell body.
 * @returns {Promise<string>} the path.
 */
async function stub(file, body) {
  await fs.writeFile(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  return file
}

/** Dependencies with a working mount command, for the success paths. */
function dependencies(overrides = {}) {
  return {
    platform: 'linux',
    supported: true,
    root: false,
    sshfs: { present: true, path: '/usr/bin/sshfs', version: '3.7.3' },
    tools: { umount: '/usr/bin/umount' },
    fuse: { device: true, conf: { present: true, enabled: true, path: '/etc/fuse.conf' } },
    ...overrides,
  }
}

test('mountEntry creates the mount point and reports success', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'autosshfs-mount-'))
  try {
    const sshfs = await stub(path.join(directory, 'sshfs'), 'exit 0')
    const mount = path.join(directory, 'mnt', 'data')
    const result = await mountEntry({
      item: { name: 'a', host: 'h', user: 'me', remotePath: '/r', mount, allowOther: false, extraOptions: [] },
      platform: 'linux',
      dependencies: dependencies({ sshfs: { present: true, path: sshfs, version: 'stub' } }),
      mountEntries: [],
    })
    assert.equal(result.ok, true)
    assert.equal(result.code, 'mounted')
    assert.equal((await fs.stat(mount)).isDirectory(), true, 'the mount point directory is created')
    assert.deepEqual(result.attempts.map(attempt => attempt.ok), [true])
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('mountEntry retries without allow_other when the backend rejects it', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'autosshfs-mount-'))
  try {
    const sshfs = await stub(path.join(directory, 'sshfs'), [
      'case "$*" in',
      '  *allow_other*) echo "fusermount3: option allow_other only allowed if user_allow_other is set in /etc/fuse.conf" >&2; exit 1 ;;',
      'esac',
      'exit 0',
    ].join('\n'))
    const result = await mountEntry({
      item: { name: 'a', host: 'h', user: 'me', remotePath: '/r', mount: path.join(directory, 'mnt'), allowOther: true, extraOptions: [] },
      platform: 'linux',
      dependencies: dependencies({ sshfs: { present: true, path: sshfs, version: 'stub' } }),
      mountEntries: [],
    })
    assert.equal(result.ok, true)
    assert.equal(result.code, 'mounted-without-allow-other')
    assert.equal(result.attempts.length, 2)
    assert.equal(result.attempts[0].ok, false)
    assert.equal(result.attempts[1].ok, true)
    assert.equal(result.warnings[0].code, 'allow-other-fallback')
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('mountEntry reports an already mounted entry without running sshfs', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'autosshfs-mount-'))
  try {
    const mount = path.join(directory, 'mnt')
    const result = await mountEntry({
      item: { name: 'a', host: 'h', user: 'me', remotePath: '/r', mount, allowOther: false, extraOptions: [] },
      platform: 'linux',
      dependencies: dependencies({ sshfs: { present: false } }),
      mountEntries: [{ source: 'me@h:/r', mountPoint: mount, fstype: 'fuse.sshfs', options: ['rw'] }],
    })
    assert.equal(result.ok, true)
    assert.equal(result.code, 'already-mounted')
    assert.deepEqual(result.attempts, [])
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('mountEntry refuses to use sshfs when the binary is absent', async () => {
  const result = await mountEntry({
    item: { name: 'a', host: 'h', user: 'me', remotePath: '/r', mount: '/mnt/a', allowOther: true, extraOptions: [] },
    platform: 'linux',
    dependencies: dependencies({ sshfs: { present: false } }),
    mountEntries: [],
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'sshfs-missing')
  assert.match(result.hint, /apt-get|package manager/u)
})

test('umountEntry walks the ladder and reports a lazy unmount', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'autosshfs-umount-'))
  try {
    const umount = await stub(path.join(directory, 'umount'), [
      'case " $* " in',
      '  *" -l "*) exit 0 ;;',
      '  *) echo "umount: target is busy" >&2; exit 32 ;;',
      'esac',
    ].join('\n'))
    const fusermount = await stub(path.join(directory, 'fusermount3'), 'echo "fusermount: entry not found" >&2; exit 1')
    const result = await umountEntry({
      item: { name: 'a', mount: '/mnt/a' },
      platform: 'linux',
      dependencies: dependencies({ tools: { umount, fusermount } }),
      mountEntries: [{ source: 'me@h:/r', mountPoint: '/mnt/a', fstype: 'fuse.sshfs', options: ['rw'] }],
    })
    assert.equal(result.ok, true)
    assert.equal(result.code, 'unmounted-lazy')
    assert.equal(result.attempts.length, 4)
    assert.equal(result.warnings[0].code, 'lazy-umount')
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('umountEntry explains a busy mount point when every attempt fails', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'autosshfs-umount-'))
  try {
    const umount = await stub(path.join(directory, 'umount'), 'echo "umount: /mnt/a: target is busy" >&2; exit 32')
    const result = await umountEntry({
      item: { name: 'a', mount: '/mnt/a' },
      platform: 'linux',
      dependencies: dependencies({ tools: { umount } }),
      mountEntries: [{ source: 'me@h:/r', mountPoint: '/mnt/a', fstype: 'fuse.sshfs', options: ['rw'] }],
    })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'umount-busy')
    assert.match(result.hint, /fuser/u)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('umountEntry is a no-op when the entry is not mounted', async () => {
  const result = await umountEntry({
    item: { name: 'a', mount: '/mnt/a' },
    platform: 'linux',
    dependencies: dependencies(),
    mountEntries: [],
  })
  assert.equal(result.ok, true)
  assert.equal(result.code, 'not-mounted')
})
