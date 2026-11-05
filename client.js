/**
 * Autosshfs — browser half.
 *
 * A dedicated main-column page, opened from a row in the sidebar's More menu
 * (`sidebar.panellist.actions`). It is not part of Settings and does not take a
 * permanent line in the panel list: choosing the row dispatches the `autosshfs`
 * main panel, which owns the whole center column and offers two tabs — the mount
 * list and an in-app help page.
 *
 * Every action goes through one JSON RPC route on the Host
 * (`POST /api/autosshfs/rpc`), the same service the `autosshfs` agent tool
 * calls, so the page never re-implements mount logic. All visible text comes
 * from the Client locale dictionaries below.
 */

window.__ModuleLoader__.load({
  id: 'dsh-plugin-autosshfs',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this bundle. */
    const NS = 'autosshfs'

    /** Host RPC endpoint. Mirrors `RPC_PATH` in `host/http.js`. */
    const RPC_PATH = '/api/autosshfs/rpc'

    /** Main-panel key, and the id of the sidebar button that dispatches it. */
    const PANEL_ID = 'autosshfs'

    /** Position of the sidebar panel button, after the shipped panels (0/10/20). */
    const PANEL_ORDER = 30

    // ---------------------------------------------------------------- locales

    const en = {
      'panel.label': 'Autosshfs mounts',
      'page.title': 'Autosshfs mounts',
      'page.subtitle': 'Configuration file {path} · shared with the autosshfs command line tool',
      'page.hostHint': 'The plugin Host half answers at /api/autosshfs/rpc. Check that the bundle is enabled in the Plugins page and that this Harness serves the Web UI.',
      'header.sshfs': 'sshfs {version}',
      'header.sshfsMissing': 'sshfs not installed',
      'header.mounted': '{mounted}/{total} mounted',
      'action.refresh': 'Refresh',
      'action.mountAll': 'Mount all',
      'action.umountAll': 'Unmount all',
      'action.add': 'New mount',
      'action.recheck': 'Re-check',
      'action.install': 'Install',
      'action.viewHelp': 'View help',
      'action.close': 'Close',
      'action.mount': 'Mount',
      'action.umount': 'Unmount',
      'action.edit': 'Edit',
      'action.delete': 'Delete',
      'action.confirmDelete': 'Confirm delete',
      'action.cancel': 'Cancel',
      'action.save': 'Save',
      'action.details': 'Details',
      'action.hideDetails': 'Hide details',
      'action.enable': 'Enable',
      'action.disable': 'Disable',
      'action.clear': 'Clear',
      'tabs.mounts': 'Mount list',
      'tabs.help': 'Help',
      'search.placeholder': 'Filter by name, host, or mount point…',
      'filter.all': 'All',
      'filter.enabled': 'Enabled',
      'filter.mounted': 'Mounted',
      'list.count': 'Showing {shown} of {total}',
      'state.loading': 'Loading…',
      'state.empty': 'No entries yet. Use “New mount” in the top-right corner to add the first one.',
      'state.noMatch': 'No entry matches the current filter.',
      'state.loadFailed': 'Cannot load the mount list.',
      'deps.strip.title': '{count} dependency issue(s) to review',
      'badge.mounted': 'Mounted',
      'badge.unmounted': 'Not mounted',
      'badge.disabled': 'Disabled',
      'badge.password': 'Password saved',
      'entry.mountPoint': 'Mount point',
      'details.heading': 'Entry details',
      'details.source': 'Mount source',
      'details.fstype': 'Filesystem',
      'details.mountOptions': 'Mount options',
      'details.notMounted': 'This entry is not mounted.',
      'details.password': 'Authentication',
      'details.passwordSaved': 'password saved in the config file',
      'details.passwordKey': 'key, ssh-agent, or prompt',
      'details.configPath': 'Config file',
      'editor.addTitle': 'New mount entry',
      'editor.editTitle': 'Edit {name}',
      'editor.connection': 'Connection',
      'editor.mountOptions': 'Mount options',
      'editor.requiredHint': 'Fields marked * are required.',
      'field.name': 'Name *',
      'field.host': 'Host *',
      'field.port': 'Port',
      'field.user': 'User',
      'field.password': 'Password',
      'field.passwordKeep': 'saved: leave empty to keep it',
      'field.identityFile': 'Identity file',
      'field.remotePath': 'Remote path *',
      'field.mount': 'Mount point *',
      'field.enable': 'Include in “Mount all”',
      'field.allowOther': 'Allow other users (allow_other)',
      'field.uid': 'Owner uid',
      'field.gid': 'Group gid',
      'field.extraOptions': 'Extra sshfs options',
      'field.extraOptionsHint': 'Comma separated, for example reconnect, ServerAliveInterval=15',
      'field.clearPassword': 'Remove the saved password',
      'fieldHint.name': 'Unique name; the page and the agent tool address entries by it (or by position).',
      'fieldHint.host': 'SSH host name or IP address.',
      'fieldHint.port': 'SSH port, 22 by default.',
      'fieldHint.user': 'SSH user. Empty uses the current local user.',
      'fieldHint.password': 'Optional. Sent to sshfs through password_stdin; stored as plain text, so prefer a key.',
      'fieldHint.IdentityFile': 'Private key path; a ~/ form is allowed.',
      'fieldHint.remotePath': 'Directory on the server to mount.',
      'fieldHint.mount': 'Absolute local mount point; the directory is created when missing.',
      'fieldHint.enable': 'Whether “Mount all” includes this entry. Missing means disabled.',
      'fieldHint.allowOther': 'Adds allow_other so root-owned processes (such as a docker daemon) can read the mount. Non-root Linux needs user_allow_other first.',
      'fieldHint.uid': 'Passed to sshfs as uid=.',
      'fieldHint.gid': 'Passed to sshfs as gid=.',
      'fieldHint.extraOptions': 'Extra sshfs -o options, comma separated, for example reconnect, ServerAliveInterval=15.',
      'fieldError.required': 'required',
      'fieldError.duplicate': 'already used by another entry',
      'fieldError.absolute': 'must be an absolute path (a ~/ form is allowed)',
      'fieldError.range': 'must be 1–65535',
      'error.validation': 'The entry was rejected: {fields}',
      'error.not-found': 'No entry with that name.',
      'error.invalid-action': 'Unknown action.',
      'error.internal': 'The Host failed: {message}',
      'error.config-read-failed': 'The configuration file cannot be read: {message}',
      'error.config-write-failed': 'The configuration file cannot be written: {message}',
      'error.unknown-target': 'Unknown install target.',
      'error.cross-site': 'Cross-site requests are not allowed.',
      'error.too-large': 'The request body is too large.',
      'error.invalid-json': 'The request body is not valid JSON.',
      'error.invalid-request': 'The request is malformed.',
      'error.sshfs-missing': 'sshfs is not installed.',
      'error.allow-other-disabled': 'allow_other is disabled: enable user_allow_other in /etc/fuse.conf, or turn allow_other off for this entry.',
      'error.mount-failed': 'sshfs failed. {message}',
      'error.auth-failed': 'Authentication failed. Check the user, the key file, and that the server accepts that key.',
      'error.connection-failed': 'The server cannot be reached. Check the host, the port, and the network.',
      'error.host-key': 'The host key is not known yet. Connect once with ssh, or add the key to known_hosts.',
      'error.fuse-unavailable': 'FUSE is not available. On Linux load the kernel module (sudo modprobe fuse); on macOS allow the FUSE provider in System Settings.',
      'error.mount-point-not-empty': 'The mount point is not empty.',
      'error.mount-not-directory': 'The mount point exists and is not a directory.',
      'error.mount-point-unwritable': 'The mount point cannot be created: {message}',
      'error.stale-mount': 'A stale mount still occupies that path. Run umount -l on it first.',
      'error.missing-fields': 'host, remotePath, and mount are required.',
      'error.umount-failed': 'Every unmount attempt failed. {message}',
      'error.umount-busy': 'The mount point is busy: a process still uses it. Find it with sudo fuser -vm {mount}, then try again.',
      'error.umount-missing': 'No unmount command (umount, fusermount, diskutil) was found.',
      'error.install-failed': 'Installation did not succeed. {message}',
      'error.install-unavailable': 'No supported package manager was detected; install it manually.',
      'error.install-needs-root': 'Automatic installation needs passwordless sudo. Run the shown command in a terminal.',
      'error.install-manual': 'This platform needs a manual installation. Follow the shown command or install guide.',
      'error.unknown': 'The operation failed: {message}',
      'warn.allow-other-fallback': 'Mounted without allow_other: only this user can access the mount point.',
      'warn.allow-other-inactive': 'Already mounted without allow_other: other users cannot read it until it is remounted.',
      'warn.lazy-umount': 'The path was busy, so a lazy unmount ran: it is released when the processes exit.',
      'result.ok': 'ok',
      'result.failed': 'failed',
      'result.mountSummary': '{ok}/{total} mounted',
      'result.umountSummary': '{ok}/{total} unmounted',
      'notice.saved': 'Entry saved.',
      'notice.deleted': 'Entry deleted.',
      'notice.installed': 'Dependency installed.',
      'notice.checked': 'Dependency check finished.',
      'notice.running': 'Working…',
      'issue.platform-unsupported': 'This plugin supports Linux and macOS only.',
      'issue.sshfs-missing': 'The sshfs binary is not installed.',
      'issue.fuse-device-missing': '/dev/fuse is not available, so sshfs cannot mount anything on this machine.',
      'issue.allow-other-disabled': 'allow_other is disabled for non-root users (/etc/fuse.conf has no active user_allow_other).',
      'issue.fusermount-missing': 'Neither fusermount3 nor fusermount was found: unmounting falls back to umount.',
      'issue.fuse-missing': 'No FUSE filesystem provider (macFUSE or FUSE-T) was found.',
      'issue.macos-allow-other': 'On macOS, allow_other only works after the FUSE provider is allowed in System Settings.',
      'help.intro': 'This page manages the sshfs entries in ~/.autosshfs.json: create, edit, mount, and unmount them here. The same file and the same operations are available to the agent through the autosshfs tool.',
      'help.quick.title': 'Quick start',
      'help.quick.step1.title': 'Add an entry',
      'help.quick.step1.body': 'Use “New mount” in the top-right corner and fill in host, user, remote path, and the local mount point. The identity file accepts a ~/ path; a password can be stored instead, but it is written as plain text (the file stays mode 0600).',
      'help.quick.step2.title': 'Mount it',
      'help.quick.step2.body': 'Click “Mount” on the row, or “Mount all” to mount every entry marked enabled. After a successful mount the local directory shows the remote content and behaves like any other directory.',
      'help.quick.step3.title': 'Use it from a terminal',
      'help.quick.step3.body': 'The mount point is a real system mount: cd into it, bind it into docker with -v, or open it in an editor. Exit programs that use the directory before unmounting.',
      'help.deps.title': 'System dependencies',
      'help.deps.intro': 'Mounting needs sshfs and a working FUSE stack. The status below is probed live on the Host; use “Re-check” after changing anything.',
      'help.deps.sshfs': 'sshfs',
      'help.deps.fuse': 'FUSE runtime',
      'help.deps.allowOther': 'allow_other',
      'help.deps.ready': 'ready',
      'help.deps.missing': 'missing',
      'help.deps.enabled': 'enabled',
      'help.deps.disabled': 'disabled',
      'help.deps.unknown': 'unknown',
      'help.deps.autoNote': 'When the machine allows passwordless sudo, “Install” runs the command for you; otherwise copy the command below into a terminal and press “Re-check” afterwards.',
      'help.deps.linux.title': 'Linux packages',
      'help.deps.linux.body': '# Debian / Ubuntu\nsudo apt-get install -y sshfs\n# Fedora / RHEL\nsudo dnf install -y fuse-sshfs\n# Arch\nsudo pacman -S --noconfirm sshfs\n# openSUSE\nsudo zypper --non-interactive install sshfs\n# Alpine\nsudo apk add sshfs',
      'help.deps.macos.title': 'macOS (Homebrew no longer ships a macOS sshfs formula)',
      'help.deps.macos.body': '# Option A — FUSE-T, no kernel extension\nbrew tap macos-fuse-t/homebrew-cask\nbrew install --cask fuse-t\nbrew install fuse-t-sshfs\n\n# Option B — macFUSE, needs a reboot and System Settings approval\nbrew install --cask macfuse\nbrew install gromgit/fuse/sshfs-mac',
      'help.deps.macosNote': 'macOS only honours allow_other after the FUSE extension is approved in System Settings → Privacy & Security. When the first mount fails on it, the plugin retries without allow_other and reports a warning.',
      'help.deps.allowOther.title': 'Enable user_allow_other (Linux, non-root)',
      'help.deps.allowOther.body': "sudo sed -i 's/^#\\s*user_allow_other/user_allow_other/' /etc/fuse.conf",
      'help.config.title': 'Configuration file',
      'help.config.intro': 'Everything lives in one file: {path}. Override it with AUTOSSHFS_CONFIG. Writes are atomic and the file is kept at mode 0600 because an entry may carry a password.',
      'help.config.sampleTitle': 'Example',
      'help.config.sample': '{\n  "list": [\n    {\n      "name": "project",\n      "enable": true,\n      "host": "example.com",\n      "port": 22,\n      "user": "me",\n      "IdentityFile": "~/.ssh/id_ed25519",\n      "remotePath": "/srv/project",\n      "mount": "/mnt/project",\n      "allowOther": true\n    }\n  ]\n}',
      'help.config.fields': 'Fields',
      'help.config.colField': 'Field',
      'help.config.colHint': 'Meaning',
      'help.agent.title': 'Use it from the conversation',
      'help.agent.intro': 'The agent can manage the same entries through the autosshfs tool. Installing system packages stays a user action on this page.',
      'help.agent.example': '{ "action": "state" }                     → list entries and mount state\n{ "action": "mount", "name": "project" }  → mount one entry\n{ "action": "mount" }                     → mount every enabled entry\n{ "action": "umount", "index": 3 }        → address by position (safer with repeated names)',
      'help.faq.title': 'Troubleshooting',
      'help.faq.q1': 'Mount fails with an allow_other error',
      'help.faq.a1': 'Non-root Linux users must enable user_allow_other in /etc/fuse.conf first (command above). Alternatively turn allow_other off for that entry; other users such as a root docker daemon then cannot read the mount point.',
      'help.faq.q2': 'Unmount says the mount point is busy',
      'help.faq.a2': 'A process still uses the directory. Find it with sudo fuser -vm <mount point> or sudo lsof +D <mount point>, stop it, then unmount again. The plugin already tries umount, fusermount -uz, and umount -l in that order.',
      'help.faq.q3': 'First connection fails on the host key',
      'help.faq.a3': 'Connect once with ssh so the key is trusted, or run ssh-keyscan -H <host> >> ~/.ssh/known_hosts.',
      'help.faq.q4': 'The Install button is not available',
      'help.faq.a4': 'Automatic installation needs passwordless sudo (sudo -n true must succeed). Otherwise copy the command below/above into a terminal and press “Re-check” afterwards.',
      'help.faq.q5': 'macOS mounting fails',
      'help.faq.a5': 'Make sure FUSE-T or macFUSE is installed and its system extension is approved, and install the matching sshfs build. For macFUSE you can add defer_permissions to “Extra sshfs options”.',
      'help.compat.title': 'Alongside the command line tool',
      'help.compat.body': 'This plugin and the nrs-tools autosshfs command read and write the same ~/.autosshfs.json with the same field meanings. An entry mounted from the command line shows as mounted here, entries created here work from the command line, and the enable flag behaves the same way (missing means disabled).',
    }

    const zh = {
      'panel.label': 'Autosshfs 挂载',
      'page.title': 'Autosshfs 远程挂载',
      'page.subtitle': '配置文件 {path} · 与 autosshfs 命令行工具共用同一份数据',
      'page.hostHint': '插件的 Host 端通过 /api/autosshfs/rpc 应答。请确认插件已在「插件」页面启用，并且当前 Harness 正在提供 Web 界面。',
      'header.sshfs': 'sshfs {version}',
      'header.sshfsMissing': '未安装 sshfs',
      'header.mounted': '{mounted}/{total} 已挂载',
      'action.refresh': '刷新',
      'action.mountAll': '全部挂载',
      'action.umountAll': '全部卸载',
      'action.add': '新增挂载',
      'action.recheck': '重新检测',
      'action.install': '自动安装',
      'action.viewHelp': '查看帮助',
      'action.close': '关闭',
      'action.mount': '挂载',
      'action.umount': '卸载',
      'action.edit': '编辑',
      'action.delete': '删除',
      'action.confirmDelete': '确认删除',
      'action.cancel': '取消',
      'action.save': '保存',
      'action.details': '详情',
      'action.hideDetails': '收起详情',
      'action.enable': '启用',
      'action.disable': '禁用',
      'action.clear': '清除',
      'tabs.mounts': '挂载列表',
      'tabs.help': '使用帮助',
      'search.placeholder': '按名称、主机或挂载点筛选…',
      'filter.all': '全部',
      'filter.enabled': '已启用',
      'filter.mounted': '已挂载',
      'list.count': '共 {total} 项，当前显示 {shown} 项',
      'state.loading': '加载中…',
      'state.empty': '还没有配置项。点击右上角「新增挂载」创建第一个。',
      'state.noMatch': '没有匹配当前筛选条件的配置项。',
      'state.loadFailed': '无法读取挂载列表。',
      'deps.strip.title': '有 {count} 项依赖问题需要处理',
      'badge.mounted': '已挂载',
      'badge.unmounted': '未挂载',
      'badge.disabled': '已禁用',
      'badge.password': '已存密码',
      'entry.mountPoint': '挂载点',
      'details.heading': '配置详情',
      'details.source': '挂载来源',
      'details.fstype': '文件系统',
      'details.mountOptions': '挂载选项',
      'details.notMounted': '该项当前未挂载。',
      'details.password': '认证方式',
      'details.passwordSaved': '配置文件中已保存密码',
      'details.passwordKey': '密钥、ssh-agent 或交互输入',
      'details.configPath': '配置文件',
      'editor.addTitle': '新增挂载配置',
      'editor.editTitle': '编辑 {name}',
      'editor.connection': '连接信息',
      'editor.mountOptions': '挂载选项',
      'editor.requiredHint': '带 * 的字段为必填。',
      'field.name': '名称 *',
      'field.host': '主机 *',
      'field.port': '端口',
      'field.user': '用户名',
      'field.password': '密码',
      'field.passwordKeep': '已保存：留空保持不变',
      'field.identityFile': '私钥文件',
      'field.remotePath': '远端路径 *',
      'field.mount': '挂载点 *',
      'field.enable': '在「全部挂载」时包含此项',
      'field.allowOther': '允许其他用户访问（allow_other）',
      'field.uid': '属主 uid',
      'field.gid': '属组 gid',
      'field.extraOptions': '额外 sshfs 选项',
      'field.extraOptionsHint': '以逗号分隔，例如 reconnect, ServerAliveInterval=15',
      'field.clearPassword': '删除已保存的密码',
      'fieldHint.name': '唯一标识；界面与 Agent 工具按名称（或位置）定位配置项。',
      'fieldHint.host': 'SSH 主机名或 IP 地址。',
      'fieldHint.port': 'SSH 端口，默认 22。',
      'fieldHint.user': 'SSH 用户名；留空则使用当前本地用户。',
      'fieldHint.password': '可选。通过 password_stdin 交给 sshfs；以明文保存，建议优先使用私钥。',
      'fieldHint.IdentityFile': '私钥路径，支持 ~/ 开头。',
      'fieldHint.remotePath': '服务器上要挂载的目录。',
      'fieldHint.mount': '本地挂载点绝对路径；目录不存在会自动创建。',
      'fieldHint.enable': '是否参与「全部挂载」；缺省视为关闭。',
      'fieldHint.allowOther': '附加 allow_other，让 root 进程（如 docker daemon）也能读取挂载点；Linux 非 root 需先启用 user_allow_other。',
      'fieldHint.uid': '透传 sshfs 的 uid= 选项。',
      'fieldHint.gid': '透传 sshfs 的 gid= 选项。',
      'fieldHint.extraOptions': '额外 sshfs -o 选项，逗号分隔，例如 reconnect, ServerAliveInterval=15。',
      'fieldError.required': '必填',
      'fieldError.duplicate': '与其他配置项重复',
      'fieldError.absolute': '必须是绝对路径（可写 ~/ 开头）',
      'fieldError.range': '必须在 1–65535 之间',
      'error.validation': '配置未通过校验：{fields}',
      'error.not-found': '找不到该名称的配置项。',
      'error.invalid-action': '未知操作。',
      'error.internal': 'Host 端出错：{message}',
      'error.config-read-failed': '配置文件无法读取：{message}',
      'error.config-write-failed': '配置文件无法写入：{message}',
      'error.unknown-target': '未知的安装目标。',
      'error.cross-site': '不允许跨站请求。',
      'error.too-large': '请求体过大。',
      'error.invalid-json': '请求体不是合法 JSON。',
      'error.invalid-request': '请求格式不正确。',
      'error.sshfs-missing': '未安装 sshfs。',
      'error.allow-other-disabled': 'allow_other 未开启：请在 /etc/fuse.conf 中启用 user_allow_other，或为该配置关闭 allow_other。',
      'error.mount-failed': 'sshfs 挂载失败。{message}',
      'error.auth-failed': '认证失败：检查用户名、私钥路径，以及服务器是否接受该密钥。',
      'error.connection-failed': '无法连接服务器：检查主机、端口与网络。',
      'error.host-key': '尚未信任该主机密钥：先用 ssh 连接一次，或把密钥写入 known_hosts。',
      'error.fuse-unavailable': 'FUSE 不可用：Linux 上执行 sudo modprobe fuse；macOS 上确认已在「系统设置」中允许该 FUSE 提供方。',
      'error.mount-point-not-empty': '挂载点目录非空。',
      'error.mount-not-directory': '挂载点已存在但不是目录。',
      'error.mount-point-unwritable': '挂载点创建失败：{message}',
      'error.stale-mount': '该路径上残留了失效挂载，请先执行 umount -l。',
      'error.missing-fields': 'host、remotePath、mount 为必填。',
      'error.umount-failed': '所有卸载尝试均失败。{message}',
      'error.umount-busy': '挂载点被占用：仍有进程在使用。可用 sudo fuser -vm {mount} 查看后重试。',
      'error.umount-missing': '未找到可用的卸载命令（umount / fusermount / diskutil）。',
      'error.install-failed': '安装未成功。{message}',
      'error.install-unavailable': '未识别到可用的包管理器，请手动安装。',
      'error.install-needs-root': '自动安装需要免密 sudo。请在终端中执行给出的命令。',
      'error.install-manual': '该平台需要手动安装，请按提示或在终端执行给出的命令。',
      'error.unknown': '操作失败：{message}',
      'warn.allow-other-fallback': '已在未启用 allow_other 的情况下挂载：仅当前用户可访问该挂载点。',
      'warn.allow-other-inactive': '该路径已挂载但未启用 allow_other：重新挂载前其他用户无法访问。',
      'warn.lazy-umount': '路径被占用，已执行懒卸载：占用进程退出后才会真正释放。',
      'result.ok': '成功',
      'result.failed': '失败',
      'result.mountSummary': '已挂载 {ok}/{total}',
      'result.umountSummary': '已卸载 {ok}/{total}',
      'notice.saved': '配置已保存。',
      'notice.deleted': '配置已删除。',
      'notice.installed': '依赖已安装。',
      'notice.checked': '依赖检测完成。',
      'notice.running': '执行中…',
      'issue.platform-unsupported': '本插件仅支持 Linux 与 macOS。',
      'issue.sshfs-missing': '未找到 sshfs 可执行文件。',
      'issue.fuse-device-missing': '当前机器没有 /dev/fuse，sshfs 无法挂载。',
      'issue.allow-other-disabled': '非 root 用户的 allow_other 未开启（/etc/fuse.conf 中没有生效的 user_allow_other）。',
      'issue.fusermount-missing': '未找到 fusermount3 / fusermount，卸载将退回使用 umount。',
      'issue.fuse-missing': '未找到 FUSE 文件系统支持（macFUSE 或 FUSE-T）。',
      'issue.macos-allow-other': 'macOS 上需要先在「系统设置」中允许该 FUSE 提供方，allow_other 才会生效。',
      'help.intro': '本页管理 ~/.autosshfs.json 中的 sshfs 挂载项：新增、编辑、挂载、卸载都在这里完成。同一份配置和同一组操作也通过 autosshfs 工具提供给 Agent。',
      'help.quick.title': '快速上手',
      'help.quick.step1.title': '新增配置',
      'help.quick.step1.body': '点击右上角「新增挂载」，填写主机、用户、远端路径与本地挂载点。私钥路径支持 ~/ 开头；也可以保存密码，但它会以明文写入配置文件（文件权限固定 0600）。',
      'help.quick.step2.title': '挂载',
      'help.quick.step2.body': '在列表里点「挂载」，或用右上角「全部挂载」按启用标记批量挂载。挂载成功后，本地挂载点就会出现远端目录内容，和普通目录一样使用。',
      'help.quick.step3.title': '在终端使用',
      'help.quick.step3.body': '挂载点是真实的系统挂载：可以 cd 进去、用 docker -v 绑定、用编辑器打开。卸载前请先退出占用该目录的程序。',
      'help.deps.title': '系统依赖',
      'help.deps.intro': '挂载需要 sshfs 与可用的 FUSE 环境。下面的状态由 Host 端实时探测；改动系统后点「重新检测」刷新。',
      'help.deps.sshfs': 'sshfs',
      'help.deps.fuse': 'FUSE 运行环境',
      'help.deps.allowOther': 'allow_other',
      'help.deps.ready': '已就绪',
      'help.deps.missing': '缺失',
      'help.deps.enabled': '已启用',
      'help.deps.disabled': '未启用',
      'help.deps.unknown': '未知',
      'help.deps.autoNote': '如果系统允许免密 sudo，界面上的「自动安装」会直接执行命令；否则请复制下面的命令到终端执行，完成后点「重新检测」。',
      'help.deps.linux.title': 'Linux 安装命令',
      'help.deps.linux.body': '# Debian / Ubuntu\nsudo apt-get install -y sshfs\n# Fedora / RHEL\nsudo dnf install -y fuse-sshfs\n# Arch\nsudo pacman -S --noconfirm sshfs\n# openSUSE\nsudo zypper --non-interactive install sshfs\n# Alpine\nsudo apk add sshfs',
      'help.deps.macos.title': 'macOS（Homebrew 已不再提供 macOS 版 sshfs 公式）',
      'help.deps.macos.body': '# 方案 A —— FUSE-T，无需内核扩展\nbrew tap macos-fuse-t/homebrew-cask\nbrew install --cask fuse-t\nbrew install fuse-t-sshfs\n\n# 方案 B —— macFUSE，需要重启并在系统设置中允许\nbrew install --cask macfuse\nbrew install gromgit/fuse/sshfs-mac',
      'help.deps.macosNote': 'macOS 需要先在「系统设置 → 隐私与安全性」中允许该 FUSE 扩展，allow_other 才会生效。首次挂载因此失败时，插件会自动退回不带 allow_other 的方式并给出警告。',
      'help.deps.allowOther.title': '启用 user_allow_other（Linux，非 root）',
      'help.deps.allowOther.body': "sudo sed -i 's/^#\\s*user_allow_other/user_allow_other/' /etc/fuse.conf",
      'help.config.title': '配置文件',
      'help.config.intro': '所有配置都在一个文件里：{path}（可用环境变量 AUTOSSHFS_CONFIG 覆盖）。写入是原子的，并且因为可能保存密码，文件权限固定为 0600。',
      'help.config.sampleTitle': '示例',
      'help.config.sample': '{\n  "list": [\n    {\n      "name": "project",\n      "enable": true,\n      "host": "example.com",\n      "port": 22,\n      "user": "me",\n      "IdentityFile": "~/.ssh/id_ed25519",\n      "remotePath": "/srv/project",\n      "mount": "/mnt/project",\n      "allowOther": true\n    }\n  ]\n}',
      'help.config.fields': '字段说明',
      'help.config.colField': '字段',
      'help.config.colHint': '说明',
      'help.agent.title': '在对话里使用',
      'help.agent.intro': 'Agent 可以通过 autosshfs 工具管理同一批配置；安装系统依赖始终只在本页面由用户操作。',
      'help.agent.example': '{ "action": "state" }                     → 列出全部配置与挂载状态\n{ "action": "mount", "name": "project" }  → 挂载指定项\n{ "action": "mount" }                     → 挂载全部已启用项\n{ "action": "umount", "index": 3 }        → 按位置定位（同名配置项时更可靠）',
      'help.faq.title': '常见问题',
      'help.faq.q1': '挂载报 allow_other 相关错误',
      'help.faq.a1': 'Linux 非 root 用户需要先在 /etc/fuse.conf 启用 user_allow_other（命令见上方）；也可以编辑该配置项关闭 allow_other，只是 root 的 docker daemon 等其他用户将无法访问挂载点。',
      'help.faq.q2': '卸载提示 busy（设备或资源忙）',
      'help.faq.a2': '仍有进程在使用该目录。用 sudo fuser -vm <挂载点> 或 sudo lsof +D <挂载点> 找到并结束，然后再次卸载。插件会依次尝试 umount、fusermount -uz 与 umount -l。',
      'help.faq.q3': '首次连接报主机密钥验证失败',
      'help.faq.a3': '先用 ssh 连接一次该主机，或执行 ssh-keyscan -H <host> >> ~/.ssh/known_hosts。',
      'help.faq.q4': '「自动安装」按钮不可用',
      'help.faq.a4': '自动安装需要免密 sudo（sudo -n true 能成功）。否则请复制上方命令到终端执行，完成后点「重新检测」。',
      'help.faq.q5': 'macOS 上挂载失败',
      'help.faq.a5': '确认已安装 FUSE-T 或 macFUSE 且系统允许其扩展，并用 Homebrew 安装对应的 sshfs 构建。使用 macFUSE 时可在「额外 sshfs 选项」中追加 defer_permissions。',
      'help.compat.title': '与命令行版共存',
      'help.compat.body': '本插件与 nrs-tools 的 autosshfs 命令读写同一个 ~/.autosshfs.json，字段含义一致：命令行挂载过的项在这里显示为已挂载，这里新增的项命令行也能直接使用，enable 的语义也相同（缺省视为关闭）。',
    }

    // ------------------------------------------------------------------- css

    const PAGE_CSS = `
.asf-page { position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 1.6; }
.asf-header { flex: none; display: flex; flex-wrap: wrap; align-items: flex-start; gap: 12px 20px; padding: calc(22px + var(--dsh-frame-top-clearance, 0px)) clamp(20px, 4vw, 40px) 12px; }
.asf-header-text { flex: 1 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.asf-titleline { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 10px; }
.asf-mark { display: inline-flex; color: var(--dsw-alias-brand-primary); }
.asf-h1 { margin: 0; font-size: 20px; line-height: 28px; font-weight: 600; letter-spacing: -0.01em; }
.asf-sub { margin: 0; font-size: 12.5px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.asf-sub code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; background: var(--dsw-alias-bg-layer-1); border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 5px; padding: 1px 5px; }
.asf-header-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.asf-chip { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; padding: 2px 9px; font-size: 11.5px; line-height: 18px; border: 0.5px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.asf-chip[data-tone="ok"] { color: var(--dsw-alias-state-success-primary); border-color: currentColor; }
.asf-chip[data-tone="warn"] { color: var(--dsw-alias-state-warn-primary); border-color: currentColor; }
.asf-chip[data-tone="error"] { color: var(--dsw-alias-state-error-primary); border-color: currentColor; }
/* Button atom — mirrors @deepseek-ai/dsh-client-ui-primitives (Button.module.css):
   ghost by default, primary/outline/toolbar maps to the --dsw-alias-button-* fill
   families, and primary text is label-primary-foreground so the light primary
   fill of the dark theme keeps a readable label. */
.asf-button { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 4px; border: none; border-radius: var(--dsw-radius-md); cursor: pointer; font: inherit; font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-primary); background: transparent; padding: 0 14px; height: 36px; white-space: nowrap; }
.asf-button:disabled { cursor: not-allowed; opacity: 0.4; }
.asf-button[data-size="sm"] { height: 28px; font-size: 12px; line-height: 18px; padding: 0 10px; border-radius: var(--dsw-radius-sm); }
.asf-button[data-variant="primary"] { background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); }
.asf-button[data-variant="outline"] { border: 0.5px solid transparent; background: transparent; box-shadow: inset 0 0 0 var(--dsh-hairline-width, 0.5px) var(--dsh-button-outline-color, var(--dsw-alias-border-l3)); }
.asf-button[data-variant="toolbar"] { background: var(--dsw-alias-button-tool-bar-fill); }
.asf-button[data-tone="danger"] { color: var(--dsw-alias-state-error-primary); }
@media (hover: hover) {
  .asf-button[data-variant="primary"]:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
  .asf-button[data-variant="outline"]:hover:not(:disabled),
  .asf-button[data-variant="ghost"]:hover:not(:disabled),
  .asf-button:not([data-variant]):hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
  .asf-button[data-variant="toolbar"]:hover:not(:disabled) { background: var(--dsw-alias-button-tool-bar-hover); }
}
.asf-button:active:not(:disabled) { background: var(--dsw-alias-interactive-bg-active); }
.asf-button:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 2px; }
.asf-banner { display: flex; align-items: flex-start; gap: 8px; margin: 0 clamp(20px, 4vw, 40px); border-radius: 9px; padding: 9px 12px; font-size: 12.5px; line-height: 19px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); }
.asf-banner[data-kind="error"] { border-color: var(--dsw-alias-state-error-primary); }
.asf-banner[data-kind="ok"] { border-color: var(--dsw-alias-state-success-primary); }
.asf-banner-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.asf-banner-title { font-weight: 600; }
.asf-strip { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 10px clamp(20px, 4vw, 40px) 0; padding: 9px 12px; border-radius: 9px; border: 0.5px solid var(--dsw-alias-state-warn-primary); background: var(--dsw-alias-bg-layer-1); font-size: 12.5px; line-height: 19px; }
.asf-strip-icon { color: var(--dsw-alias-state-warn-primary); display: inline-flex; }
.asf-strip-text { flex: 1 1 240px; min-width: 0; }
.asf-tabs { flex: none; display: flex; gap: 22px; padding: 12px clamp(20px, 4vw, 40px) 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.asf-tab { position: relative; border: 0; padding: 4px 1px 10px; background: transparent; font: inherit; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.asf-tab[data-active="true"] { color: var(--dsw-alias-label-primary); font-weight: 600; }
.asf-tab:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; border-radius: 3px; }
.asf-tab[data-active="true"]::after { content: ''; position: absolute; right: 0; bottom: -1px; left: 0; height: 2px; border-radius: 2px 2px 0 0; background: var(--dsw-alias-brand-primary); }
.asf-scroll { flex: 1; min-height: 0; overflow: auto; scrollbar-gutter: stable; }
.asf-content { display: flex; flex-direction: column; gap: 14px; max-width: 1080px; margin: 0 auto; padding: 18px clamp(20px, 4vw, 40px) 56px; }
.asf-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.asf-search { flex: 1 1 240px; min-width: 180px; box-sizing: border-box; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; line-height: 22px; padding: 4px 10px; }
.asf-search:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.asf-filters { display: inline-flex; gap: 4px; padding: 3px; border-radius: 9px; background: var(--dsw-alias-bg-layer-1); border: 0.5px solid var(--dsw-alias-border-l1); }
.asf-filter { border: 0; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; line-height: 18px; padding: 3px 10px; cursor: pointer; }
.asf-filter[data-active="true"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-weight: 600; }
.asf-filter:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.asf-count { margin-left: auto; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.asf-list { display: flex; flex-direction: column; gap: 10px; }
.asf-entry { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1.2fr) auto; align-items: center; gap: 4px 18px; border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); padding: 12px 14px; }
.asf-entry[data-mounted="true"] { box-shadow: inset 3px 0 0 var(--dsw-alias-state-success-primary); }
.asf-entry-main { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.asf-entry-title { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.asf-name { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asf-entry-source { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asf-entry-mount { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.asf-entry-mount-label { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.asf-entry-mount code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asf-entry-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px; }
/* Switch atom — mirrors @deepseek-ai/dsh-client-ui-primitives (Switch.module.css):
   the track is border-l3 off / brand-primary on, and the thumb flips between
   switch-thumb and label-primary-foreground so it stays visible on both. */
.asf-switch { box-sizing: border-box; position: relative; flex: 0 0 auto; display: inline-flex; align-items: center; width: 36px; height: 20px; margin: 0; padding: 2px; border: 0; border-radius: 999px; background: var(--dsw-alias-border-l3); cursor: pointer; }
.asf-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.asf-switch:disabled { cursor: default; opacity: 0.5; }
.asf-switch:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 2px; }
.asf-switch[data-size="sm"] { width: 32px; height: 18px; }
.asf-thumb { display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb); transition: transform 120ms ease, background-color 120ms ease; }
.asf-switch[aria-checked="true"] .asf-thumb { transform: translateX(16px); background: var(--dsw-alias-label-primary-foreground); }
.asf-switch[data-size="sm"] .asf-thumb { width: 14px; height: 14px; }
.asf-switch[data-size="sm"][aria-checked="true"] .asf-thumb { transform: translateX(14px); }
.asf-details { grid-column: 1 / -1; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 12px; margin-top: 6px; padding-top: 8px; border-top: 0.5px dashed var(--dsw-alias-border-l2); font-size: 12px; line-height: 19px; }
.asf-details dt { color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.asf-details dd { margin: 0; overflow-wrap: anywhere; }
.asf-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 56px 20px; border: 0.5px dashed var(--dsw-alias-border-l2); border-radius: 12px; color: var(--dsw-alias-label-secondary); font-size: 13px; text-align: center; }
.asf-empty-mark { color: var(--dsw-alias-label-tertiary); }
.asf-loading { display: flex; align-items: center; gap: 8px; padding: 32px 0; color: var(--dsw-alias-label-secondary); font-size: 13px; }
.asf-report { display: flex; flex-direction: column; gap: 6px; border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); padding: 10px 12px; font-size: 12.5px; line-height: 19px; }
.asf-report-head { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.asf-report-list { list-style: none; display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; }
.asf-report-item { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.asf-report-item[data-ok="false"] { color: var(--dsw-alias-state-error-primary); }
.asf-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; overflow-wrap: anywhere; }
.asf-muted { color: var(--dsw-alias-label-secondary); }
.asf-overlay { position: absolute; inset: 0; z-index: 30; display: flex; align-items: flex-start; justify-content: center; padding: 24px 16px 40px; overflow: auto; background: var(--dsw-alias-bg-mask-1); }
.asf-dialog { display: flex; flex-direction: column; width: min(720px, 100%); margin: auto; border-radius: 14px; background: var(--dsw-alias-bg-layer-2); box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22); border: 0.5px solid var(--dsw-alias-border-l2); }
.asf-dialog-head { display: flex; align-items: center; gap: 10px; padding: 16px 18px 10px; }
.asf-dialog-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; }
.asf-dialog-hint { margin-left: auto; font-size: 11.5px; color: var(--dsw-alias-label-tertiary); }
.asf-dialog-close { appearance: none; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); border-radius: 7px; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.asf-dialog-close:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.asf-dialog-body { display: flex; flex-direction: column; gap: 14px; padding: 4px 18px 8px; }
.asf-dialog-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 18px 16px; }
.asf-subhead { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; color: var(--dsw-alias-label-tertiary); }
.asf-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 14px; }
.asf-grid[data-span="full"] { grid-template-columns: minmax(0, 1fr); }
.asf-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.asf-field-label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.asf-field[data-invalid="true"] .asf-field-label { color: var(--dsw-alias-state-error-primary); }
.asf-input { width: 100%; box-sizing: border-box; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 7px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; line-height: 22px; padding: 4px 8px; }
.asf-input:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; border-color: transparent; }
.asf-field[data-invalid="true"] .asf-input { border-color: var(--dsw-alias-state-error-primary); }
.asf-field-error { font-size: 11px; color: var(--dsw-alias-state-error-primary); }
.asf-field-hint { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.asf-check { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 20px; }
.asf-check input { margin: 3px 0 0; }
.asf-help { display: flex; flex-direction: column; gap: 22px; }
.asf-help-lead { margin: 0; font-size: 13px; line-height: 21px; color: var(--dsw-alias-label-secondary); max-width: 78ch; }
.asf-card { display: flex; flex-direction: column; gap: 12px; border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); padding: 16px 18px; }
.asf-card-title { margin: 0; font-size: 15px; line-height: 23px; font-weight: 600; }
.asf-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 0; padding: 0; list-style: none; counter-reset: asf-step; }
.asf-step { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2); border: 0.5px solid var(--dsw-alias-border-l1); }
.asf-step-title { font-size: 13px; font-weight: 600; }
.asf-step-body { margin: 0; font-size: 12.5px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.asf-code { display: block; margin: 0; padding: 10px 12px; border-radius: 9px; background: var(--dsw-alias-bg-base); border: 0.5px solid var(--dsw-alias-border-l1); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 19px; white-space: pre-wrap; overflow-x: auto; }
.asf-note { margin: 0; font-size: 12px; line-height: 19px; color: var(--dsw-alias-label-secondary); }
.asf-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.asf-table th, .asf-table td { text-align: left; padding: 6px 10px 6px 0; vertical-align: top; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.asf-table th { font-weight: 600; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.asf-table code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.asf-deps-table td:first-child { white-space: nowrap; font-weight: 600; }
.asf-faq { display: flex; flex-direction: column; gap: 12px; }
.asf-faq-item { display: flex; flex-direction: column; gap: 3px; }
.asf-faq-q { font-size: 13px; font-weight: 600; }
.asf-faq-a { margin: 0; font-size: 12.5px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
@media (max-width: 900px) {
  .asf-entry { grid-template-columns: minmax(0, 1fr) auto; }
  .asf-entry-mount { grid-column: 1; }
  .asf-entry-actions { grid-column: 1 / -1; justify-content: flex-start; }
  .asf-grid { grid-template-columns: minmax(0, 1fr); }
}
`

    /** Styles for the sidebar More-menu row, which renders outside the page. */
    const MENU_CSS = `
.asf-menurow { display: flex; align-items: center; gap: 6px; width: 100%; min-height: 34px; padding: 6px 8px; border: none; border-radius: var(--dsw-radius-md); background: transparent; cursor: pointer; font: inherit; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); text-align: left; }
@media (hover: hover) {
  .asf-menurow:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
}
.asf-menurow:focus-visible { background: var(--dsw-alias-interactive-bg-hover); outline: none; }
.asf-menurow-icon { display: inline-flex; flex: none; width: 14px; height: 14px; align-items: center; justify-content: center; color: var(--dsw-alias-menu-icon, var(--dsw-alias-label-secondary)); }
.asf-menurow-icon svg { width: 14px; height: 14px; }
.asf-menurow-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asf-menurow-check { flex: none; width: 14px; height: 14px; color: var(--dsw-alias-label-primary); }
`

    // ------------------------------------------------------------------- rpc

    /**
     * Post one action to the Host half.
     * @param {string} action - service action name.
     * @param {Record<string, unknown>} [payload] - action payload.
     * @returns {Promise<Record<string, any>>} the service envelope.
     */
    async function callHost(action, payload) {
      const response = await fetch(RPC_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ action, payload: payload ?? {} }),
      })
      const text = await response.text()
      let body
      try {
        body = text === '' ? null : JSON.parse(text)
      } catch {
        throw new Error(`HTTP ${response.status}: unexpected response body`)
      }
      if (body === null || typeof body !== 'object') {
        throw new Error(`HTTP ${response.status}: empty response`)
      }
      return body
    }

    /**
     * Address one row for the Host: the position keeps repeated names apart, and
     * the name lets the Host detect a stale position.
     * @param {Record<string, any>} item - entry row.
     * @returns {{ name: string, index?: number }} the target payload.
     */
    function rowTarget(item) {
      return Number.isInteger(item?.index)
        ? { name: item.name, index: item.index }
        : { name: item.name }
    }

    /**
     * Translate a stable code with a localized template, falling back to the
     * Host's own message when the dictionary has no entry.
     * @param {(key: string, params?: Record<string, unknown>) => string} t - locale translate.
     * @param {string} prefix - key group, such as `error`.
     * @param {string} code - stable code.
     * @param {Record<string, unknown>} [params] - template parameters.
     * @returns {string} the message.
     */
    function describeCode(t, prefix, code, params) {
      const key = `${prefix}.${code}`
      const text = t(key, params)
      if (text !== key) return text
      return String(params?.message ?? params?.mount ?? code)
    }

    /**
     * Turn one validation reason code into a localized message.
     * @param {(key: string, params?: Record<string, unknown>) => string} t - translate.
     * @param {string | undefined} reason - reason code from the Host.
     * @returns {string | undefined} the message, when the field is invalid.
     */
    function fieldError(t, reason) {
      return reason === undefined ? undefined : describeCode(t, 'fieldError', reason)
    }

    /**
     * Describe one failed envelope, preferring a localized code.
     * @param {(key: string, params?: Record<string, unknown>) => string} t - translate.
     * @param {Record<string, any> | undefined} error - envelope error.
     * @returns {string} the message.
     */
    function describeErrorFor(t, error) {
      if (error === undefined) return t('error.unknown', { message: '' })
      const fields = error.fields === undefined ? '' : Object.keys(error.fields).join(', ')
      return describeCode(t, 'error', error.code ?? 'unknown', { message: error.message, fields })
    }

    // ------------------------------------------------------------- components

    /**
     * The panel glyph, drawn in the current text colour.
     * @param {{ size?: number }} props - edge in pixels.
     * @returns {object} the svg element.
     */
    function Mark({ size = 18 }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        'aria-hidden': true,
        style: { display: 'block' },
      },
      h('rect', { x: 3.2, y: 4.4, width: 17.6, height: 6.8, rx: 2, stroke: 'currentColor', strokeWidth: 1.5 }),
      h('rect', { x: 3.2, y: 12.8, width: 17.6, height: 6.8, rx: 2, stroke: 'currentColor', strokeWidth: 1.5 }),
      h('circle', { cx: 7, cy: 7.8, r: 1.15, fill: 'currentColor' }),
      h('circle', { cx: 7, cy: 16.2, r: 1.15, fill: 'currentColor' }),
      h('path', { d: 'M14.6 7.8h3.2M14.6 16.2h3.2', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
      )
    }

    /**
     * Render one status chip.
     * @param {{ tone: string, text: string }} props - chip props.
     * @returns {object} the element.
     */
    function Chip({ tone, text }) {
      return h('span', { className: 'asf-chip', 'data-tone': tone }, text)
    }

    /**
     * Render a labelled text input.
     * @param {{ label: string, value: string, onChange: (value: string) => void, error?: string, hint?: string, placeholder?: string, type?: string }} props - field props.
     * @returns {object} the element.
     */
    function TextField({ label, value, onChange, error, hint, placeholder, type = 'text' }) {
      return h('label', { className: 'asf-field', 'data-invalid': error === undefined ? 'false' : 'true' },
        h('span', { className: 'asf-field-label' }, label),
        h('input', {
          className: 'asf-input',
          type,
          value,
          placeholder: placeholder ?? '',
          onChange: event => onChange(event.target.value),
        }),
        error === undefined ? null : h('span', { className: 'asf-field-error' }, error),
        hint === undefined ? null : h('span', { className: 'asf-field-hint' }, hint),
      )
    }

    /**
     * Render a checkbox row.
     * @param {{ label: string, checked: boolean, onChange: (checked: boolean) => void }} props - checkbox props.
     * @returns {object} the element.
     */
    function CheckField({ label, checked, onChange }) {
      return h('label', { className: 'asf-check' },
        h('input', { type: 'checkbox', checked, onChange: event => onChange(event.target.checked) }),
        h('span', null, label),
      )
    }

    /**
     * Render a code block that can be copied by selecting it.
     * @param {{ text: string }} props - block props.
     * @returns {object} the element.
     */
    function CodeBlock({ text }) {
      return h('pre', { className: 'asf-code', tabIndex: 0 }, text)
    }

    /**
     * Build the sidebar More-menu row that opens the panel.
     *
     * The panel deliberately has no row of its own in the sidebar list: the list
     * renders one labelled row per panel, so a fourth panel costs a whole line.
     * This row lives in the existing More menu instead, which is where the shell
     * already collects secondary entries.
     * @param {(key: string, params?: Record<string, unknown>) => string} translate - activation-bound translate.
     * @param {() => void} openPanel - switch the main column to this panel.
     * @returns {(props: Record<string, any>) => object} the menu row component.
     */
    function createMenuRow(translate, openPanel) {
      /**
       * @param {{ t?: Function, usePanelInfo?: Function, onDismiss?: () => void }} props - slot props.
       * @returns {object} the menu row element.
       */
      return function AutosshfsMenuRow(props) {
        const t = typeof props?.t === 'function' ? props.t : translate
        const activeId = typeof props?.usePanelInfo === 'function'
          ? props.usePanelInfo(info => info.activePanelId)
          : undefined
        const active = activeId === PANEL_ID
        const dismiss = typeof props?.onDismiss === 'function' ? props.onDismiss : () => {}
        return h('button', {
          type: 'button',
          role: 'menuitem',
          className: 'asf-menurow',
          'aria-current': active ? 'page' : undefined,
          title: t('panel.label'),
          onClick: () => {
            dismiss()
            openPanel()
          },
        },
        h('span', { className: 'asf-menurow-icon', 'aria-hidden': true }, h(Mark, { size: 14 })),
        h('span', { className: 'asf-menurow-label' }, t('panel.label')),
        active ? h('span', { className: 'asf-menurow-check', 'aria-hidden': true },
          h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none' },
            h('path', { d: 'M5 12.8l4.2 4.2L19 7.4', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }))) : null,
        )
      }
    }

    /**
     * Build the page component for one locale binding.
     * @param {(key: string, params?: Record<string, unknown>) => string} translate - activation-bound translate, used when the renderer supplies none.
     * @returns {(props: Record<string, any>) => object} the page component.
     */
    function createPage(translate) {
      /**
       * The Autosshfs main panel.
       * @param {{ t?: (key: string, params?: Record<string, unknown>) => string }} props - slot props supplied by the shell.
       * @returns {object} the rendered page.
       */
      return function AutosshfsPage(props) {
        // The renderer hands out a translate bound to this namespace and
        // re-derives it on locale changes; the activation binding is the
        // fallback for any host that renders the component directly.
        const t = typeof props?.t === 'function' ? props.t : translate
        const [snapshot, setSnapshot] = React.useState(null)
        const [transportError, setTransportError] = React.useState(null)
        const [busy, setBusy] = React.useState(null)
        const [banner, setBanner] = React.useState(null)
        const [report, setReport] = React.useState(null)
        const [editor, setEditor] = React.useState(null)
        const [confirmIndex, setConfirmIndex] = React.useState(null)
        const [detail, setDetail] = React.useState(null)
        const [tab, setTab] = React.useState('mounts')
        const [query, setQuery] = React.useState('')
        const [filter, setFilter] = React.useState('all')
        const alive = React.useRef(true)

        React.useEffect(() => {
          alive.current = true
          return () => { alive.current = false }
        }, [])

        /**
         * Reload the whole page state.
         * @param {boolean} [withDependencies] - re-probe system dependencies.
         * @returns {Promise<void>} resolves after the state is applied.
         */
        const reload = React.useCallback(async (withDependencies = false) => {
          const envelope = await callHost('state', withDependencies ? { refresh: true } : {})
          if (!alive.current) return
          if (envelope.ok !== true) {
            setTransportError(describeCode(translate, 'error', envelope.error?.code ?? 'unknown', { message: envelope.error?.message }))
            return
          }
          setTransportError(null)
          setSnapshot(envelope.data)
        }, [])

        React.useEffect(() => {
          reload().catch(error => {
            if (alive.current) setTransportError(String(error?.message ?? error))
          })
        }, [reload])

        const disabled = busy !== null
        const items = snapshot?.items ?? []
        const dependencies = snapshot?.dependencies
        const issues = dependencies?.issues ?? []
        const summary = snapshot?.summary
        const blockers = issues.filter(issue => issue.severity === 'error' || issue.severity === 'warning')

        /**
         * Whether this row is the one whose details are open.
         * @param {Record<string, any>} item - entry row.
         * @returns {boolean} true when the details panel belongs to this row.
         */
        const showsDetails = item => detail !== null && detail !== undefined
          && detail.index === item.index && detail.name === item.name

        /**
         * Run one Host action with shared busy/banner handling.
         * @param {string} action - service action.
         * @param {Record<string, unknown>} payload - action payload.
         * @param {string} label - busy label.
         * @returns {Promise<Record<string, any> | null>} the envelope, or null on transport failure.
         */
        const runAction = async (action, payload, label) => {
          setBusy(label)
          try {
            const envelope = await callHost(action, payload)
            if (!alive.current) return null
            return envelope
          } catch (error) {
            if (alive.current) setBanner({ kind: 'error', text: String(error?.message ?? error) })
            return null
          } finally {
            if (alive.current) setBusy(null)
          }
        }

        /**
         * Mount or unmount entries, then refresh.
         * @param {'mount' | 'umount'} action - operation.
         * @param {Record<string, any>} [item] - entry row; omitted means every entry.
         * @returns {Promise<void>} resolves after the refresh.
         */
        const runMountAction = async (action, item) => {
          setBanner(null)
          const label = item === undefined ? `${action}-all` : `${action}:${item.name}`
          const payload = item === undefined ? {} : rowTarget(item)
          const envelope = await runAction(action, payload, label)
          if (envelope === null) return
          // Per-entry failures are listed in the report; only an envelope-level
          // failure (an unknown entry, a host fault) also raises the banner.
          if (envelope.ok !== true && envelope.error !== undefined) {
            setBanner({ kind: 'error', text: describeErrorFor(t, envelope.error) })
          }
          setReport({ action, data: envelope.data ?? {} })
          await reload()
        }

        /**
         * Run a mutating action and surface its result.
         * @param {string} action - service action.
         * @param {Record<string, unknown>} payload - action payload.
         * @param {string} notice - success notice key.
         * @returns {Promise<Record<string, any> | null>} the envelope.
         */
        const runMutation = async (action, payload, notice) => {
          setBanner(null)
          const envelope = await runAction(action, payload, action)
          if (envelope === null) return null
          if (envelope.ok !== true) {
            setBanner({ kind: 'error', text: describeErrorFor(t, envelope.error) })
            return envelope
          }
          setBanner({ kind: 'ok', text: t(notice) })
          await reload()
          return envelope
        }

        /**
         * Install one dependency and show the report.
         * @param {string} target - `sshfs` or `allow_other`.
         * @returns {Promise<void>} resolves after the refresh.
         */
        const installTarget = async (target) => {
          const envelope = await runAction('install', { target }, `install:${target}`)
          if (envelope === null) return
          const data = envelope.data ?? {}
          setReport({
            action: 'install',
            data: {
              results: [{
                name: target,
                mount: '',
                ok: data.ok === true,
                code: envelope.ok === true ? undefined : (data.code ?? envelope.error?.code),
                message: data.message ?? envelope.error?.message,
                warnings: [],
              }],
              summary: { total: 1, ok: data.ok === true ? 1 : 0 },
            },
          })
          if (envelope.ok === true) setBanner({ kind: 'ok', text: t('notice.installed') })
          else setBanner({ kind: 'error', text: describeErrorFor(t, data.ok === true ? undefined : { code: data.code ?? envelope.error?.code, message: data.message ?? envelope.error?.message }) })
          await reload(true)
        }

        /**
         * Toggle one entry's `enable` flag.
         * @param {Record<string, any>} item - entry view.
         * @returns {Promise<void>} resolves after the refresh.
         */
        const toggleEnabled = async (item) => {
          await runMutation('enable', { ...rowTarget(item), enable: item.enable !== true }, 'notice.saved')
        }

        /**
         * Load one entry's details.
         * @param {Record<string, any>} item - entry row.
         * @returns {Promise<void>} resolves after the load.
         */
        const loadDetail = async (item) => {
          if (showsDetails(item)) {
            setDetail(null)
            return
          }
          const envelope = await runAction('detail', rowTarget(item), `detail:${item.name}`)
          if (envelope === null) return
          if (envelope.ok !== true) {
            setBanner({ kind: 'error', text: describeErrorFor(t, envelope.error) })
            return
          }
          setDetail({ index: item.index, name: item.name, data: envelope.data })
        }

        /**
         * Delete one entry.
         * @param {Record<string, any>} item - entry row.
         * @returns {Promise<void>} resolves after the refresh.
         */
        const removeEntry = async (item) => {
          const envelope = await runMutation('remove', rowTarget(item), 'notice.deleted')
          if (envelope !== null && envelope.ok === true) {
            setConfirmIndex(null)
            if (showsDetails(item)) setDetail(null)
          }
        }

        /**
         * Open the editor for a new or existing entry.
         * @param {Record<string, any> | null} item - entry view, or null to add.
         * @returns {void}
         */
        const openEditor = (item) => {
          setConfirmIndex(null)
          setBanner(null)
          if (item === null) {
            setEditor({
              mode: 'add',
              originalName: null,
              fieldErrors: {},
              form: {
                name: '',
                host: '',
                port: '22',
                user: '',
                password: '',
                passwordDirty: false,
                clearPassword: false,
                hasPassword: false,
                IdentityFile: '',
                remotePath: '',
                mount: '',
                enable: true,
                allowOther: true,
                uid: '',
                gid: '',
                extraOptions: '',
              },
            })
            return
          }
          setEditor({
            mode: 'edit',
            originalName: item.name,
            originalIndex: item.index,
            fieldErrors: {},
            form: {
              name: item.name ?? '',
              host: item.host ?? '',
              port: String(item.port ?? 22),
              user: item.user ?? '',
              password: '',
              passwordDirty: false,
              clearPassword: false,
              hasPassword: item.hasPassword === true,
              IdentityFile: item.IdentityFile ?? '',
              remotePath: item.remotePath ?? '',
              mount: item.mount ?? '',
              enable: item.enable === true,
              allowOther: item.allowOther !== false,
              uid: item.uid ?? '',
              gid: item.gid ?? '',
              extraOptions: Array.isArray(item.extraOptions) ? item.extraOptions.join(', ') : String(item.extraOptions ?? ''),
            },
          })
        }

        /**
         * Update one editor form field.
         * @param {string} key - form field.
         * @param {unknown} value - new value.
         * @returns {void}
         */
        const setFormField = (key, value) => {
          setEditor((current) => {
            if (current === null) return current
            return { ...current, form: { ...current.form, [key]: value } }
          })
        }

        /**
         * Save the open editor.
         * @returns {Promise<void>} resolves after the save attempt.
         */
        const saveEditor = async () => {
          if (editor === null) return
          const form = editor.form
          const payload = {
            name: form.name.trim(),
            host: form.host.trim(),
            port: Number.parseInt(form.port, 10) || 22,
            user: form.user.trim(),
            IdentityFile: form.IdentityFile.trim(),
            remotePath: form.remotePath.trim(),
            mount: form.mount.trim(),
            enable: form.enable,
            allowOther: form.allowOther,
            uid: form.uid.trim(),
            gid: form.gid.trim(),
            extraOptions: String(form.extraOptions ?? '').split(/[, ]+/u).map(part => part.trim()).filter(part => part.length > 0),
          }
          if (form.clearPassword) payload.password = ''
          else if (form.passwordDirty) payload.password = form.password
          const action = editor.mode === 'add' ? 'add' : 'update'
          const body = editor.mode === 'add'
            ? { item: payload }
            : { name: editor.originalName, ...(Number.isInteger(editor.originalIndex) ? { index: editor.originalIndex } : {}), item: payload }
          const envelope = await runAction(action, body, 'save')
          if (envelope === null) return
          if (envelope.ok !== true) {
            if (envelope.error?.code === 'validation') {
              setEditor(current => current === null ? current : { ...current, fieldErrors: envelope.error.fields ?? {} })
            }
            setBanner({ kind: 'error', text: describeErrorFor(t, envelope.error) })
            return
          }
          setEditor(null)
          setBanner({ kind: 'ok', text: t('notice.saved') })
          await reload()
        }

        // Escape closes the editor dialog; the page root owns the key handler
        // because focus always sits inside the page.
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          if (editor !== null) setEditor(null)
          else if (detail !== null) setDetail(null)
        }

        const visibleItems = items.filter((item) => {
          if (filter === 'enabled' && item.enable !== true) return false
          if (filter === 'mounted' && item.mounted !== true) return false
          const needle = query.trim().toLowerCase()
          if (needle === '') return true
          return [item.name, item.host, item.user, item.remotePath, item.mount]
            .some(value => String(value ?? '').toLowerCase().includes(needle))
        })

        const filterButton = (id, count) => h('button', {
          key: id,
          type: 'button',
          className: 'asf-filter',
          'data-active': filter === id ? 'true' : 'false',
          onClick: () => setFilter(id),
        }, `${t(`filter.${id}`)}${count === undefined ? '' : ` ${String(count)}`}`)

        return h('div', { className: 'asf-page', onKeyDown },
          h('style', { dangerouslySetInnerHTML: { __html: PAGE_CSS } }),

          h('header', { className: 'asf-header' },
            h('div', { className: 'asf-header-text' },
              h('div', { className: 'asf-titleline' },
                h('span', { className: 'asf-mark' }, h(Mark, { size: 20 })),
                h('h1', { className: 'asf-h1' }, t('page.title')),
                dependencies === undefined ? null : h(Chip, {
                  tone: dependencies.sshfs?.present ? 'ok' : 'error',
                  text: dependencies.sshfs?.present
                    ? t('header.sshfs', { version: dependencies.sshfs.version ?? '' })
                    : t('header.sshfsMissing'),
                }),
                summary === undefined ? null : h(Chip, {
                  tone: summary.mounted > 0 ? 'ok' : 'idle',
                  text: t('header.mounted', { mounted: summary.mounted, total: summary.total }),
                }),
              ),
              h('p', { className: 'asf-sub' },
                snapshot === null
                  ? t('state.loading')
                  : t('page.subtitle', { path: snapshot.configPath }),
              ),
            ),
            h('div', { className: 'asf-header-actions' },
              h('button', {
                className: 'asf-button',
                type: 'button',
                'data-variant': 'outline',
                disabled,
                onClick: () => { reload(true).catch(error => setBanner({ kind: 'error', text: String(error?.message ?? error) })) },
              }, t('action.refresh')),
              h('button', {
                className: 'asf-button',
                type: 'button',
                'data-variant': 'outline',
                disabled: disabled || items.length === 0,
                onClick: () => { runMountAction('mount').catch(() => {}) },
              }, t('action.mountAll')),
              h('button', {
                className: 'asf-button',
                type: 'button',
                'data-variant': 'outline',
                disabled: disabled || summary?.mounted === 0,
                onClick: () => { runMountAction('umount').catch(() => {}) },
              }, t('action.umountAll')),
              h('button', {
                className: 'asf-button',
                type: 'button',
                'data-variant': 'primary',
                disabled,
                onClick: () => openEditor(null),
              }, t('action.add')),
            ),
          ),

          transportError === null ? null : h('div', { className: 'asf-banner', 'data-kind': 'error' },
            h('div', { className: 'asf-banner-body' },
              h('span', { className: 'asf-banner-title' }, t('state.loadFailed')),
              h('span', null, transportError),
              h('span', { className: 'asf-muted' }, t('page.hostHint')),
            ),
          ),

          banner === null ? null : h('div', { className: 'asf-banner', 'data-kind': banner.kind },
            h('div', { className: 'asf-banner-body' }, h('span', null, banner.text)),
          ),

          blockers.length === 0 ? null : h('div', { className: 'asf-strip' },
            h('span', { className: 'asf-strip-icon' }, h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
              h('path', { d: 'M12 4.5 3.2 19.5h17.6L12 4.5Z', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round' }),
              h('path', { d: 'M12 10v4.2M12 17.1v.4', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }))),
            h('span', { className: 'asf-strip-text' }, t('deps.strip.title', { count: blockers.length })),
            h('button', {
              className: 'asf-button',
              type: 'button',
              'data-size': 'sm',
              onClick: () => {
                setTab('help')
                setBanner(null)
              },
            }, t('action.viewHelp')),
          ),

          h('nav', { className: 'asf-tabs', role: 'tablist' },
            h('button', {
              type: 'button',
              role: 'tab',
              className: 'asf-tab',
              'data-active': tab === 'mounts' ? 'true' : 'false',
              'aria-selected': tab === 'mounts',
              onClick: () => setTab('mounts'),
            }, t('tabs.mounts')),
            h('button', {
              type: 'button',
              role: 'tab',
              className: 'asf-tab',
              'data-active': tab === 'help' ? 'true' : 'false',
              'aria-selected': tab === 'help',
              onClick: () => setTab('help'),
            }, t('tabs.help')),
          ),

          h('div', { className: 'asf-scroll' },
            h('div', { className: 'asf-content' }, tab === 'mounts'
              ? renderMounts()
              : renderHelp()),
          ),

          editor === null ? null : h('div', {
            className: 'asf-overlay',
            onMouseDown: event => { if (event.target === event.currentTarget) setEditor(null) },
          },
          h('div', {
            className: 'asf-dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': editor.mode === 'add' ? t('editor.addTitle') : t('editor.editTitle', { name: editor.originalName ?? '' }),
          },
          h('div', { className: 'asf-dialog-head' },
            h('h2', { className: 'asf-dialog-title' }, editor.mode === 'add' ? t('editor.addTitle') : t('editor.editTitle', { name: editor.originalName ?? '' })),
            h('span', { className: 'asf-dialog-hint' }, t('editor.requiredHint')),
            h('button', {
              className: 'asf-dialog-close',
              type: 'button',
              'aria-label': t('action.close'),
              onClick: () => setEditor(null),
            }, h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
              h('path', { d: 'M6.5 6.5l11 11M17.5 6.5l-11 11', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' }))),
          ),
          h('div', { className: 'asf-dialog-body' },
            h('h3', { className: 'asf-subhead' }, t('editor.connection')),
            h('div', { className: 'asf-grid' },
              h(TextField, {
                label: t('field.name'),
                value: editor.form.name,
                error: fieldError(t, editor.fieldErrors.name),
                onChange: value => setFormField('name', value),
              }),
              h(TextField, {
                label: t('field.host'),
                value: editor.form.host,
                error: fieldError(t, editor.fieldErrors.host),
                placeholder: 'example.com',
                onChange: value => setFormField('host', value),
              }),
              h(TextField, {
                label: t('field.port'),
                value: editor.form.port,
                error: fieldError(t, editor.fieldErrors.port),
                onChange: value => setFormField('port', value),
              }),
              h(TextField, {
                label: t('field.user'),
                value: editor.form.user,
                onChange: value => setFormField('user', value),
              }),
              h(TextField, {
                label: t('field.remotePath'),
                value: editor.form.remotePath,
                error: fieldError(t, editor.fieldErrors.remotePath),
                placeholder: '/srv/data',
                onChange: value => setFormField('remotePath', value),
              }),
              h(TextField, {
                label: t('field.mount'),
                value: editor.form.mount,
                error: fieldError(t, editor.fieldErrors.mount),
                placeholder: '/mnt/data',
                onChange: value => setFormField('mount', value),
              }),
              h(TextField, {
                label: t('field.password'),
                type: 'password',
                value: editor.form.password,
                placeholder: editor.form.hasPassword ? t('field.passwordKeep') : '',
                onChange: (value) => {
                  setEditor((current) => current === null ? current : {
                    ...current,
                    form: { ...current.form, password: value, passwordDirty: true, clearPassword: false },
                  })
                },
              }),
              h(TextField, {
                label: t('field.identityFile'),
                value: editor.form.IdentityFile,
                placeholder: '~/.ssh/id_ed25519',
                onChange: value => setFormField('IdentityFile', value),
              }),
            ),
            editor.form.hasPassword ? h(CheckField, {
              label: t('field.clearPassword'),
              checked: editor.form.clearPassword,
              onChange: (checked) => {
                setEditor((current) => current === null ? current : {
                  ...current,
                  form: { ...current.form, clearPassword: checked, password: checked ? '' : current.form.password, passwordDirty: false },
                })
              },
            }) : null,
            h('h3', { className: 'asf-subhead' }, t('editor.mountOptions')),
            h('div', { className: 'asf-grid' },
              h(TextField, {
                label: t('field.uid'),
                value: editor.form.uid,
                onChange: value => setFormField('uid', value),
              }),
              h(TextField, {
                label: t('field.gid'),
                value: editor.form.gid,
                onChange: value => setFormField('gid', value),
              }),
            ),
            h('div', { className: 'asf-grid', 'data-span': 'full' },
              h(TextField, {
                label: t('field.extraOptions'),
                value: editor.form.extraOptions,
                hint: t('field.extraOptionsHint'),
                onChange: value => setFormField('extraOptions', value),
              }),
            ),
            h(CheckField, {
              label: t('field.enable'),
              checked: editor.form.enable,
              onChange: checked => setFormField('enable', checked),
            }),
            h(CheckField, {
              label: t('field.allowOther'),
              checked: editor.form.allowOther,
              onChange: checked => setFormField('allowOther', checked),
            }),
          ),
          h('div', { className: 'asf-dialog-foot' },
            h('button', {
              className: 'asf-button',
              type: 'button',
              'data-variant': 'primary',
              disabled,
              onClick: () => { saveEditor().catch(() => {}) },
            }, t('action.save')),
            h('button', {
              className: 'asf-button',
              type: 'button',
              'data-variant': 'outline',
              disabled,
              onClick: () => setEditor(null),
            }, t('action.cancel')),
          ),
          )),
        )

        /**
         * Render the mount list tab.
         * @returns {object} the tab content.
         */
        function renderMounts() {
          if (snapshot === null) {
            return h('div', { className: 'asf-loading' }, busy === null ? t('state.loading') : t('notice.running'))
          }
          return [
            h('div', { key: 'toolbar', className: 'asf-toolbar' },
              h('input', {
                className: 'asf-search',
                type: 'search',
                value: query,
                placeholder: t('search.placeholder'),
                'aria-label': t('search.placeholder'),
                onChange: event => setQuery(event.target.value),
              }),
              h('div', { className: 'asf-filters', role: 'group' },
                filterButton('all', items.length),
                filterButton('enabled', items.filter(item => item.enable === true).length),
                filterButton('mounted', items.filter(item => item.mounted === true).length),
              ),
              h('span', { className: 'asf-count' }, t('list.count', { shown: visibleItems.length, total: items.length })),
            ),
            report === null ? null : renderReport(),
            items.length === 0
              ? h('div', { key: 'empty', className: 'asf-empty' },
                h('span', { className: 'asf-empty-mark' }, h(Mark, { size: 34 })),
                h('span', null, t('state.empty')),
                h('button', {
                  className: 'asf-button',
                  type: 'button',
                  'data-variant': 'primary',
                  disabled,
                  onClick: () => openEditor(null),
                }, t('action.add')),
              )
              : visibleItems.length === 0
                ? h('div', { key: 'nomatch', className: 'asf-empty' }, h('span', null, t('state.noMatch')))
                : h('div', { key: 'list', className: 'asf-list' }, visibleItems.map(renderEntry)),
          ]
        }

        /**
         * Render one entry row.
         * @param {Record<string, any>} item - entry view.
         * @returns {object} the row.
         */
        function renderEntry(item) {
          const source = `${item.user === '' ? '' : `${item.user}@`}${item.host}:${item.remotePath}`
          return h('div', {
            key: `${item.name}#${String(item.index)}`,
            className: 'asf-entry',
            'data-mounted': item.mounted === true ? 'true' : 'false',
          },
          h('div', { className: 'asf-entry-main' },
            h('div', { className: 'asf-entry-title' },
              h('span', { className: 'asf-name', title: item.name }, item.name),
              h(Chip, { tone: item.mounted ? 'ok' : 'idle', text: t(item.mounted ? 'badge.mounted' : 'badge.unmounted') }),
              item.enable !== true ? h(Chip, { tone: 'warn', text: t('badge.disabled') }) : null,
              item.hasPassword ? h(Chip, { tone: 'idle', text: t('badge.password') }) : null,
            ),
            h('span', { className: 'asf-entry-source', title: source }, source),
          ),
          h('div', { className: 'asf-entry-mount' },
            h('span', { className: 'asf-entry-mount-label' }, t('entry.mountPoint')),
            h('code', { title: item.mount }, item.mount),
          ),
          h('div', { className: 'asf-entry-actions' },
            h('button', {
              className: 'asf-button',
              type: 'button',
              'data-size': 'sm',
              'data-variant': 'outline',
              'data-tone': item.mounted ? 'danger' : undefined,
              disabled,
              onClick: () => { runMountAction(item.mounted ? 'umount' : 'mount', item).catch(() => {}) },
            }, t(item.mounted ? 'action.umount' : 'action.mount')),
            h('button', {
              type: 'button',
              role: 'switch',
              className: 'asf-switch',
              'data-size': 'sm',
              'aria-checked': item.enable === true,
              'aria-label': t(item.enable === true ? 'action.disable' : 'action.enable'),
              title: t(item.enable === true ? 'action.disable' : 'action.enable'),
              disabled,
              onClick: () => { toggleEnabled(item).catch(() => {}) },
            }, h('span', { className: 'asf-thumb' })),
            h('button', {
              className: 'asf-button',
              type: 'button',
              'data-size': 'sm',
              'data-variant': 'ghost',
              disabled,
              onClick: () => { loadDetail(item).catch(() => {}) },
            }, t(showsDetails(item) ? 'action.hideDetails' : 'action.details')),
            h('button', {
              className: 'asf-button',
              type: 'button',
              'data-size': 'sm',
              'data-variant': 'ghost',
              disabled,
              onClick: () => openEditor(item),
            }, t('action.edit')),
            confirmIndex === item.index
              ? h('button', {
                className: 'asf-button',
                type: 'button',
                'data-size': 'sm',
                'data-variant': 'primary',
                'data-tone': 'danger',
                disabled,
                onClick: () => { removeEntry(item).catch(() => {}) },
              }, t('action.confirmDelete'))
              : h('button', {
                className: 'asf-button',
                type: 'button',
                'data-size': 'sm',
                'data-variant': 'ghost',
                'data-tone': 'danger',
                disabled,
                onClick: () => setConfirmIndex(item.index),
              }, t('action.delete')),
            confirmIndex === item.index
              ? h('button', {
                className: 'asf-button',
                type: 'button',
                'data-size': 'sm',
                'data-variant': 'ghost',
                onClick: () => setConfirmIndex(null),
              }, t('action.cancel'))
              : null,
          ),
          showsDetails(item) ? h('dl', { className: 'asf-details' },
            h('dt', null, t('details.heading')),
            h('dd', { className: 'asf-muted' }, detail.data.mount?.mounted === true
              ? `${detail.data.mount.source ?? ''}`
              : t('details.notMounted')),
            h('dt', null, t('details.fstype')),
            h('dd', null, detail.data.mount?.fstype ?? '—'),
            h('dt', null, t('details.mountOptions')),
            h('dd', { className: 'asf-mono' }, detail.data.mount?.mounted === true
              ? (detail.data.mount.options ?? []).join(', ')
              : '—'),
            h('dt', null, t('details.password')),
            h('dd', null, detail.data.hasPassword ? t('details.passwordSaved') : t('details.passwordKey')),
            h('dt', null, t('details.configPath')),
            h('dd', { className: 'asf-mono' }, detail.data.configPath ?? ''),
          ) : null,
          )
        }

        /**
         * Render the last operation report.
         * @returns {object} the report card.
         */
        function renderReport() {
          const data = report.data ?? {}
          const failed = data.summary?.failed ?? 0
          return h('section', { key: 'report', className: 'asf-report' },
            h('div', { className: 'asf-report-head' },
              h(Chip, { tone: failed === 0 ? 'ok' : 'error', text: `${String(data.summary?.ok ?? 0)}/${String(data.summary?.total ?? 0)}` }),
              h('span', null, report.action === 'install'
                ? t('action.install')
                : t(report.action === 'mount' ? 'result.mountSummary' : 'result.umountSummary', {
                    ok: data.summary?.ok ?? 0,
                    total: data.summary?.total ?? 0,
                  })),
              h('span', { style: { marginLeft: 'auto' } }, h('button', {
                className: 'asf-button',
                type: 'button',
                'data-size': 'sm',
                'data-variant': 'ghost',
                onClick: () => setReport(null),
              }, t('action.clear'))),
            ),
            h('ul', { className: 'asf-report-list' },
              (data.results ?? []).map((result, index) => h('li', {
                key: `${report.action}:${String(result.name)}:${String(index)}`,
                className: 'asf-report-item',
                'data-ok': result.ok === true ? 'true' : 'false',
              },
              h(Chip, { tone: result.ok === true ? 'ok' : 'error', text: t(result.ok === true ? 'result.ok' : 'result.failed') }),
              h('span', null, result.name),
              result.ok !== true && result.code !== undefined
                ? h('span', null, describeCode(t, 'error', result.code, { message: result.message, mount: result.mount }))
                : h('span', { className: 'asf-mono' }, result.mount ?? ''),
              ...(result.warnings ?? []).map((warning, warningIndex) => h('span', {
                key: `warn-${String(warningIndex)}`,
                className: 'asf-muted',
              }, describeCode(t, 'warn', warning.code, warning))),
              )),
            ),
          )
        }

        /**
         * Render the help tab: quick start, dependencies, configuration, agent
         * usage, troubleshooting, and command-line compatibility.
         * @returns {object} the help content.
         */
        function renderHelp() {
          const fuseReady = dependencies === undefined
            ? undefined
            : dependencies.platform === 'darwin'
              ? dependencies.fuse?.macfuse === true || dependencies.fuse?.fuseT === true
              : dependencies.fuse?.device === true
          const allowOtherState = dependencies === undefined
            ? 'unknown'
            : dependencies.platform === 'linux'
              ? (dependencies.root === true || dependencies.fuse?.conf?.enabled === true ? 'enabled' : 'disabled')
              : 'unknown'
          const installable = (target) => issues.find(issue => issue.installTarget === target && issue.installable === true)

          return h('div', { className: 'asf-help' },
            h('p', { className: 'asf-help-lead' }, t('help.intro')),

            h('section', { className: 'asf-card' },
              h('h2', { className: 'asf-card-title' }, t('help.quick.title')),
              h('ol', { className: 'asf-steps' },
                [1, 2, 3].map(step => h('li', { key: `step-${String(step)}`, className: 'asf-step' },
                  h('span', { className: 'asf-step-title' }, t(`help.quick.step${String(step)}.title`)),
                  h('p', { className: 'asf-step-body' }, t(`help.quick.step${String(step)}.body`)),
                )),
              ),
            ),

            h('section', { className: 'asf-card' },
              h('div', { className: 'asf-report-head' },
                h('h2', { className: 'asf-card-title', style: { margin: 0 } }, t('help.deps.title')),
                h('span', { style: { marginLeft: 'auto' } }, h('button', {
                  className: 'asf-button',
                  type: 'button',
                  'data-size': 'sm',
                  disabled,
                  onClick: async () => {
                    const envelope = await runAction('check', {}, 'check')
                    if (envelope !== null && envelope.ok === true) setBanner({ kind: 'ok', text: t('notice.checked') })
                    await reload(true)
                  },
                }, t('action.recheck'))),
              ),
              h('p', { className: 'asf-note' }, t('help.deps.intro')),
              h('table', { className: 'asf-table asf-deps-table' },
                h('tbody', null,
                  h('tr', null,
                    h('td', null, t('help.deps.sshfs')),
                    h('td', null, dependencies?.sshfs?.present === true
                      ? `${t('help.deps.ready')}${dependencies.sshfs.version === undefined ? '' : ` · ${String(dependencies.sshfs.version)}`}${dependencies.sshfs.path === undefined ? '' : ` · ${String(dependencies.sshfs.path)}`}`
                      : t('help.deps.missing')),
                    h('td', null, installable('sshfs') === undefined
                      ? null
                      : h('button', {
                        className: 'asf-button',
                        type: 'button',
                        'data-size': 'sm',
                        disabled,
                        onClick: () => { installTarget('sshfs').catch(() => {}) },
                      }, t('action.install'))),
                  ),
                  h('tr', null,
                    h('td', null, t('help.deps.fuse')),
                    h('td', null, fuseReady === undefined
                      ? t('help.deps.unknown')
                      : fuseReady ? t('help.deps.ready') : t('help.deps.missing')),
                    h('td', null),
                  ),
                  h('tr', null,
                    h('td', null, t('help.deps.allowOther')),
                    h('td', null, allowOtherState === 'unknown'
                      ? t('help.deps.unknown')
                      : allowOtherState === 'enabled' ? t('help.deps.enabled') : t('help.deps.disabled')),
                    h('td', null, installable('allow_other') === undefined
                      ? null
                      : h('button', {
                        className: 'asf-button',
                        type: 'button',
                        'data-size': 'sm',
                        disabled,
                        onClick: () => { installTarget('allow_other').catch(() => {}) },
                      }, t('action.install'))),
                  ),
                ),
              ),
              h('p', { className: 'asf-note' }, t('help.deps.autoNote')),
              blockers.length === 0 ? null : h('div', { className: 'asf-faq' },
                blockers.map(issue => h('div', { key: issue.id, className: 'asf-faq-item' },
                  h('span', { className: 'asf-faq-q' }, describeCode(t, 'issue', issue.id, { message: issue.message })),
                  issue.command === undefined ? null : h(CodeBlock, { text: issue.command }),
                )),
              ),
              h('h3', { className: 'asf-subhead' }, t('help.deps.linux.title')),
              h(CodeBlock, { text: t('help.deps.linux.body') }),
              h('h3', { className: 'asf-subhead' }, t('help.deps.macos.title')),
              h(CodeBlock, { text: t('help.deps.macos.body') }),
              h('p', { className: 'asf-note' }, t('help.deps.macosNote')),
              h('h3', { className: 'asf-subhead' }, t('help.deps.allowOther.title')),
              h(CodeBlock, { text: t('help.deps.allowOther.body') }),
            ),

            h('section', { className: 'asf-card' },
              h('h2', { className: 'asf-card-title' }, t('help.config.title')),
              h('p', { className: 'asf-note' }, t('help.config.intro', { path: snapshot?.configPath ?? '~/.autosshfs.json' })),
              h('h3', { className: 'asf-subhead' }, t('help.config.sampleTitle')),
              h(CodeBlock, { text: t('help.config.sample') }),
              h('h3', { className: 'asf-subhead' }, t('help.config.fields')),
              h('table', { className: 'asf-table' },
                h('thead', null, h('tr', null,
                  h('th', null, t('help.config.colField')),
                  h('th', null, t('help.config.colHint')),
                )),
                h('tbody', null,
                  ['host', 'port', 'user', 'password', 'IdentityFile', 'remotePath', 'mount', 'enable', 'allowOther', 'uid', 'gid', 'extraOptions'].map(field => h('tr', { key: field },
                    h('td', null, h('code', null, field)),
                    h('td', null, t(`fieldHint.${field}`)),
                  )),
                ),
              ),
            ),

            h('section', { className: 'asf-card' },
              h('h2', { className: 'asf-card-title' }, t('help.agent.title')),
              h('p', { className: 'asf-note' }, t('help.agent.intro')),
              h(CodeBlock, { text: t('help.agent.example') }),
            ),

            h('section', { className: 'asf-card' },
              h('h2', { className: 'asf-card-title' }, t('help.faq.title')),
              h('div', { className: 'asf-faq' },
                [1, 2, 3, 4, 5].map(index => h('div', { key: `faq-${String(index)}`, className: 'asf-faq-item' },
                  h('span', { className: 'asf-faq-q' }, t(`help.faq.q${String(index)}`)),
                  h('p', { className: 'asf-faq-a' }, t(`help.faq.a${String(index)}`)),
                )),
              ),
            ),

            h('section', { className: 'asf-card' },
              h('h2', { className: 'asf-card-title' }, t('help.compat.title')),
              h('p', { className: 'asf-note' }, t('help.compat.body')),
            ),
          )
        }
      }
    }

    // -------------------------------------------------------------- activation

    /**
     * Register dictionaries, the main panel, and its sidebar button.
     * @param {import('@deepseek-ai/cordis').Context} ctx - browser plugin context.
     * @returns {void}
     */
    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      ctx.effect(() => {
        try {
          return ctx.locale.register(NS, { en, zh })
        } catch (error) {
          // A second copy of the bundle in the same page owns the namespace;
          // the page still renders from the registered dictionaries.
          console.warn('[autosshfs] locale namespace is already registered', error)
          return () => {}
        }
      }, 'autosshfs: dictionaries')

      // The menu row renders inside the shell's menu card, outside this page, so
      // its small stylesheet is owned by the plugin effect instead.
      ctx.effect(() => {
        const style = document.createElement('style')
        style.dataset.dshPlugin = 'autosshfs'
        style.textContent = MENU_CSS
        document.head.append(style)
        return () => { style.remove() }
      }, 'autosshfs: menu row styles')

      // The main-column page, dispatched by the More-menu row below.
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
      }, createPage(t)))

      // One row in the sidebar's existing More menu instead of a panel-list row:
      // the panel list costs one labelled line per entry, and this feature does
      // not earn a permanent line in the navigation column.
      ctx.slots.inject('sidebar.panellist.actions', () => ctx.slots.register({
        name: 'sidebar.panellist.actions',
        id: PANEL_ID,
        order: PANEL_ORDER,
        locale: NS,
      }, createMenuRow(t, () => { ctx.layout.selectPanel(PANEL_ID) })))
    }

    return { inject: ['slots', 'locale', 'layout'], apply }
  },
})
