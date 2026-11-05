/**
 * The single Autosshfs operation surface.
 *
 * Both callers — the Web UI through `POST /api/autosshfs/rpc` and the
 * `autosshfs` agent tool — call `call(action, payload)` on the same instance, so
 * permissions, validation, and output stay identical between them.
 *
 * Every action returns a plain JSON value: `{ ok: true, action, data }` or
 * `{ ok: false, action, error: { code, message, hint?, fields? } }`. Expected
 * failures never throw; the caller renders `error.code` with its own locale.
 */

import {
  booleanOr,
  itemView,
  loadConfig,
  maskItem,
  normalizeItem,
  resolveConfigPath,
  saveConfig,
  validateItem,
} from './config.js'
import { inspectDependencies, installDependency } from './deps.js'
import { mountEntry, umountEntry } from './sshfs.js'
import { findMountEntry, readMountTable } from './system.js'

/** How long a dependency snapshot stays fresh before it is re-inspected. */
const DEPENDENCY_TTL_MS = 4_000

/** Fields the UI and the tool may write. Unknown fields in the file are preserved. */
const PATCHABLE_FIELDS = new Set([
  'name',
  'host',
  'port',
  'user',
  'password',
  'IdentityFile',
  'remotePath',
  'mount',
  'enable',
  'allowOther',
  'uid',
  'gid',
  'extraOptions',
])

/** Object keys that must never be written while merging untrusted JSON. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Copy the writable fields of a patch over an existing raw entry.
 * @param {Record<string, unknown>} existing - raw stored entry.
 * @param {Record<string, unknown>} patch - caller-supplied fields.
 * @returns {Record<string, unknown>} the merged raw entry.
 */
export function mergeEntry(existing, patch) {
  const merged = { ...existing }
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (UNSAFE_KEYS.has(key) || !PATCHABLE_FIELDS.has(key)) continue
    if (value === undefined) continue
    if (key === 'password' && value === null) {
      merged.password = ''
      continue
    }
    merged[key] = value
  }
  return merged
}

/**
 * The Autosshfs service: configuration, mount state, and dependency actions.
 */
export class AutosshfsService {
  /** @type {Record<string, any> | undefined} */
  #dependencies
  /** @type {number} */
  #dependenciesAt = 0
  /** @type {Promise<unknown>} */
  #queue = Promise.resolve()

  /**
   * @param {{ platform?: () => string }} [options] - test seams.
   */
  constructor(options = {}) {
    this.platform = options.platform ?? (() => process.platform)
  }

  /**
   * Serialize mutating and mounting operations so two calls cannot interleave.
   * @template T
   * @param {() => Promise<T>} operation - the critical section.
   * @returns {Promise<T>} the operation result.
   */
  #exclusive(operation) {
    const run = this.#queue.then(operation, operation)
    this.#queue = run.then(() => undefined, () => undefined)
    return run
  }

  /**
   * Dependency snapshot, cached briefly so a UI refresh does not re-run probes.
   * @param {boolean} [force] - ignore the cached snapshot.
   * @returns {Promise<Record<string, any>>} the dependencies.
   */
  async dependencies(force = false) {
    const now = Date.now()
    if (!force && this.#dependencies !== undefined && now - this.#dependenciesAt < DEPENDENCY_TTL_MS) {
      return this.#dependencies
    }
    const dependencies = await inspectDependencies({ platform: this.platform() })
    this.#dependencies = dependencies
    this.#dependenciesAt = now
    return dependencies
  }

  /**
   * Read the configuration and the live mount table once.
   * @returns {Promise<{ configPath: string, configSource: string, existed: boolean, config: Record<string, any>, items: Array<Record<string, any>>, mountEntries: Array<Record<string, any>> }>}
   */
  async #snapshot() {
    const resolved = resolveConfigPath()
    const platform = this.platform()
    const loaded = await loadConfig(resolved.path)
    const dependencies = await this.dependencies()
    const table = await readMountTable(platform, dependencies.tools ?? {})
    return {
      configPath: resolved.path,
      configSource: resolved.source,
      existed: loaded.existed,
      config: loaded.config,
      items: loaded.config.list.map(entry => normalizeItem(entry)),
      mountEntries: table.entries,
    }
  }

  /**
   * The whole UI state.
   * @param {boolean} [force] - re-inspect dependencies.
   * @returns {Promise<Record<string, any>>} the state payload.
   */
  async state(force = false) {
    const dependencies = await this.dependencies(force)
    const snapshot = await this.#snapshot()
    const views = snapshot.items.map((item, index) => ({
      ...itemView(item, findMountEntry(snapshot.mountEntries, item.mount)),
      index,
    }))
    return {
      platform: this.platform(),
      supported: dependencies.supported,
      configPath: snapshot.configPath,
      configSource: snapshot.configSource,
      configExists: snapshot.existed,
      dependencies: publicDependencies(dependencies),
      items: views,
      summary: {
        total: views.length,
        enabled: views.filter(item => item.enable).length,
        mounted: views.filter(item => item.mounted).length,
      },
    }
  }

  /**
   * One entry with its live mount details.
   * @param {{ name?: string, index?: number }} target - entry address.
   * @returns {Promise<Record<string, any>>} the entry view.
   */
  async detail(target) {
    const snapshot = await this.#snapshot()
    const found = findTarget(snapshot.items, target)
    if (found === undefined) return { missing: describeTarget(target) }
    const { index } = found
    const item = found.item
    const entry = findMountEntry(snapshot.mountEntries, item.mount)
    const dependencies = await this.dependencies()
    return {
      ...itemView(item, entry),
      index,
      configPath: snapshot.configPath,
      raw: maskItem(normalizeItem(snapshot.config.list[index])),
      dependencies: publicDependencies(dependencies),
      mount: {
        path: item.mount,
        mounted: entry !== undefined,
        source: entry?.source,
        fstype: entry?.fstype,
        options: entry?.options ?? [],
      },
    }
  }

  /**
   * Add one entry.
   * @param {Record<string, unknown>} patch - entry fields.
   * @returns {Promise<Record<string, any>>} the new entry view.
   */
  async add(patch) {
    return this.#exclusive(async () => {
      const resolved = resolveConfigPath()
      const loaded = await loadConfig(resolved.path)
      const item = normalizeItem(mergeEntry({ enable: true, allowOther: true, port: 22 }, patch))
      const errors = validateItem(item, { list: loaded.config.list.map(siblingNames) })
      if (Object.keys(errors).length > 0) return { invalid: errors }
      loaded.config.list.push(item)
      await saveConfig(resolved.path, loaded.config)
      return { item }
    })
  }

  /**
   * Update one entry.
   * @param {{ name?: string, index?: number }} target - entry address.
   * @param {Record<string, unknown>} patch - changed fields.
   * @returns {Promise<Record<string, any>>} the updated entry view.
   */
  async update(target, patch) {
    return this.#exclusive(async () => {
      const resolved = resolveConfigPath()
      const loaded = await loadConfig(resolved.path)
      const found = findTarget(loaded.config.list.map(normalizeItem), target)
      if (found === undefined) return { missing: describeTarget(target) }
      const { index } = found
      const originalName = found.item.name
      const merged = mergeEntry(loaded.config.list[index], patch)
      const item = normalizeItem(merged)
      const siblings = loaded.config.list
        .map(siblingNames)
        .filter((_, siblingIndex) => siblingIndex !== index)
      const errors = validateItem(item, { list: siblings, originalName })
      if (Object.keys(errors).length > 0) return { invalid: errors }
      loaded.config.list[index] = item
      await saveConfig(resolved.path, loaded.config)
      return { item }
    })
  }

  /**
   * Remove one entry.
   * @param {{ name?: string, index?: number }} target - entry address.
   * @returns {Promise<Record<string, any>>} the removed entry name.
   */
  async remove(target) {
    return this.#exclusive(async () => {
      const resolved = resolveConfigPath()
      const loaded = await loadConfig(resolved.path)
      const found = findTarget(loaded.config.list.map(normalizeItem), target)
      if (found === undefined) return { missing: describeTarget(target) }
      const [removed] = loaded.config.list.splice(found.index, 1)
      await saveConfig(resolved.path, loaded.config)
      return { removed: String(removed?.name ?? found.item.name) }
    })
  }

  /**
   * Switch one entry's `enable` flag.
   * @param {{ name?: string, index?: number }} target - entry address.
   * @param {boolean} enable - the new flag.
   * @returns {Promise<Record<string, any>>} the updated entry view.
   */
  async enable(target, enable) {
    return this.#exclusive(async () => {
      const resolved = resolveConfigPath()
      const loaded = await loadConfig(resolved.path)
      const found = findTarget(loaded.config.list.map(normalizeItem), target)
      if (found === undefined) return { missing: describeTarget(target) }
      const index = found.index
      const raw = loaded.config.list[index]
      loaded.config.list[index] = { ...raw, enable: booleanOr(enable, false) }
      await saveConfig(resolved.path, loaded.config)
      return { item: normalizeItem(loaded.config.list[index]) }
    })
  }

  /**
   * Mount one entry, or every enabled entry when no target is given.
   * @param {{ name?: string, index?: number } | undefined} target - entry address.
   * @returns {Promise<Record<string, any>>} per-entry results.
   */
  async mount(target) {
    return this.#exclusive(async () => {
      const dependencies = await this.dependencies()
      const snapshot = await this.#snapshot()
      const targets = selectTargets(snapshot.items, target, item => item.enable === true)
      if (targets.error !== undefined) return emptyResult('mount', targets.error)
      const results = []
      let mountEntries = snapshot.mountEntries
      for (const item of targets.items) {
        if (!hasRequiredFields(item)) {
          results.push({
            name: item.name,
            mount: item.mount,
            ok: false,
            code: 'missing-fields',
            message: 'host, remotePath, and mount are required',
            warnings: [],
            attempts: [],
          })
          continue
        }
        const result = await mountEntry({ item, platform: this.platform(), dependencies, mountEntries })
        results.push(result)
        // Refresh the mount table so a second entry cannot claim a mount point
        // that the previous one just took.
        mountEntries = (await readMountTable(this.platform(), dependencies.tools ?? {})).entries
      }
      return summarize('mount', results)
    })
  }

  /**
   * Unmount one entry, or every mounted entry when no target is given.
   * @param {{ name?: string, index?: number } | undefined} target - entry address.
   * @returns {Promise<Record<string, any>>} per-entry results.
   */
  async umount(target) {
    return this.#exclusive(async () => {
      const dependencies = await this.dependencies()
      const snapshot = await this.#snapshot()
      const mounted = (item) => findMountEntry(snapshot.mountEntries, item.mount) !== undefined
      const targets = selectTargets(snapshot.items, target, mounted)
      if (targets.error !== undefined) return emptyResult('umount', targets.error)
      const results = []
      let mountEntries = snapshot.mountEntries
      for (const item of targets.items) {
        const result = await umountEntry({ item, platform: this.platform(), dependencies, mountEntries })
        results.push(result)
        mountEntries = (await readMountTable(this.platform(), dependencies.tools ?? {})).entries
      }
      return summarize('umount', results)
    })
  }

  /**
   * Install or enable one system dependency.
   * @param {string} target - `sshfs` or `allow_other`.
   * @returns {Promise<Record<string, any>>} the installation report.
   */
  async install(target) {
    const report = await installDependency(target, { platform: this.platform() })
    this.#dependenciesAt = 0
    return report
  }

  /**
   * Dispatch one action.
   * @param {string} action - action name.
   * @param {Record<string, any>} [payload] - action payload.
   * @returns {Promise<Record<string, any>>} the envelope.
   */
  async call(action, payload = {}) {
    try {
      switch (action) {
        case 'state':
          return { ok: true, action, data: await this.state(Boolean(payload?.refresh)) }
        case 'check':
          return { ok: true, action, data: publicDependencies(await this.dependencies(true)) }
        case 'detail': {
          const target = requireTarget(payload)
          const result = await this.detail(target)
          if (result.missing !== undefined) return notFound(result.missing)
          return { ok: true, action, data: result }
        }
        case 'add': {
          const result = await this.add(payload?.item ?? payload)
          if (result.invalid !== undefined) return invalid(action, result.invalid)
          return { ok: true, action, data: { item: maskItem(result.item) } }
        }
        case 'update': {
          const target = requireTarget(payload)
          const result = await this.update(target, payload?.item ?? {})
          if (result.missing !== undefined) return notFound(result.missing)
          if (result.invalid !== undefined) return invalid(action, result.invalid)
          return { ok: true, action, data: { item: maskItem(result.item) } }
        }
        case 'remove': {
          const target = requireTarget(payload)
          const result = await this.remove(target)
          if (result.missing !== undefined) return notFound(result.missing)
          return { ok: true, action, data: result }
        }
        case 'enable': {
          const target = requireTarget(payload)
          const result = await this.enable(target, payload?.enable)
          if (result.missing !== undefined) return notFound(result.missing)
          return { ok: true, action, data: { item: maskItem(result.item) } }
        }
        case 'mount':
        case 'umount': {
          const target = targetFromPayload(payload)
          const result = action === 'mount' ? await this.mount(target) : await this.umount(target)
          return {
            ok: result.ok,
            action,
            data: result,
            ...(result.error === undefined ? {} : { error: result.error }),
          }
        }
        case 'install': {
          const target = String(payload?.target ?? '')
          if (target !== 'sshfs' && target !== 'allow_other') {
            return failure(action, { code: 'validation', message: 'target must be "sshfs" or "allow_other"' })
          }
          const report = await this.install(target)
          return { ok: report.ok, action, data: report, ...(report.ok ? {} : { error: { code: report.code ?? 'install-failed', message: report.message, command: report.command } }) }
        }
        default:
          return failure(action, { code: 'invalid-action', message: `Unknown action "${action}".` })
      }
    } catch (error) {
      const message = String((error)?.message ?? error)
      const declared = (error)?.code
      const code = typeof declared === 'string' && declared.length > 0
        ? declared
        : /cannot parse|cannot read|cannot use/u.test(message)
          ? 'config-read-failed'
          : 'internal'
      return failure(action, { code, message })
    }
  }
}

/**
 * Pick the entries an operation targets.
 * @param {Array<Record<string, any>>} items - normalized entries.
 * @param {string | undefined} name - requested entry name.
 * @param {(item: Record<string, any>) => boolean} filter - selection predicate for the "all" form.
 * @returns {{ items?: Array<Record<string, any>>, error?: Record<string, any> }} the selection.
 */
function selectTargets(items, target, filter) {
  if (target !== undefined) {
    const found = findTarget(items, target)
    if (found === undefined) {
      return { error: { code: 'not-found', message: `No configuration entry ${describeTarget(target)}.` } }
    }
    return { items: [found.item] }
  }
  return { items: items.filter(filter) }
}

/**
 * An operation group with no entries selected.
 * @param {string} action - `mount` or `umount`.
 * @param {{ code: string, message: string }} error - why nothing was selected.
 * @returns {Record<string, any>} the group result.
 */
function emptyResult(action, error) {
  return { ok: false, action, results: [], summary: { total: 0, ok: 0, failed: 0 }, error }
}

/**
 * Group per-entry results into the operation summary.
 * @param {string} action - `mount` or `umount`.
 * @param {Array<Record<string, any>>} results - per-entry results.
 * @returns {Record<string, any>} the group result.
 */
function summarize(action, results) {
  const okCount = results.filter(result => result.ok).length
  return {
    ok: okCount === results.length,
    action,
    results,
    summary: { total: results.length, ok: okCount, failed: results.length - okCount },
  }
}

/**
 * Whether an entry carries the fields sshfs needs.
 * @param {Record<string, any>} item - normalized entry.
 * @returns {boolean} true when host, remotePath, and mount are set.
 */
function hasRequiredFields(item) {
  return item.host !== '' && item.remotePath !== '' && item.mount !== ''
}

/**
 * Address one entry by position or name.
 *
 * Position wins only while the name still matches, so a stale row index cannot
 * address a different entry after the list changed. Names fall back to the
 * first match, which is what the command line tool does.
 * @param {ReadonlyArray<Record<string, any>>} items - normalized entries.
 * @param {{ name?: string, index?: number } | undefined} target - entry address.
 * @returns {{ index: number, item: Record<string, any> } | undefined} the resolved entry.
 */
function findTarget(items, target) {
  const name = typeof target?.name === 'string' && target.name.trim() !== '' ? target.name.trim() : undefined
  const index = Number.isInteger(target?.index) ? target.index : undefined
  if (index !== undefined && index >= 0 && index < items.length) {
    const candidate = items[index]
    if (name === undefined || String(candidate?.name ?? '').trim() === name) return { index, item: candidate }
  }
  if (name !== undefined) {
    const byName = items.findIndex(item => String(item.name ?? '').trim() === name)
    if (byName !== -1) return { index: byName, item: items[byName] }
  }
  return undefined
}

/**
 * Render an address for an error message.
 * @param {{ name?: string, index?: number } | undefined} target - entry address.
 * @returns {string} the human description.
 */
function describeTarget(target) {
  const name = typeof target?.name === 'string' ? target.name.trim() : ''
  const index = Number.isInteger(target?.index) ? `#${String(target.index + 1)}` : ''
  if (name !== '' && index !== '') return `named "${name}" (${index})`
  if (name !== '') return `named "${name}"`
  if (index !== '') return `at position ${index}`
  return '(no target)'
}

/**
 * Read an entry address out of an action payload.
 * @param {Record<string, any>} payload - action payload.
 * @returns {{ name?: string, index?: number } | undefined} the address, when one was given.
 */
function targetFromPayload(payload) {
  const name = typeof payload?.name === 'string' && payload.name.trim() !== '' ? payload.name.trim() : undefined
  const index = Number.isInteger(payload?.index) ? payload.index : undefined
  if (name === undefined && index === undefined) return undefined
  return { ...(name === undefined ? {} : { name }), ...(index === undefined ? {} : { index }) }
}

/**
 * Read only the identity fields used for duplicate detection.
 * @param {Record<string, unknown>} entry - raw entry.
 * @returns {{ name: string, mount: string }} identity fields.
 */
function siblingNames(entry) {
  return { name: String(entry?.name ?? '').trim(), mount: String(entry?.mount ?? '').trim() }
}

/**
 * Strip Host-only facts before sending dependencies to the browser.
 * @param {Record<string, any>} dependencies - full dependency snapshot.
 * @returns {Record<string, any>} the public snapshot.
 */
export function publicDependencies(dependencies) {
  if (dependencies === undefined) return undefined
  return {
    platform: dependencies.platform,
    supported: dependencies.supported,
    checkedAt: dependencies.checkedAt,
    sshfs: dependencies.sshfs,
    fuse: dependencies.fuse,
    elevation: dependencies.elevation,
    installer: dependencies.installer,
    issues: dependencies.issues,
  }
}

/**
 * Build a "missing name" failure.
 * @param {string | { name?: string, index?: number }} target - requested entry address.
 * @returns {Record<string, any>} the envelope.
 */
function notFound(target) {
  return failure('select', { code: 'not-found', message: `No configuration entry ${describeTarget(target)}.` })
}

/**
 * Build a validation failure.
 * @param {string} action - action name.
 * @param {Record<string, string>} fields - field → reason code.
 * @returns {Record<string, any>} the envelope.
 */
function invalid(action, fields) {
  return failure(action, {
    code: 'validation',
    message: `Invalid entry: ${Object.keys(fields).join(', ')}.`,
    fields,
  })
}

/**
 * Require an entry address in the payload.
 * @param {Record<string, any>} payload - action payload.
 * @returns {{ name?: string, index?: number }} the address.
 * @throws {Error} when neither a name nor an index was given.
 */
function requireTarget(payload) {
  const target = targetFromPayload(payload)
  if (target === undefined) {
    throw Object.assign(new Error('this action requires a "name" or an "index"'), { code: 'validation' })
  }
  return target
}

/**
 * Build a failure envelope.
 * @param {string} action - action name.
 * @param {Record<string, any>} error - error detail.
 * @returns {Record<string, any>} the envelope.
 */
function failure(action, error) {
  return { ok: false, action, error }
}
