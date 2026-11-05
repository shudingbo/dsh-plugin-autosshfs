/**
 * The `~/.autosshfs.json` configuration store.
 *
 * The file location and shape are unchanged from `nrs-tools/lib/autosshfs.js`,
 * so the CLI tool and this plugin can manage the same entries:
 *
 * ```json
 * { "list": [ { "enable": true, "name": "project", "host": "…", "port": 22,
 *   "user": "…", "password": "", "IdentityFile": "", "remotePath": "/srv",
 *   "mount": "/mnt/project", "allowOther": true } ] }
 * ```
 *
 * Writes are atomic (temporary file + rename) and the file is kept at mode
 * `0600` because entries may carry an SSH password.
 */

import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expandHome } from './system.js'

/** Environment variable that overrides the configuration path, as in the CLI. */
export const CONFIG_ENV = 'AUTOSSHFS_CONFIG'

/** File mode for the configuration file: entries may hold a password. */
export const CONFIG_MODE = 0o600

/** Fields stored as trimmed strings. */
const STRING_FIELDS = ['name', 'host', 'user', 'password', 'IdentityFile', 'remotePath', 'mount']

/**
 * Resolve the configuration file path: `AUTOSSHFS_CONFIG`, else `~/.autosshfs.json`.
 * @returns {{ path: string, source: 'env' | 'default' }} the resolved path and its origin.
 */
export function resolveConfigPath() {
  const fromEnv = process.env[CONFIG_ENV]
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return { path: path.resolve(expandHome(fromEnv.trim())), source: 'env' }
  }
  return { path: path.join(os.homedir(), '.autosshfs.json'), source: 'default' }
}

/**
 * Interpret a boolean-ish configuration value.
 * @param {unknown} value - stored value.
 * @param {boolean} fallback - used when the value is absent or unreadable.
 * @returns {boolean} the interpreted flag.
 */
export function booleanOr(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = String(value).trim().toLowerCase()
  if (['false', '0', 'no', 'off', 'n'].includes(text)) return false
  if (['true', '1', 'yes', 'on', 'y'].includes(text)) return true
  return fallback
}

/**
 * Normalize the port field.
 * @param {unknown} value - stored value.
 * @returns {number} a valid port, falling back to 22.
 */
export function normalizePort(value) {
  const port = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(port) || port <= 0 || port > 65_535) return 22
  return Math.trunc(port)
}

/**
 * Split `extraOptions` (array or comma/space separated string) into option words.
 * @param {unknown} value - stored value.
 * @returns {string[]} non-empty option words.
 */
export function normalizeExtraOptions(value) {
  if (value === undefined || value === null) return []
  const list = Array.isArray(value) ? value : String(value).split(/[, ]+/u)
  return list.map(entry => String(entry).trim()).filter(entry => entry.length > 0)
}

/**
 * Normalize one stored entry without dropping fields this plugin does not know.
 * Unknown keys are preserved so a hand-edited configuration round-trips.
 * @param {Record<string, unknown>} raw - stored entry.
 * @returns {Record<string, any>} the normalized entry.
 */
export function normalizeItem(raw) {
  const source = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  /** @type {Record<string, any>} */
  const item = { ...source }
  for (const field of STRING_FIELDS) {
    const value = source[field]
    item[field] = value === undefined || value === null ? '' : String(value)
  }
  item.name = item.name.trim()
  item.host = item.host.trim()
  item.user = item.user.trim()
  item.remotePath = item.remotePath.trim()
  item.mount = item.mount.trim()
  item.IdentityFile = item.IdentityFile.trim()
  // A missing `enable` is disabled, matching the CLI's mount loop.
  item.enable = booleanOr(source.enable, false)
  // `allowOther` defaults to true, matching the CLI's mount options.
  item.allowOther = booleanOr(source.allowOther, true)
  item.port = normalizePort(source.port)
  item.extraOptions = normalizeExtraOptions(source.extraOptions)
  item.uid = source.uid === undefined || source.uid === null || String(source.uid).trim() === ''
    ? undefined
    : String(source.uid).trim()
  item.gid = source.gid === undefined || source.gid === null || String(source.gid).trim() === ''
    ? undefined
    : String(source.gid).trim()
  return item
}

/**
 * Read the configuration file.
 * @param {string} [file] - configuration path; defaults to {@link resolveConfigPath}.
 * @returns {Promise<{ config: { list: Record<string, any>[], [key: string]: unknown }, existed: boolean, path: string }>}
 * @throws {Error} when the file exists but cannot be read or parsed.
 */
export async function loadConfig(file = resolveConfigPath().path) {
  let text
  try {
    text = await fs.readFile(file, 'utf8')
  } catch (error) {
    if ((error)?.code === 'ENOENT') {
      return { config: { list: [] }, existed: false, path: file }
    }
    throw new Error(`cannot read ${file}: ${(error)?.message ?? error}`)
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`cannot parse ${file}: ${(error)?.message ?? error}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`cannot use ${file}: the root value must be a JSON object with a "list" array`)
  }
  const list = Array.isArray(parsed.list) ? parsed.list : []
  return { config: { ...parsed, list }, existed: true, path: file }
}

/**
 * Write the configuration file atomically, keeping mode 0600.
 * @param {string} file - configuration path.
 * @param {{ list: unknown[], [key: string]: unknown }} config - the whole document.
 * @returns {Promise<void>} resolves once the new file is in place.
 */
export async function saveConfig(file, config) {
  const directory = path.dirname(file)
  await fs.mkdir(directory, { recursive: true })
  const temporary = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  const text = `${JSON.stringify(config, null, 2)}\n`
  try {
    await fs.writeFile(temporary, text, { encoding: 'utf8', mode: CONFIG_MODE })
    await fs.rename(temporary, file)
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {})
    throw new Error(`cannot write ${file}: ${(error)?.message ?? error}`)
  }
  // rename preserves the temporary file's mode; chmod also tightens a file that
  // already existed with looser permissions.
  await fs.chmod(file, CONFIG_MODE).catch(() => {})
}

/**
 * Validate one entry against the rest of the list.
 * @param {Record<string, any>} item - normalized entry.
 * @param {{ list: readonly Record<string, any>[], originalName?: string }} context - sibling entries and the entry's previous name.
 * @returns {Record<string, string>} field → reason code; empty when valid.
 */
export function validateItem(item, context) {
  /** @type {Record<string, string>} */
  const errors = {}
  const siblings = context.list.filter(other => other.name !== context.originalName)
  if (item.name === '') errors.name = 'required'
  else if (siblings.some(other => other.name === item.name)) errors.name = 'duplicate'
  if (item.host === '') errors.host = 'required'
  if (item.remotePath === '') errors.remotePath = 'required'
  if (item.mount === '') {
    errors.mount = 'required'
  } else if (!path.isAbsolute(expandHome(item.mount))) {
    errors.mount = 'absolute'
  } else if (siblings.some(other => other.mount === item.mount)) {
    errors.mount = 'duplicate'
  }
  if (!Number.isInteger(item.port) || item.port < 1 || item.port > 65_535) errors.port = 'range'
  if (item.IdentityFile !== '' && !path.isAbsolute(expandHome(item.IdentityFile))) {
    errors.IdentityFile = 'absolute'
  }
  return errors
}

/**
 * Hide the stored password before a value leaves the Host.
 * @param {Record<string, any>} item - normalized entry.
 * @returns {Record<string, any>} a copy without `password`, plus `hasPassword`.
 */
export function maskItem(item) {
  const { password, ...rest } = item
  return { ...rest, hasPassword: typeof password === 'string' && password.length > 0 }
}

/**
 * The public view of one entry, including live mount state.
 * @param {Record<string, any>} item - normalized entry.
 * @param {{ source: string, mountPoint: string, fstype: string, options: string[] } | undefined} mountEntry - live mount-table row.
 * @returns {Record<string, any>} the entry view.
 */
export function itemView(item, mountEntry) {
  const view = maskItem(item)
  view.mounted = mountEntry !== undefined
  view.mountOptions = mountEntry?.options?.filter(option => option !== 'rw' && option !== 'nosuid' && option !== 'nodev' && option !== 'noexec') ?? []
  view.mountSource = mountEntry?.source ?? undefined
  view.mountFstype = mountEntry?.fstype ?? undefined
  return view
}
