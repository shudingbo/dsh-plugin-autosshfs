import assert from 'node:assert/strict'
import test from 'node:test'

import {
  expandHome,
  findMountEntry,
  parseDarwinMounts,
  parseLinuxMounts,
  parseVersion,
  unescapeMountField,
} from '../host/system.js'
import { buildMountArgv, classifyMountFailure } from '../host/sshfs.js'

test('parseLinuxMounts decodes /proc/self/mounts escapes', () => {
  const entries = parseLinuxMounts([
    'sysfs /sys sysfs rw,nosuid,nodev,noexec,relatime 0 0',
    'me@example.com:/srv/data /home/me/my\\040data fuse.sshfs rw,nosuid,nodev,relatime,user_id=1000,allow_other 0 0',
    '',
  ].join('\n'))
  assert.equal(entries.length, 2)
  assert.equal(entries[1].source, 'me@example.com:/srv/data')
  assert.equal(entries[1].mountPoint, '/home/me/my data')
  assert.equal(entries[1].fstype, 'fuse.sshfs')
  assert.ok(entries[1].options.includes('allow_other'))
})

test('parseDarwinMounts reads BSD mount output', () => {
  const entries = parseDarwinMounts([
    '/dev/disk3s1s1 on / (apfs, local, read-only, journaled)',
    'me@example.com:/srv/data on /Users/me/data (macfuse, nodev, nosuid, synchronous, mounted by me)',
    'junk line without separator',
  ].join('\n'))
  assert.equal(entries.length, 2)
  assert.equal(entries[0].mountPoint, '/')
  assert.equal(entries[1].source, 'me@example.com:/srv/data')
  assert.equal(entries[1].mountPoint, '/Users/me/data')
  assert.equal(entries[1].fstype, 'macfuse')
  assert.ok(entries[1].options.includes('mounted by me'))
})

test('unescapeMountField leaves unknown escapes intact', () => {
  assert.equal(unescapeMountField('a\\040b'), 'a b')
  assert.equal(unescapeMountField('a\\134b'), 'a\\b')
  assert.equal(unescapeMountField('a\\777b'), 'a\\777b')
})

test('findMountEntry matches an exact mount point, not a prefix', () => {
  const entries = parseLinuxMounts([
    'x /mnt/a fuse.sshfs rw 0 0',
    'y /mnt/ab fuse.sshfs rw 0 0',
  ].join('\n'))
  assert.equal(findMountEntry(entries, '/mnt/ab')?.source, 'y')
  assert.equal(findMountEntry(entries, '/mnt/a')?.source, 'x')
  assert.equal(findMountEntry(entries, '/mnt/missing'), undefined)
})

test('expandHome only rewrites a leading home reference', () => {
  assert.ok(expandHome('~/x').endsWith('/x'))
  assert.equal(expandHome('/abs/~/x'), '/abs/~/x')
})

test('parseVersion reads sshfs output', () => {
  assert.equal(parseVersion('SSHFS version 3.7.3\nFUSE library version: 3.14.0'), '3.7.3')
  assert.equal(parseVersion('fusermount3 version: 3.14.0'), '3.14.0')
  assert.equal(parseVersion('no version here'), undefined)
})

test('buildMountArgv mirrors the CLI options on Linux', () => {
  const item = {
    name: 'a',
    host: 'example.com',
    port: 2222,
    user: 'me',
    password: 'secret',
    IdentityFile: '/home/me/.ssh/id_ed25519',
    remotePath: '/srv/data',
    mount: '/mnt/data',
    allowOther: true,
    uid: '1000',
    gid: '1000',
    extraOptions: ['reconnect'],
  }
  assert.deepEqual(buildMountArgv({ sshfsPath: '/usr/bin/sshfs', platform: 'linux', item }), [
    '/usr/bin/sshfs',
    '-p', '2222',
    '-o', 'IdentityFile=/home/me/.ssh/id_ed25519',
    '-o', 'password_stdin',
    '-o', 'allow_other',
    '-o', 'default_permissions',
    '-o', 'uid=1000',
    '-o', 'gid=1000',
    '-o', 'reconnect',
    'me@example.com:/srv/data',
    '/mnt/data',
  ])
})

test('buildMountArgv omits the user prefix and default_permissions where they do not belong', () => {
  const item = { host: 'h', port: 22, user: '', remotePath: '/r', mount: '/mnt/a', allowOther: false, extraOptions: [] }
  assert.deepEqual(buildMountArgv({ sshfsPath: '/opt/homebrew/bin/sshfs', platform: 'darwin', item }), [
    '/opt/homebrew/bin/sshfs',
    '-p', '22',
    'h:/r',
    '/mnt/a',
  ])
})

test('classifyMountFailure maps stderr to a stable code', () => {
  assert.equal(classifyMountFailure('read: Connection refused').code, 'connection-failed')
  assert.equal(classifyMountFailure('read: Connection reset by peer').code, 'connection-failed')
  assert.equal(classifyMountFailure("Permission denied (publickey).").code, 'auth-failed')
  assert.equal(classifyMountFailure('Host key verification failed.').code, 'host-key')
  assert.equal(classifyMountFailure('fuse: device not found, try \'modprobe fuse\' first').code, 'fuse-unavailable')
  assert.equal(classifyMountFailure("fuse: unknown option(s): `-o allow_other'").code, 'user-allow-other')
  assert.equal(classifyMountFailure('mount point is not empty').code, 'mount-point-not-empty')
  assert.equal(classifyMountFailure('something unexpected').code, 'mount-failed')
  assert.ok(classifyMountFailure('fuse: device not found').hint.includes('modprobe'))
})
