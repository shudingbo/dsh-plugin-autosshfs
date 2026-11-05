/**
 * Dependency inspection and installation for the Autosshfs Host half.
 *
 * Everything the plugin needs is a system dependency: the `sshfs` binary, a
 * FUSE implementation, and — for non-root `allow_other` mounts on Linux — the
 * `user_allow_other` switch in `/etc/fuse.conf`.
 *
 * Linux installation is attempted automatically through the detected package
 * manager with non-interactive sudo. macOS needs a system extension approved in
 * the GUI, so it reports the exact Homebrew commands instead of pretending to
 * install.
 */

import { commandOutput, renderCommand, runCommand } from './exec.js'
import {
  findExecutable,
  hasFuseDevice,
  inspectFuseConf,
  inspectMacFuse,
  isRoot,
  isSupportedPlatform,
  readSshfsVersion,
} from './system.js'

/** Linux package managers, in detection order. */
const LINUX_PACKAGE_MANAGERS = [
  { kind: 'apt', binary: 'apt-get', install: ['apt-get', 'install', '-y', 'sshfs'] },
  { kind: 'dnf', binary: 'dnf', install: ['dnf', 'install', '-y', 'fuse-sshfs'] },
  { kind: 'yum', binary: 'yum', install: ['yum', 'install', '-y', 'fuse-sshfs'] },
  { kind: 'pacman', binary: 'pacman', install: ['pacman', '-S', '--noconfirm', 'sshfs'] },
  { kind: 'zypper', binary: 'zypper', install: ['zypper', '--non-interactive', 'install', 'sshfs'] },
  { kind: 'apk', binary: 'apk', install: ['apk', 'add', 'sshfs'] },
]

/** Homebrew prefixes searched on macOS. */
const BREW_CANDIDATES = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew', '/usr/bin/brew']

/** macOS installation guidance: Homebrew core no longer ships an sshfs formula. */
export const MACOS_INSTALL_GUIDE = [
  'Homebrew does not ship a macOS sshfs formula any more, so pick one FUSE stack:',
  'FUSE-T (no kernel extension): brew tap macos-fuse-t/homebrew-cask && brew install --cask fuse-t && brew install fuse-t-sshfs',
  'macFUSE (kernel extension, reboot and System Settings approval): brew install --cask macfuse && brew install gromgit/fuse/sshfs-mac',
]

/** The exact `/etc/fuse.conf` edit used for the `user_allow_other` switch. */
const ALLOW_OTHER_SED = ['sed', '-i', '-e', 's/^#\\s*user_allow_other/user_allow_other/', '/etc/fuse.conf']

/** The documented manual command shown when elevation is unavailable. */
const ALLOW_OTHER_MANUAL = "sudo sed -i 's/^#\\s*user_allow_other/user_allow_other/' /etc/fuse.conf"

/**
 * Detect the Linux package manager used for automatic installation.
 * @param {string} platform - `process.platform`.
 * @returns {Promise<{ kind: string, binary: string, install: string[] } | undefined>} the manager.
 */
async function detectPackageManager(platform) {
  if (platform !== 'linux') return undefined
  for (const manager of LINUX_PACKAGE_MANAGERS) {
    const binary = await findExecutable([manager.binary], platform)
    if (binary !== undefined) return { ...manager, binary }
  }
  return undefined
}

/**
 * Inspect every dependency the plugin relies on.
 * @param {{ platform?: string, checkVersions?: boolean }} [options] - inspection options.
 * @returns {Promise<Record<string, any>>} the dependency snapshot plus remediation issues.
 */
export async function inspectDependencies(options = {}) {
  const platform = options.platform ?? process.platform
  const checkVersions = options.checkVersions !== false
  const supported = isSupportedPlatform(platform)

  const sshfsPath = await findExecutable(['sshfs'], platform)
  const version = sshfsPath !== undefined && checkVersions ? await readSshfsVersion(sshfsPath) : undefined

  const tools = {
    mount: await findExecutable(['mount'], platform),
    umount: await findExecutable(['umount'], platform),
    fusermount: platform === 'linux' ? await findExecutable(['fusermount3', 'fusermount'], platform) : undefined,
    diskutil: platform === 'darwin' ? await findExecutable(['/usr/sbin/diskutil', 'diskutil'], platform) : undefined,
    sudo: await findExecutable(['sudo'], platform),
    brew: platform === 'darwin' ? await findExecutable(BREW_CANDIDATES, platform) : undefined,
  }

  const root = isRoot()
  // Passwordless sudo is what makes automatic installation possible without a
  // terminal; without it we report the command instead of hanging on a prompt.
  const sudoNoPrompt = root
    ? true
    : tools.sudo !== undefined && (await runCommand([tools.sudo, '-n', 'true'], { timeoutMs: 5_000 })).ok
  const elevationPrefix = root ? [] : tools.sudo !== undefined ? [tools.sudo, '-n'] : null

  const manager = supported ? await detectPackageManager(platform) : undefined
  const sshfsArgv = manager !== undefined && elevationPrefix !== null
    ? [...elevationPrefix, ...manager.install]
    : undefined
  const allowOtherArgv = elevationPrefix !== null ? [...elevationPrefix, ...ALLOW_OTHER_SED] : undefined
  const canAutoInstall = sudoNoPrompt && elevationPrefix !== null

  /** @type {Record<string, any>} */
  const fuse = {}
  if (platform === 'linux') {
    fuse.device = await hasFuseDevice()
    fuse.conf = await inspectFuseConf()
  } else if (platform === 'darwin') {
    Object.assign(fuse, await inspectMacFuse())
  }

  /** @type {Array<Record<string, any>>} */
  const issues = []

  if (!supported) {
    issues.push({
      id: 'platform-unsupported',
      severity: 'error',
      message: `Platform "${platform}" is not supported: this plugin mounts sshfs on Linux and macOS only.`,
      installable: false,
    })
  }

  if (supported && sshfsPath === undefined) {
    if (platform === 'linux') {
      issues.push({
        id: 'sshfs-missing',
        severity: 'error',
        message: 'The sshfs binary is not installed.',
        hint: sshfsArgv === undefined
          ? 'Install sshfs with your distribution package manager, for example: sudo apt-get install -y sshfs'
          : `Install it with: ${renderCommand(sshfsArgv)}`,
        command: sshfsArgv === undefined ? 'sudo apt-get install -y sshfs' : renderCommand(sshfsArgv),
        installable: canAutoInstall && sshfsArgv !== undefined,
        installTarget: 'sshfs',
      })
    } else {
      issues.push({
        id: 'sshfs-missing',
        severity: 'error',
        message: 'The sshfs binary is not installed.',
        hint: MACOS_INSTALL_GUIDE.join('\n'),
        command: 'brew install --cask macfuse && brew install gromgit/fuse/sshfs-mac',
        installable: false,
      })
    }
  }

  if (supported && platform === 'linux') {
    if (!fuse.device) {
      issues.push({
        id: 'fuse-device-missing',
        severity: 'warning',
        message: '/dev/fuse is not available, so sshfs cannot mount anything here.',
        hint: 'Load the FUSE kernel module (sudo modprobe fuse). Inside a container the device has to be passed through from the host.',
        installable: false,
      })
    }
    if (!root && !fuse.conf.enabled) {
      issues.push({
        id: 'allow-other-disabled',
        severity: 'warning',
        message: `allow_other is disabled for non-root users: ${fuse.conf.path} has no active user_allow_other line.`,
        hint: 'Entries with allow_other enabled cannot mount until this is switched on.',
        command: canAutoInstall && allowOtherArgv !== undefined ? renderCommand(allowOtherArgv) : ALLOW_OTHER_MANUAL,
        installable: canAutoInstall && allowOtherArgv !== undefined,
        installTarget: 'allow_other',
      })
    }
    if (fuse.device && tools.fusermount === undefined) {
      issues.push({
        id: 'fusermount-missing',
        severity: 'warning',
        message: 'Neither fusermount3 nor fusermount was found: unmounting falls back to the umount command.',
        hint: 'Install the FUSE utilities from your distribution package manager.',
        installable: false,
      })
    }
  }

  if (supported && platform === 'darwin') {
    if (!fuse.macfuse && !fuse.fuseT) {
      issues.push({
        id: 'fuse-missing',
        severity: 'error',
        message: 'No FUSE filesystem provider (macFUSE or FUSE-T) was found.',
        hint: MACOS_INSTALL_GUIDE.join('\n'),
        command: 'brew install --cask macfuse',
        installable: false,
      })
    }
    issues.push({
      id: 'macos-allow-other',
      severity: 'info',
      message: 'On macOS, allow_other only works after the FUSE provider is allowed in System Settings; a mount that fails on it retries without.',
      installable: false,
    })
  }

  return {
    platform,
    supported,
    root,
    checkedAt: new Date().toISOString(),
    sshfs: { present: sshfsPath !== undefined, path: sshfsPath, version },
    tools,
    fuse,
    elevation: { root, sudo: tools.sudo, noPrompt: sudoNoPrompt },
    installer: {
      kind: manager?.kind,
      sshfsArgv,
      allowOtherArgv,
      sshfsCommand: sshfsArgv === undefined ? undefined : renderCommand(sshfsArgv),
      allowOtherCommand: allowOtherArgv === undefined ? ALLOW_OTHER_MANUAL : renderCommand(allowOtherArgv),
      canInstallSshfs: platform === 'linux' && canAutoInstall && sshfsArgv !== undefined,
      canEnableAllowOther: platform === 'linux' && canAutoInstall && allowOtherArgv !== undefined,
      guide: platform === 'darwin' ? MACOS_INSTALL_GUIDE : [],
    },
    issues,
  }
}

/**
 * Attempt to install one dependency.
 * @param {'sshfs' | 'allow_other'} target - what to install.
 * @param {{ platform?: string }} [options] - platform override.
 * @returns {Promise<{ ok: boolean, target: string, code?: string, message: string, command?: string, steps: Array<Record<string, unknown>> }>}
 */
export async function installDependency(target, options = {}) {
  const platform = options.platform ?? process.platform
  const before = await inspectDependencies({ platform })
  const steps = []

  if (!before.supported) {
    return { ok: false, target, code: 'platform-unsupported', message: `Platform "${platform}" is not supported.`, steps }
  }

  if (target === 'sshfs') {
    if (platform === 'darwin') {
      return {
        ok: false,
        target,
        code: 'install-manual',
        message: MACOS_INSTALL_GUIDE.join('\n'),
        command: 'brew install --cask macfuse && brew install gromgit/fuse/sshfs-mac',
        steps,
      }
    }
    const argv = before.installer.sshfsArgv
    if (argv === undefined) {
      return {
        ok: false,
        target,
        code: 'install-unavailable',
        message: 'No supported package manager was detected.',
        command: 'sudo apt-get install -y sshfs',
        steps,
      }
    }
    if (!before.installer.canInstallSshfs) {
      return {
        ok: false,
        target,
        code: 'install-needs-root',
        message: 'Automatic installation needs passwordless sudo; run the command in a terminal instead.',
        command: renderCommand(argv),
        steps,
      }
    }
    const result = await runCommand(argv, {
      timeoutMs: 300_000,
      env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' },
    })
    steps.push({ command: renderCommand(argv), ok: result.ok, output: commandOutput(result) })
    const after = await inspectDependencies({ platform })
    return {
      ok: after.sshfs.present,
      target,
      code: after.sshfs.present ? undefined : 'install-failed',
      message: after.sshfs.present
        ? `Installed sshfs${after.sshfs.version === undefined ? '' : ` ${after.sshfs.version}`}.`
        : `Installation did not produce an sshfs binary.${commandOutput(result) === '' ? '' : `\n${commandOutput(result)}`}`,
      command: renderCommand(argv),
      steps,
    }
  }

  if (target === 'allow_other') {
    if (platform !== 'linux') {
      return {
        ok: false,
        target,
        code: 'install-manual',
        message: 'macOS has no user_allow_other switch: allow other users in the FUSE provider settings, or leave allow_other off for that entry.',
        steps,
      }
    }
    if (before.fuse.conf.enabled) {
      return { ok: true, target, message: 'user_allow_other is already enabled.', command: before.installer.allowOtherCommand, steps }
    }
    const argv = before.installer.allowOtherArgv
    if (argv === undefined || !before.installer.canEnableAllowOther) {
      return {
        ok: false,
        target,
        code: 'install-needs-root',
        message: 'Automatic changes need passwordless sudo; run the command in a terminal instead.',
        command: before.installer.allowOtherCommand ?? ALLOW_OTHER_MANUAL,
        steps,
      }
    }
    const sedResult = await runCommand(argv, { timeoutMs: 30_000 })
    steps.push({ command: renderCommand(argv), ok: sedResult.ok, output: commandOutput(sedResult) })
    let after = await inspectDependencies({ platform })
    if (!after.fuse.conf.enabled) {
      // The file may not exist at all, in which case sed failed and a single
      // enabled line has to be appended.
      const teeArgv = [...(before.root ? [] : [before.tools.sudo, '-n']), 'tee', '-a', after.fuse.conf.path]
      const teeResult = await runCommand(teeArgv, { timeoutMs: 30_000, input: 'user_allow_other\n' })
      steps.push({ command: renderCommand(teeArgv), ok: teeResult.ok, output: commandOutput(teeResult) })
      after = await inspectDependencies({ platform })
    }
    return {
      ok: after.fuse.conf.enabled,
      target,
      code: after.fuse.conf.enabled ? undefined : 'install-failed',
      message: after.fuse.conf.enabled
        ? 'user_allow_other is now enabled in /etc/fuse.conf.'
        : 'user_allow_other is still disabled. Run the command manually with a terminal that can sudo.',
      command: before.installer.allowOtherCommand,
      steps,
    }
  }

  return { ok: false, target, code: 'unknown-target', message: `Unknown install target "${target}".`, steps }
}
