/**
 * Linux and macOS system facts for the Autosshfs Host half: executable lookup,
 * mount-table parsing, and the FUSE permission switches that gate `allow_other`.
 *
 * Only Linux and macOS are supported. Every fact here is observed from the
 * running Host — nothing is assumed from the configuration.
 */

import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { runCommand } from './exec.js'

/** Platforms this plugin supports. */
export const SUPPORTED_PLATFORMS = ['linux', 'darwin']

/**
 * Directory names searched on top of `PATH`, in order.
 * Includes the Homebrew prefixes macOS needs when the Host was started from a
 * GUI context whose `PATH` does not carry them.
 * @param {string} platform - `process.platform`.
 * @returns {readonly string[]} absolute directories.
 */
export function searchDirectories(platform) {
  const common = ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin', '/opt/local/bin']
  const perPlatform = platform === 'darwin'
    ? ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/Library/Filesystems/macfuse.fs/Contents/Resources']
    : ['/snap/bin', '/usr/local/sbin']
  return [...common, ...perPlatform]
}

/**
 * Every directory an executable may live in, `PATH` first.
 * @param {string} platform - `process.platform`.
 * @returns {readonly string[]} absolute directories, de-duplicated.
 */
export function executableDirectories(platform) {
  const fromPath = String(process.env.PATH ?? '')
    .split(path.delimiter)
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
  return [...new Set([...fromPath, ...searchDirectories(platform)])]
}

/**
 * Test whether a path is an executable regular file.
 * @param {string} candidate - absolute path.
 * @returns {Promise<boolean>} true when it can be executed.
 */
export async function isExecutable(candidate) {
  try {
    const stat = await fs.stat(candidate)
    if (!stat.isFile()) return false
    await fs.access(candidate, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Find the first executable among candidate names.
 * Bare names are looked up in the executable search path; entries containing a
 * separator are treated as exact paths.
 * @param {readonly string[]} names - candidate executable names, preferred first.
 * @param {string} platform - `process.platform`.
 * @returns {Promise<string | undefined>} the absolute path, or undefined.
 */
export async function findExecutable(names, platform) {
  const directories = executableDirectories(platform)
  for (const name of names) {
    if (name.includes('/')) {
      if (await isExecutable(name)) return name
      continue
    }
    for (const directory of directories) {
      const candidate = path.join(directory, name)
      if (await isExecutable(candidate)) return candidate
    }
  }
  return undefined
}

/**
 * Whether this process runs as root.
 * @returns {boolean} true for uid 0.
 */
export function isRoot() {
  return typeof process.getuid === 'function' && process.getuid() === 0
}

/**
 * Whether the given platform is supported by this plugin.
 * @param {string} platform - `process.platform`.
 * @returns {boolean} true for Linux and macOS.
 */
export function isSupportedPlatform(platform) {
  return SUPPORTED_PLATFORMS.includes(platform)
}

/**
 * Expand a leading `~` to the current home directory.
 * @param {string} value - configured path.
 * @returns {string} absolute path when it started with `~`.
 */
export function expandHome(value) {
  const text = String(value ?? '')
  if (text === '~') return os.homedir()
  if (text.startsWith('~/')) return path.join(os.homedir(), text.slice(2))
  return text
}

/** `/proc/self/mounts` escapes these four characters as octal. */
const MOUNT_ESCAPES = new Map([
  ['040', ' '],
  ['011', '\t'],
  ['012', '\n'],
  ['134', '\\'],
])

/**
 * Decode one `/proc/self/mounts` field.
 * @param {string} value - raw field.
 * @returns {string} the decoded path.
 */
export function unescapeMountField(value) {
  return String(value ?? '').replace(/\\(040|011|012|134)/gu, (_, code) => MOUNT_ESCAPES.get(code) ?? `\\${code}`)
}

/**
 * Parse `/proc/self/mounts`.
 * @param {string} text - file contents.
 * @returns {Array<{ source: string, mountPoint: string, fstype: string, options: string[] }>} entries.
 */
export function parseLinuxMounts(text) {
  const entries = []
  for (const line of String(text ?? '').split('\n')) {
    if (line.trim().length === 0) continue
    const fields = line.split(' ')
    if (fields.length < 4) continue
    entries.push({
      source: unescapeMountField(fields[0]),
      mountPoint: unescapeMountField(fields[1]),
      fstype: fields[2],
      options: fields[3].split(',').filter(option => option.length > 0),
    })
  }
  return entries
}

/**
 * Parse BSD `/sbin/mount` output, the macOS mount table.
 * Example: `me@host:/remote on /Users/me/mnt (macfuse, nodev, nosuid, mounted by me)`.
 * @param {string} text - `mount` output.
 * @returns {Array<{ source: string, mountPoint: string, fstype: string, options: string[] }>} entries.
 */
export function parseDarwinMounts(text) {
  const entries = []
  for (const rawLine of String(text ?? '').split('\n')) {
    const line = rawLine.trim()
    if (line.length === 0) continue
    const onIndex = line.indexOf(' on ')
    if (onIndex <= 0) continue
    const source = line.slice(0, onIndex)
    const remainder = line.slice(onIndex + 4)
    const optionsIndex = remainder.lastIndexOf(' (')
    if (optionsIndex <= 0 || !remainder.endsWith(')')) continue
    const mountPoint = remainder.slice(0, optionsIndex)
    const options = remainder
      .slice(optionsIndex + 2, -1)
      .split(',')
      .map(option => option.trim())
      .filter(option => option.length > 0)
    entries.push({ source, mountPoint, fstype: options[0] ?? '', options })
  }
  return entries
}

/**
 * Read the current mount table.
 * Linux reads `/proc/self/mounts`; both platforms fall back to the `mount`
 * command when that file is unavailable (containers, restricted sandboxes).
 * @param {string} platform - `process.platform`.
 * @param {{ mount?: string }} tools - resolved `mount` binary, if any.
 * @returns {Promise<{ entries: Array<{ source: string, mountPoint: string, fstype: string, options: string[] }>, source: string }>}
 */
export async function readMountTable(platform, tools = {}) {
  if (platform === 'linux') {
    try {
      const text = await fs.readFile('/proc/self/mounts', 'utf8')
      const entries = parseLinuxMounts(text)
      if (entries.length > 0) return { entries, source: '/proc/self/mounts' }
    } catch {
      // Fall through to the mount command.
    }
  }
  const mountBinary = tools.mount ?? (await findExecutable(['mount'], platform))
  if (mountBinary === undefined) return { entries: [], source: 'unavailable' }
  const result = await runCommand([mountBinary], { timeoutMs: 10_000 })
  const entries = platform === 'darwin' ? parseDarwinMounts(result.stdout) : parseLinuxMounts(result.stdout)
  return { entries, source: mountBinary }
}

/**
 * Find the mount-table entry for one mount point.
 * @param {readonly { mountPoint: string }[]} entries - mount table.
 * @param {string} mountPoint - configured mount point.
 * @returns {{ source: string, mountPoint: string, fstype: string, options: string[] } | undefined} the entry.
 */
export function findMountEntry(entries, mountPoint) {
  const target = path.resolve(expandHome(mountPoint))
  return entries.find(entry => path.resolve(entry.mountPoint) === target)
}

/**
 * Whether `/etc/fuse.conf` enables `user_allow_other`.
 * Non-root users need it before sshfs accepts `-o allow_other`.
 * @param {string} [confPath] - configuration file path.
 * @returns {Promise<{ present: boolean, enabled: boolean, path: string }>} the observation.
 */
export async function inspectFuseConf(confPath = '/etc/fuse.conf') {
  try {
    const text = await fs.readFile(confPath, 'utf8')
    const enabled = text.split('\n').some((line) => {
      const trimmed = line.trim()
      return trimmed.length > 0 && !trimmed.startsWith('#') && trimmed === 'user_allow_other'
    })
    return { present: true, enabled, path: confPath }
  } catch {
    return { present: false, enabled: false, path: confPath }
  }
}

/**
 * The unmount ladder for one platform, most polite first.
 * Only commands whose executable exists are returned.
 * @param {string} platform - `process.platform`.
 * @param {string} mountPoint - absolute mount point.
 * @param {{ umount?: string, fusermount?: string, diskutil?: string }} tools - resolved binaries.
 * @returns {Promise<Array<{ argv: string[], lazy: boolean }>>} attempts in order.
 */
export async function unmountLadder(platform, mountPoint, tools = {}) {
  const target = expandHome(mountPoint)
  const attempts = []
  const push = (argv, lazy = false) => {
    if (argv[0] !== undefined && argv[0].length > 0) attempts.push({ argv, lazy })
  }
  if (platform === 'darwin') {
    push(tools.umount ? [tools.umount, target] : [])
    if (tools.diskutil !== undefined) push([tools.diskutil, 'unmount', 'force', target])
    push(tools.umount ? [tools.umount, '-f', target] : [])
    return attempts
  }
  push(tools.umount ? [tools.umount, target] : [])
  if (tools.fusermount !== undefined) {
    push([tools.fusermount, '-u', target])
    push([tools.fusermount, '-uz', target], true)
  }
  push(tools.umount ? [tools.umount, '-l', target] : [], true)
  return attempts
}

/**
 * Inspect whether this macOS install has a FUSE filesystem provider.
 * @returns {Promise<{ macfuse: boolean, fuseT: boolean }>} the observation.
 */
export async function inspectMacFuse() {
  const exists = async (target) => {
    try {
      await fs.stat(target)
      return true
    } catch {
      return false
    }
  }
  return {
    macfuse: await exists('/Library/Filesystems/macfuse.fs'),
    fuseT: await exists('/Library/Filesystems/fuse-t.fs'),
  }
}

/**
 * Whether the FUSE device is present (Linux only).
 * @returns {Promise<boolean>} true when `/dev/fuse` exists.
 */
export async function hasFuseDevice() {
  try {
    await fs.stat('/dev/fuse')
    return true
  } catch {
    return false
  }
}

/**
 * Parse a version number out of command output.
 * @param {string} text - version output.
 * @returns {string | undefined} `major.minor[.patch]` when present.
 */
export function parseVersion(text) {
  const explicit = /SSHFS version\s+(\d+\.\d+(?:\.\d+)?)/iu.exec(String(text ?? ''))
  if (explicit !== null) return explicit[1]
  const generic = /\b(\d+\.\d+(?:\.\d+)?)\b/u.exec(String(text ?? ''))
  return generic?.[1]
}

/**
 * Read the version of an `sshfs` binary.
 * @param {string} sshfsPath - absolute executable path.
 * @returns {Promise<string | undefined>} the version, when reported.
 */
export async function readSshfsVersion(sshfsPath) {
  const result = await runCommand([sshfsPath, '-V'], { timeoutMs: 8_000 })
  const version = parseVersion(`${result.stderr}\n${result.stdout}`)
  if (version !== undefined) return version
  const fallback = await runCommand([sshfsPath, '--version'], { timeoutMs: 8_000 })
  return parseVersion(`${fallback.stderr}\n${fallback.stdout}`)
}
