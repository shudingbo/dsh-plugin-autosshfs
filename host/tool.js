/**
 * The `autosshfs` agent tool.
 *
 * It exposes exactly the operations the Settings page uses, through the same
 * service instance and with the same validation and results — the model and the
 * user act on one surface, not two implementations.
 */

/** Tool name, matching the snake_case convention of the other Harness tools. */
export const TOOL_NAME = 'autosshfs'

/**
 * Actions the tool accepts.
 *
 * `install` is deliberately absent: installing a system package or flipping
 * `/etc/fuse.conf` changes the machine's capabilities, so it stays a user
 * action on the Settings page and never becomes something an agent can trigger.
 */
const ACTIONS = ['state', 'check', 'detail', 'add', 'update', 'remove', 'enable', 'mount', 'umount']

/** Entry fields the tool may write. */
const ENTRY_PROPERTIES = {
  name: { type: 'string', description: 'Entry name, unique in the configuration file.' },
  host: { type: 'string', description: 'SSH server host name or IP address.' },
  port: { type: 'integer', description: 'SSH port (default 22).' },
  user: { type: 'string', description: 'SSH user name. Omit to use the current local user.' },
  password: {
    type: 'string',
    description: 'SSH password. Omit to keep the stored one, send an empty string to remove it, or prefer IdentityFile / ssh-agent.',
  },
  IdentityFile: { type: 'string', description: 'Absolute path of the private key, or a ~/path form.' },
  remotePath: { type: 'string', description: 'Directory on the server to mount, for example /srv/data.' },
  mount: { type: 'string', description: 'Absolute local mount point, for example /mnt/data.' },
  enable: { type: 'boolean', description: 'Whether `mount` without a name mounts this entry (default true for new entries).' },
  allowOther: {
    type: 'boolean',
    description: 'Mount with allow_other so other users (such as a root docker daemon) can read it. Default true.',
  },
  uid: { type: 'string', description: 'Mount ownership uid passed to sshfs as uid=.' },
  gid: { type: 'string', description: 'Mount ownership gid passed to sshfs as gid=.' },
  extraOptions: {
    type: 'array',
    items: { type: 'string' },
    description: 'Extra sshfs -o options, for example ["reconnect", "ServerAliveInterval=15"].',
  },
}

const DESCRIPTION = [
  'Manage sshfs mounts declared in the autosshfs configuration file (~/.autosshfs.json, or $AUTOSSHFS_CONFIG).',
  'Actions: `state` lists entries with their live mount state and system-dependency issues; `check` re-probes the',
  'dependencies; `detail` shows one entry; `add`, `update`, `remove`, and `enable` edit the file; `mount` and `umount`',
  'mount one named entry (by `name`, or by zero-based `index` when names repeat) or, without a target, every enabled',
  'entry / every mounted entry. Installing system dependencies stays a user action in the plugin settings page.',
  '',
  'Mounted entries are real system mounts: mounting needs the sshfs binary and a FUSE device, and unmounting fails while',
  'processes still use the path. Report failures with their `code`; `hint` carries the concrete next step.',
].join(' ')

/**
 * Drop non-JSON values (`undefined`, functions) before the result is validated
 * against the tool output schema.
 * @param {unknown} value - candidate value.
 * @returns {unknown} a lossless JSON value.
 */
function toJsonValue(value) {
  return JSON.parse(JSON.stringify(value ?? null))
}

/**
 * Build the one-line result summary the conversation card shows.
 * @param {string} action - dispatched action.
 * @param {Record<string, any>} envelope - service envelope.
 * @returns {string} the summary text.
 */
export function summarizeResult(action, envelope) {
  if (envelope?.ok !== true) {
    const message = envelope?.error?.message ?? 'failed'
    return `autosshfs ${action} failed: ${message}`
  }
  const data = envelope.data ?? {}
  switch (action) {
    case 'state': {
      const summary = data.summary ?? {}
      const sshfs = data.dependencies?.sshfs ?? {}
      const issues = data.dependencies?.issues ?? []
      const problems = issues.filter(issue => issue.severity === 'error').length
      return [
        `autosshfs: ${String(summary.total ?? 0)} entries (${String(summary.enabled ?? 0)} enabled, ${String(summary.mounted ?? 0)} mounted).`,
        `config: ${String(data.configPath ?? '')}.`,
        sshfs.present ? `sshfs ${String(sshfs.version ?? '')}`.trim() : 'sshfs is missing',
        problems > 0 ? `${String(problems)} blocking dependency issue(s)` : '',
      ].filter(part => part !== '').join(' ')
    }
    case 'mount':
    case 'umount': {
      const summary = data.summary ?? {}
      const lines = (data.results ?? []).map((result) => {
        const head = `${result.ok ? 'ok' : 'failed'} ${String(result.name)} (${String(result.mount)})`
        const detail = result.ok
          ? ''
          : `: ${String(result.code ?? '')} ${String(result.message ?? '')}`.trimEnd()
        const warnings = (result.warnings ?? []).map(warning => warning.code).join(', ')
        return `${head}${detail}${warnings === '' ? '' : ` [${warnings}]`}`
      })
      return [`${action}: ${String(summary.ok ?? 0)}/${String(summary.total ?? 0)} succeeded.`, ...lines].join('\n')
    }
    case 'install':
      return `autosshfs install ${String(data.target ?? '')}: ${data.ok ? 'ok' : 'not installed'} — ${String(data.message ?? '')}`
    case 'detail':
      return `autosshfs entry ${String(data.name ?? '')}: ${data.mounted ? `mounted at ${String(data.mount)}` : 'not mounted'}`
    case 'remove':
      return `autosshfs removed entry ${String(data.removed ?? '')}.`
    case 'add':
    case 'update':
      return `autosshfs ${action} saved entry ${String(data.item?.name ?? '')}.`
    case 'enable':
      return `autosshfs ${String(data.item?.name ?? '')} is now ${data.item?.enable === true ? 'enabled' : 'disabled'}.`
    case 'check': {
      const issues = data.issues ?? []
      return `autosshfs check: sshfs ${data.sshfs?.present ? `present (${String(data.sshfs.version ?? 'unknown version')})` : 'missing'}, ${String(issues.length)} issue(s).`
    }
    default:
      return `autosshfs ${action} completed.`
  }
}

/**
 * Build the `autosshfs` tool definition.
 * @param {{ call: (action: string, payload?: Record<string, any>) => Promise<Record<string, any>> }} service - the Autosshfs service.
 * @returns {Record<string, any>} the tool definition.
 */
export function createTool(service) {
  return {
    name: TOOL_NAME,
    description: DESCRIPTION,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ACTIONS, description: 'The operation to perform.' },
        name: { type: 'string', description: 'Target entry name, for detail/update/remove/enable/mount/umount.' },
        index: {
          type: 'integer',
          description: 'Zero-based entry position, an alternative to name. Useful when the file has repeated names; it is ignored when the entry at that position has another name.',
        },
        enable: { type: 'boolean', description: 'New value for `enable` when action is `enable`.' },
        entry: {
          type: 'object',
          additionalProperties: false,
          description: 'Entry fields for add/update. Omitted fields keep their stored value on update.',
          properties: ENTRY_PROPERTIES,
        },
      },
      required: ['action'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean', description: 'Whether the action succeeded.' },
          action: { type: 'string', description: 'The dispatched action.' },
          summary: { type: 'string', description: 'One-line or per-entry human summary.' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: String((value)?.summary ?? 'autosshfs completed.') }],
    },
    async execute(args) {
      const action = String((args)?.action ?? '')
      if (!ACTIONS.includes(action)) {
        throw new Error(`autosshfs action must be one of: ${ACTIONS.join(', ')}`)
      }
      const payload = (args) ?? {}
      const envelope = await service.call(action, {
        ...(payload.name === undefined ? {} : { name: payload.name }),
        ...(payload.index === undefined ? {} : { index: payload.index }),
        ...(payload.enable === undefined ? {} : { enable: payload.enable }),
        ...(payload.entry === undefined ? {} : { item: payload.entry }),
      })
      const result = toJsonValue({ ...envelope, summary: summarizeResult(action, envelope) })
      if (envelope.ok !== true && envelope.error?.code === 'invalid-action') {
        throw new Error(String(envelope.error.message))
      }
      return result
    },
  }
}
