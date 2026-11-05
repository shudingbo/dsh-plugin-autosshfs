/**
 * Mount and unmount operations for the Autosshfs Host half.
 *
 * The option set mirrors `nrs-tools/lib/autosshfs.js` — port, `IdentityFile`,
 * `password_stdin`, `allow_other` + `default_permissions`, `uid`/`gid`,
 * `extraOptions` — but every command is built as an argv array and run without
 * a shell, and the mount point is checked against the real mount table instead
 * of a substring match.
 */

import fs from 'node:fs/promises'
import path from 'node:path'

import { commandOutput, renderCommand, runCommand } from './exec.js'
import { expandHome, findMountEntry, unmountLadder } from './system.js'

/** Timeout for one mount attempt: a slow handshake still has to finish while the user waits. */
const MOUNT_TIMEOUT_MS = 45_000

/** Timeout for one unmount attempt. */
const UMOUNT_TIMEOUT_MS = 20_000

/**
 * Build the full `sshfs` argv for one entry.
 * @param {{ sshfsPath: string, platform: string, item: Record<string, any>, allowOther?: boolean }} input - command inputs.
 * @returns {string[]} the argv array.
 */
export function buildMountArgv({ sshfsPath, platform, item, allowOther = item.allowOther }) {
  const argv = [sshfsPath]
  if (item.port) argv.push('-p', String(item.port))
  if (item.IdentityFile) argv.push('-o', `IdentityFile=${expandHome(item.IdentityFile)}`)
  if (item.password) argv.push('-o', 'password_stdin')
  if (allowOther) {
    argv.push('-o', 'allow_other')
    // `default_permissions` is the X11/Linux spelling; macFUSE mounts that do not
    // support it would fail, and the retry below covers the permission switch.
    if (platform !== 'darwin') argv.push('-o', 'default_permissions')
  }
  if (item.uid !== undefined && item.uid !== '') argv.push('-o', `uid=${item.uid}`)
  if (item.gid !== undefined && item.gid !== '') argv.push('-o', `gid=${item.gid}`)
  for (const option of item.extraOptions ?? []) argv.push('-o', option)
  const authority = item.user === '' ? item.host : `${item.user}@${item.host}`
  argv.push(`${authority}:${item.remotePath}`, expandHome(item.mount))
  return argv
}

/**
 * Classify a failed sshfs run into a stable code the UI can localize.
 * @param {string} output - combined stderr/stdout.
 * @returns {{ code: string, hint?: string }} the classification.
 */
export function classifyMountFailure(output) {
  const text = String(output ?? '')
  if (/Host key verification failed/iu.test(text)) {
    return {
      code: 'host-key',
      hint: 'Add the host key first: ssh-keyscan -H <host> >> ~/.ssh/known_hosts, or connect once with ssh.',
    }
  }
  if (/Permission denied|Authentication failed|publickey|Too many authentication failures/iu.test(text)) {
    return {
      code: 'auth-failed',
      hint: 'Check the user, the IdentityFile path, and that the key (or ssh-agent) is accepted by the server.',
    }
  }
  if (/Connection refused|Connection timed out|Connection reset by peer|Connection closed|No route to host|Network is unreachable|Could not resolve hostname/iu.test(text)) {
    return {
      code: 'connection-failed',
      hint: 'Check the host, the port, and that the server is reachable from this machine.',
    }
  }
  if (/allow_other|user_allow_other/iu.test(text)) {
    return {
      code: 'user-allow-other',
      hint: 'Enable allow_other for non-root users: sudo sed -i \'s/^#\\s*user_allow_other/user_allow_other/\' /etc/fuse.conf',
    }
  }
  if (/modprobe fuse|\/dev\/fuse|fuse: device not found|Operation not permitted/iu.test(text)) {
    return {
      code: 'fuse-unavailable',
      hint: 'The FUSE kernel module or device is missing. On Linux: sudo modprobe fuse. On macOS: check install order, uninstall, and the security setting.',
    }
  }
  if (/mount point is not empty/iu.test(text)) {
    return { code: 'mount-point-not-empty', hint: 'Unmount whatever is already mounted there, or choose an empty directory.' }
  }
  if (/Transport endpoint is not connected/iu.test(text)) {
    return {
      code: 'stale-mount',
      hint: 'A stale mount is still registered at that path: unmount it first (umount -l <path>).',
    }
  }
  return { code: 'mount-failed' }
}

/**
 * Ensure the mount point directory exists.
 * @param {string} mountPoint - configured mount point.
 * @returns {Promise<{ ok: boolean, code?: string, message?: string }>} the result.
 */
async function ensureMountPoint(mountPoint) {
  const target = path.resolve(expandHome(mountPoint))
  try {
    const stat = await fs.stat(target).catch(() => undefined)
    if (stat !== undefined) {
      if (!stat.isDirectory()) {
        return { ok: false, code: 'mount-not-directory', message: `${target} exists and is not a directory.` }
      }
      return { ok: true }
    }
    await fs.mkdir(target, { recursive: true, mode: 0o755 })
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      code: 'mount-point-unwritable',
      message: `Cannot create ${target}: ${(error)?.message ?? error}`,
    }
  }
}

/**
 * Mount one entry unless its mount point is already mounted.
 * @param {{ item: Record<string, any>, platform: string, dependencies: Record<string, any>, mountEntries: readonly Record<string, any>[] }} input - operation inputs.
 * @returns {Promise<Record<string, any>>} the operation result.
 */
export async function mountEntry({ item, platform, dependencies, mountEntries }) {
  /** @type {Array<Record<string, unknown>>} */
  const attempts = []
  /** @type {Array<Record<string, any>>} */
  const warnings = []
  const base = { name: item.name, mount: item.mount }

  // An existing mount is reported even when sshfs itself is gone: the entry is
  // already mounted, which is what the caller asked about.
  const existing = findMountEntry(mountEntries, item.mount)
  if (existing !== undefined) {
    if (item.allowOther && platform === 'linux' && !existing.options.includes('allow_other')) {
      warnings.push({
        code: 'allow-other-inactive',
        message: `Already mounted at ${item.mount} without allow_other: other users (such as a root docker daemon) cannot read it. Unmount and mount again to change that.`,
      })
    }
    return { ...base, ok: true, code: 'already-mounted', message: `Already mounted at ${item.mount}.`, warnings, attempts }
  }

  if (dependencies.sshfs?.path === undefined) {
    return {
      ...base,
      ok: false,
      code: 'sshfs-missing',
      message: 'The sshfs binary is not installed.',
      hint: platform === 'darwin'
        ? 'Install macFUSE or FUSE-T plus an sshfs build (see the plugin page).'
        : 'Install sshfs with your package manager (for example: sudo apt-get install -y sshfs).',
      warnings,
      attempts,
    }
  }

  const prepared = await ensureMountPoint(item.mount)
  if (!prepared.ok) {
    return { ...base, ok: false, code: prepared.code, message: prepared.message ?? 'Cannot prepare the mount point.', warnings, attempts }
  }

  if (item.allowOther && platform === 'linux' && !dependencies.root && !dependencies.fuse?.conf?.enabled) {
    return {
      ...base,
      ok: false,
      code: 'allow-other-disabled',
      message: `allow_other cannot be used: ${dependencies.fuse?.conf?.path ?? '/etc/fuse.conf'} has no active user_allow_other line.`,
      hint: "Enable it with: sudo sed -i 's/^#\\s*user_allow_other/user_allow_other/' /etc/fuse.conf — or disable allow_other for this entry.",
      warnings,
      attempts,
    }
  }

  const argv = buildMountArgv({ sshfsPath: dependencies.sshfs.path, platform, item })
  const command = renderCommand(argv)
  const stdin = item.password ? `${item.password}\n` : undefined
  const result = await runCommand(argv, { input: stdin, timeoutMs: MOUNT_TIMEOUT_MS })
  attempts.push({ command, ok: result.ok, output: commandOutput(result) })

  if (result.ok) {
    return { ...base, ok: true, code: 'mounted', message: `Mounted at ${item.mount}.`, command, warnings, attempts }
  }

  if (result.missingExecutable) {
    return {
      ...base,
      ok: false,
      code: 'sshfs-missing',
      message: `sshfs disappeared while mounting: ${dependencies.sshfs.path}`,
      command,
      warnings,
      attempts,
    }
  }

  const output = commandOutput(result)
  const classified = classifyMountFailure(output)

  // macOS and some FUSE backends reject allow_other outright, and the reason is
  // not always in the message. Everywhere else the retry only runs when the
  // failure names the option, so an unreachable host is not mounted twice.
  const mentionsAllowOther = /allow_other/u.test(output)
  if (item.allowOther && (platform === 'darwin' || mentionsAllowOther)) {
    const retryArgv = buildMountArgv({ sshfsPath: dependencies.sshfs.path, platform, item, allowOther: false })
    const retry = await runCommand(retryArgv, { input: stdin, timeoutMs: MOUNT_TIMEOUT_MS })
    attempts.push({ command: renderCommand(retryArgv), ok: retry.ok, output: commandOutput(retry) })
    if (retry.ok) {
      warnings.push({
        code: 'allow-other-fallback',
        message: 'Mounted without allow_other: only this user can access the mount point.',
      })
      return {
        ...base,
        ok: true,
        code: 'mounted-without-allow-other',
        message: `Mounted at ${item.mount} without allow_other.`,
        command: renderCommand(retryArgv),
        warnings,
        attempts,
      }
    }
  }

  return {
    ...base,
    ok: false,
    code: classified.code,
    message: output === '' ? 'sshfs failed without output.' : output,
    hint: classified.hint,
    command,
    warnings,
    attempts,
  }
}

/**
 * Unmount one entry when it is mounted.
 * @param {{ item: Record<string, any>, platform: string, dependencies: Record<string, any>, mountEntries: readonly Record<string, any>[] }} input - operation inputs.
 * @returns {Promise<Record<string, any>>} the operation result.
 */
export async function umountEntry({ item, platform, dependencies, mountEntries }) {
  /** @type {Array<Record<string, unknown>>} */
  const attempts = []
  /** @type {Array<Record<string, any>>} */
  const warnings = []
  const base = { name: item.name, mount: item.mount }

  if (findMountEntry(mountEntries, item.mount) === undefined) {
    return { ...base, ok: true, code: 'not-mounted', message: `Not mounted at ${item.mount}.`, warnings, attempts }
  }

  const ladder = await unmountLadder(platform, item.mount, dependencies.tools ?? {})
  if (ladder.length === 0) {
    return {
      ...base,
      ok: false,
      code: 'umount-missing',
      message: 'No usable unmount command was found (umount, fusermount, or diskutil).',
      warnings,
      attempts,
    }
  }

  let lastOutput = ''
  for (const attempt of ladder) {
    const result = await runCommand(attempt.argv, { timeoutMs: UMOUNT_TIMEOUT_MS })
    const output = commandOutput(result)
    attempts.push({ command: renderCommand(attempt.argv), ok: result.ok, output })
    if (result.ok) {
      if (attempt.lazy) {
        warnings.push({
          code: 'lazy-umount',
          message: 'The mount point was busy, so a lazy unmount ran: the path is released once the processes using it exit.',
        })
      }
      return { ...base, ok: true, code: attempt.lazy ? 'unmounted-lazy' : 'unmounted', message: `Unmounted ${item.mount}.`, warnings, attempts }
    }
    if (output !== '') lastOutput = output
  }

  const busy = /Device or resource busy|target is busy/iu.test(lastOutput)
  return {
    ...base,
    ok: false,
    code: busy ? 'umount-busy' : 'umount-failed',
    message: lastOutput === '' ? 'Every unmount command failed.' : lastOutput,
    hint: busy ? `Find the processes still using it: sudo fuser -vm ${item.mount}, or sudo lsof +f -- ${item.mount}` : undefined,
    warnings,
    attempts,
  }
}
