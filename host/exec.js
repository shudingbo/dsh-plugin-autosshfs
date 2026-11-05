/**
 * Process execution helper for the Autosshfs Host half.
 *
 * Every external command runs through an argv array — never a shell string —
 * so configuration values (hosts, users, paths, passwords) can never be
 * interpreted as shell syntax. This is the main hardening over the original
 * `nrs-tools/lib/autosshfs.js`, which interpolated values into shell commands.
 */

import { execFile } from 'node:child_process'

/** Default command timeout: long enough for a slow handshake, short enough to not hang the UI. */
export const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Run one command to completion and capture its output.
 * @param {readonly string[]} argv - executable followed by its arguments.
 * @param {{ input?: string, timeoutMs?: number, env?: NodeJS.ProcessEnv, cwd?: string, maxBuffer?: number }} [options]
 * @returns {Promise<{ ok: boolean, argv: readonly string[], code: number | null, signal: string | null, stdout: string, stderr: string, message: string, timedOut: boolean, missingExecutable: boolean }>}
 */
export function runCommand(argv, options = {}) {
  const { input, timeoutMs = DEFAULT_TIMEOUT_MS, env, cwd, maxBuffer = 8 * 1024 * 1024 } = options
  return new Promise((resolve) => {
    let settled = false
    /** @param {Record<string, unknown>} result */
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve({
        ok: result.code === 0 && result.signal === null && result.missingExecutable === false,
        timedOut: false,
        missingExecutable: false,
        stdout: '',
        stderr: '',
        message: '',
        signal: null,
        ...result,
        argv: [...argv],
      })
    }
    /** @type {import('node:child_process').ChildProcess} */
    let child
    try {
      child = execFile(
        argv[0],
        argv.slice(1),
        { timeout: timeoutMs, maxBuffer, env, cwd, windowsHide: true, killSignal: 'SIGKILL' },
        (error, stdout, stderr) => {
          const missingExecutable = Boolean(error && (error).code === 'ENOENT')
          const timedOut = Boolean(error && (error).killed)
          const stderrText = String(stderr ?? '')
          const stdoutText = String(stdout ?? '')
          // Node's own message repeats the command line, which would leak argv
          // words (such as `allow_other`) into failure classification. Keep it
          // only when the command produced no output of its own.
          const rawMessage = error === null ? '' : String((error).message ?? error)
          const message = error === null
            ? ''
            : timedOut
              ? `the command timed out after ${timeoutMs} ms`
              : stderrText !== '' || stdoutText !== ''
                ? ''
                : rawMessage
          finish({
            code: error === null ? 0 : typeof (error).code === 'number' ? (error).code : null,
            signal: error && (error).signal ? String((error).signal) : null,
            stdout: stdoutText,
            stderr: stderrText,
            message,
            timedOut,
            missingExecutable,
          })
        },
      )
    } catch (error) {
      finish({ code: null, signal: null, message: String((error)?.message ?? error) })
      return
    }
    if (input !== undefined && child.stdin !== null && child.stdin !== undefined) {
      // sshfs may close the pipe before consuming everything; EPIPE is not a
      // mount failure, the process result carries that answer.
      child.stdin.on('error', () => {})
      child.stdin.end(input)
    }
  })
}

/**
 * Combine stdout and stderr for diagnostics.
 * @param {{ stdout: string, stderr: string, message: string }} result - finished command.
 * @returns {string} the combined, trimmed text.
 */
export function commandOutput(result) {
  return [result.stderr, result.stdout, result.message]
    .map(part => String(part ?? '').trim())
    .filter(part => part.length > 0)
    .join('\n')
}

/**
 * Format one argv array for display (informational only, never executed).
 * @param {readonly string[]} argv - command words.
 * @returns {string} a copy-friendly shell-ish rendering.
 */
export function renderCommand(argv) {
  return argv
    .map((word) => (/^[A-Za-z0-9_./:@%+=,-]+$/u.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`))
    .join(' ')
}
