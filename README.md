# dsh-plugin-autosshfs

[![test](https://github.com/shudingbo/dsh-plugin-autosshfs/actions/workflows/test.yml/badge.svg)](https://github.com/shudingbo/dsh-plugin-autosshfs/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

DeepSeek Harness 插件：用 `sshfs` 在 Linux / macOS 上挂载、卸载远端目录。
把 `nrs-tools/lib/autosshfs.js` 的 sshfs 挂载 / 卸载能力做成 DeepSeek Harness 插件：
**入口在左侧栏「更多」菜单里，点击后在整个主界面打开独立页面**（不是设置页，也不占用侧栏的
面板行），同时把同一组操作以 `autosshfs` 工具暴露给 Agent。

- 配置文件仍然是 `~/.autosshfs.json`（可用 `AUTOSSHFS_CONFIG` 覆盖），**位置与格式都不变**，
  与命令行版 `autosshfs` 共用同一份数据。
- 支持 **Linux 与 macOS**（Windows 不支持；没有 sshfs 的 macOS 环境会给出安装指引）。
- 所有操作（列表、挂载状态、增删改、挂载/卸载、依赖检测与自动安装）都在界面上完成，
  Agent 工具调用的是同一套逻辑。

## 功能

| 功能 | 界面 | Agent 工具 `autosshfs` |
| --- | --- | --- |
| 查看全部配置项与实时挂载状态 | ✅ | `action: "state"` |
| 新增 / 编辑 / 删除配置项 | ✅ | `add` / `update` / `remove` |
| 启用 / 停用单项 | ✅ | `enable` |
| 挂载 / 卸载单项 | ✅ | `mount` / `umount` + `name` |
| 全部挂载 / 全部卸载 | ✅ | `mount` / `umount`（不带 `name`） |
| 查看单项详情（挂载来源、挂载选项等） | ✅ | `detail` |
| 系统依赖检测与自动安装 | ✅ | `check`（`install` 仅限界面，避免 Agent 改动机器权限） |

挂载选项与命令行版一致：`port`、`IdentityFile`、`password_stdin`（配置里有 `password` 时）、
`allow_other` + `default_permissions`、`uid` / `gid`、`extraOptions`。

相对命令行版的两处加固：

1. **不再拼接 shell 字符串**。所有命令以 argv 数组直接执行，主机名、路径、密码中的任何字符
   都不会被 shell 解释。
2. **挂载状态按挂载表精确匹配挂载点**（Linux 读 `/proc/self/mounts`，macOS 解析 `mount`），
   不再用 `mount` 输出里 `includes(path)` 的子串比较，`/mnt/a` 不会误判 `/mnt/ab`。

此外：配置写入是「临时文件 + rename」的原子写，文件权限固定为 `0600`（配置里可能有密码）。

## 安装

这是一个纯 JavaScript 的 Harness bundle（`package.json` 里的 `dsh.bundle.patch` + `dsh.client`），
没有构建步骤，`index.js` / `client.js` / `host/` 就是可以直接运行的源码。

### 方式零：从 npm 安装（发布到 npm 之后可用）

```
plugin_manager(action: "install_bundle", target: "@shudingbo/dsh-plugin-autosshfs")
```

这是唯一能享受插件页「检查更新 / 一键升级」的安装方式（详见文末「发布」与「升级」两节）。

### 方式一：直接从 GitHub 安装（推荐，未发布 npm 时也能用）

在 Harness 会话里让 `plugin_manager` 从仓库安装：

```
plugin_manager(action: "install_bundle", target: "github:shudingbo/dsh-plugin-autosshfs")
```

也可以把同一串 `github:shudingbo/dsh-plugin-autosshfs` 粘贴到 Harness Web 界面
**插件 → 添加插件** 的安装框里。安装结果里 `application: applied` 表示已生效。

本质上是 pnpm 的 git 依赖，所以在 profile 目录里手动安装等价于：

```bash
cd ~/.dsh/profiles/<profile>
pnpm add github:shudingbo/dsh-plugin-autosshfs
```

### 方式二：从本地目录安装（开发用）

```bash
git clone git@github.com:shudingbo/dsh-plugin-autosshfs.git
# 然后在 Harness 里：
plugin_manager(action: "install_bundle", target: "/绝对路径/dsh-plugin-autosshfs")
```

### 安装后

- 界面：左侧栏点击 **更多**，选择 **Autosshfs 挂载**，主界面会切换到独立挂载管理页
  （`sidebar.panellist.actions` → `main` 面板 `autosshfs`）。
- 工具：Agent 可直接调用 `autosshfs`。
- 卸载：`plugin_manager(action: "remove_bundle", target: "@shudingbo/dsh-plugin-autosshfs")`。

### 升级

**GitHub 安装的插件没有"检查更新"**：插件页的版本区只对从 npm registry 安装的依赖开放
（Host 端 `updatable` 判定要求依赖是 registry spec），`github:` / `link:` 这类依赖会被判定为
不可更新，详情页不会出现「版本 / 检查更新」区块。DSH 本身也没有后台自动更新——任何更新都是
用户发起的一次操作。

更新 GitHub 安装的插件 = 让它重新解析一次 git 依赖（取默认分支的最新提交）：

```
plugin_manager(action: "remove_bundle",  target: "@shudingbo/dsh-plugin-autosshfs")
plugin_manager(action: "install_bundle", target: "github:shudingbo/dsh-plugin-autosshfs")
```

装完刷新页面即可；Host 侧模块改动需要重启 Harness 进程（或把插件禁用再启用）才会重新加载。
重新安装会按 bundle 默认重新选中并启用。

想控制升级节奏，可以固定到 tag 或提交（同样是先 `remove_bundle`，再用带 committish 的 spec 安装）：

```
github:shudingbo/dsh-plugin-autosshfs#v1.0.1
github:shudingbo/dsh-plugin-autosshfs#<commit-sha>
```

> 已安装的包不能直接用 `install_bundle` 覆盖：带 HMR 的 profile 会对"包里已存在的依赖"直接抛
> `already-installed`，所以升级一律是"先卸载、再安装"。

补充两点：

- **本地 `link:` 安装**是例外：它直接指向工作目录，改代码即生效，不存在"更新"这一步。
- **发布到 npm 之后**：改用 npm 安装（`@shudingbo/dsh-plugin-autosshfs`）即可在插件页看到版本列表与
  一键升级（含失败回滚）——这是想要"点一下就更新"的唯一途径。

## 系统依赖（sshfs / FUSE）

插件会在「使用帮助 → 系统依赖」里显示依赖状态。Linux 上如果检测到包管理器、并且 `sudo -n` 可用
（免密 sudo），页面上的「自动安装」按钮会直接安装；否则页面展示需要手动执行的命令。

#### Linux

```bash
# Debian / Ubuntu
sudo apt-get install -y sshfs
# Fedora / RHEL
sudo dnf install -y fuse-sshfs        # 或 yum install -y fuse-sshfs
# Arch
sudo pacman -S --noconfirm sshfs
# openSUSE
sudo zypper --non-interactive install sshfs
# Alpine
sudo apk add sshfs
```

非 root 用户使用 `allow_other`（默认开启，让 root 的 docker daemon 等能访问挂载点）前，
必须在 `/etc/fuse.conf` 中启用 `user_allow_other`：

```bash
sudo sed -i 's/^#\s*user_allow_other/user_allow_other/' /etc/fuse.conf
```

容器内还需要把 `/dev/fuse` 传入容器，并确保 FUSE 内核模块可用（`sudo modprobe fuse`）。

#### macOS

Homebrew 已不再提供 macOS 的 `sshfs` 公式，需要自行选一套 FUSE 实现：

```bash
# 方案 A：FUSE-T（无需内核扩展，较新 macOS 更省事）
brew tap macos-fuse-t/homebrew-cask
brew install --cask fuse-t
brew install fuse-t-sshfs

# 方案 B：macFUSE（内核扩展，需要重启并在「系统设置 → 隐私与安全性」中允许）
brew install --cask macfuse
brew install gromgit/fuse/sshfs-mac
```

macOS 的 `allow_other` 需要先在 FUSE 提供方的设置里允许其他用户；否则插件会自动退回「不带
`allow_other`」重新挂载，并在结果里给出警告（此时只有当前用户能访问该挂载点）。若需要
macFUSE 的额外选项，可在配置项的 `extraOptions` 里追加，例如 `defer_permissions`。

## 配置文件

默认 `~/.autosshfs.json`，也可用环境变量 `AUTOSSHFS_CONFIG` 指定（两者都支持 `~` 展开）。
结构：

```json
{
  "list": [
    {
      "enable": true,
      "name": "project",
      "host": "example.com",
      "port": 22,
      "user": "me",
      "password": "",
      "IdentityFile": "~/.ssh/id_ed25519",
      "remotePath": "/srv/project",
      "mount": "/mnt/project",
      "allowOther": true,
      "uid": "1000",
      "gid": "1000",
      "extraOptions": ["reconnect", "ServerAliveInterval=15"]
    }
  ]
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `name` | 名称，界面与工具按它定位配置项；新建时会校验唯一性。历史配置若存在同名项，界面按「位置 + 名称」定位，不会误改到另一项 |
| `host` / `port` / `user` | SSH 目标，`user` 为空时使用当前本地用户 |
| `password` | 可选；存在时用 `-o password_stdin` 通过 stdin 传入。**明文保存在配置文件中**，不建议长期使用，优先 `IdentityFile` / ssh-agent |
| `IdentityFile` | 私钥路径，支持 `~/` |
| `remotePath` | 远端目录 |
| `mount` | 本地挂载点（绝对路径，不存在会自动创建） |
| `enable` | 是否参与「全部挂载」；缺省视为 `false`，与命令行版的 `mount` 循环一致 |
| `allowOther` | 是否附加 `allow_other`（默认 `true`）；Linux 非 root 需要 `user_allow_other`，macOS 失败会自动退回 |
| `uid` / `gid` | 透传 `uid=` / `gid=` |
| `extraOptions` | 额外 `-o` 选项，数组或以逗号/空格分隔的字符串 |

未识别的字段在保存时会原样保留，方便手工扩展。

## 使用

### 界面

**左侧栏「更多」→ 主界面独立页面**（整列空间，不再是设置弹窗，也不占用侧栏面板行）：

- **顶栏**：标题、sshfs 版本徽标、`已挂载/总数` 徽标、配置文件路径，以及刷新 / 全部挂载 /
  全部卸载 / 新增挂载四个操作。
- **依赖提示条**：存在依赖问题（错误或警告）时出现，一键跳到「使用帮助」。
- **「挂载列表」页**：搜索框（按名称 / 主机 / 挂载点过滤）、全部 / 已启用 / 已挂载三个筛选项、
  计数；每条记录显示名称、状态徽标（已挂载 / 未挂载 / 已禁用 / 已存密码）、
  `user@host:remotePath`、挂载点，以及挂载/卸载、启用开关、详情、编辑、删除（二次确认）。
  点击「详情」就地展开挂载来源、文件系统、挂载选项、认证方式。
- **新增/编辑**：居中弹层对话框，分「连接信息」「挂载选项」两组；Esc 或点击遮罩关闭；
  校验失败会标红对应字段；未修改的密码不会被上传（留空 = 保持不变）。
- **「使用帮助」页**：快速上手三步、系统依赖状态表（可「重新检测」/「自动安装」）、
  Linux 与 macOS 安装命令、`user_allow_other` 开关命令、配置文件示例与字段说明、
  Agent 调用示例、5 条常见问题、与命令行版共存说明。
- 操作结果（每个配置项的成败、失败原因、警告）显示在结果卡片里，便于排查。
- 界面全中文/英文双语，随 Harness 语言切换。
- 控件样式直接对齐 `@deepseek-ai/dsh-client-ui-primitives`：按钮用 ghost/outline/primary 三档
  （primary 的底色与前景色取 `--dsw-alias-button-primary-fill` / `--dsw-alias-label-primary-foreground`
  配对），开关用 `--dsw-alias-brand-primary` + `--dsw-alias-switch-thumb`，因此深色 / 浅色主题下
  文字都清晰可见。

### Agent 工具

```jsonc
// 列出现状
{ "action": "state" }
// 挂载全部启用的配置
{ "action": "mount" }
// 只挂载某一项
{ "action": "mount", "name": "project" }
// 新增配置
{ "action": "add", "entry": { "name": "p", "host": "h", "user": "me", "remotePath": "/srv", "mount": "/mnt/p" } }
// 修改（只传要改的字段，password 省略=保持，传 ""=清除）
{ "action": "update", "name": "p", "entry": { "allowOther": false } }
// 同名配置项可改用位置定位（位置上的 name 不匹配时会退回按名称查找）
{ "action": "detail", "index": 4 }
// 查看依赖问题（自动安装只在界面上提供：它会改动机器权限）
{ "action": "check" }
```

返回值是 JSON：`{ ok, action, data | error, summary }`，`error.code` / 结果项 `code` 是稳定标识，
`hint` / `command` 给出下一步可执行动作。

## 架构

```
dsh-plugin-autosshfs/
├── index.js            Host 入口：注册 HTTP 路由与 Agent 工具，共用一个 service 实例
├── client.js           Web 界面（main 面板页 + 「更多」菜单行，无 JSX）
├── host/
│   ├── service.js      唯一操作面：state/detail/add/update/remove/enable/mount/umount/install/check
│   ├── config.js       ~/.autosshfs.json 读写（原子写、0600）、归一化、校验、脱敏
│   ├── sshfs.js        挂载/卸载命令构建、失败分类、卸载阶梯
│   ├── deps.js         依赖检测（sshfs/FUSE/sudo）与自动安装
│   ├── system.js       平台探测、可执行文件查找、挂载表解析、fuse.conf
│   ├── exec.js         argv 方式执行命令（无 shell、带超时）
│   └── http.js         POST /api/autosshfs/rpc（复用 /api 的浏览器信任与登录 Cookie 校验）
├── locale/{en,zh}.json 插件管理页显示的标题/描述
├── icon.svg            插件管理页图标
├── .github/workflows/  CI：Node 22/24 上跑 npm test
├── LICENSE             MIT
├── .gitignore
└── test/               node:test 单元与集成测试（44 个用例）
```

界面与 Agent 工具都调用 `host/service.js` 的同一个 `call(action, payload)`，不存在两套实现。

界面挂载点：客户端注册 `main` 键（`autosshfs`）与 `sidebar.panellist.actions` 里的菜单行
（同一 id）；菜单行点击后通过 `layout.selectPanel('autosshfs')` 切换到该面板。页面自己负责
整列布局、滚动、弹层与帮助内容，主题色与控件样式全部沿用 DSH 的 `--dsw-alias-*` 令牌与
primitives 的按钮 / 开关规格。

## 故障排查

| 现象 | 处理 |
| --- | --- |
| 页面显示「无法读取挂载列表」 | 插件 Host 端未加载或 `/api/autosshfs/rpc` 不可达：确认 bundle 已启用、当前 Harness 提供 Web UI；另外确认 `webServer` 与 `connection` 服务存在 |
| `allow_other` 相关失败（Linux） | 按上文启用 `/etc/fuse.conf` 的 `user_allow_other`，或对该配置项关闭 `allowOther` |
| 卸载提示 busy | `sudo fuser -vm <挂载点>` 找到占用进程；插件会先尝试普通卸载，再 `fusermount -u`、`fusermount -uz`、`umount -l` |
| 认证失败 | 检查 `user`、`IdentityFile` 是否存在且权限正确（私钥 `600`），服务器的 `authorized_keys` 是否包含该公钥 |
| 首次连接报 host key | 先用 `ssh` 连接一次，或 `ssh-keyscan -H <host> >> ~/.ssh/known_hosts` |
| 自动安装未执行 | 需要免密 sudo（`sudo -n true` 成功）。否则按页面给出的命令在终端执行 |

## 发布（npm + GitHub Release）

包名 `@shudingbo/dsh-plugin-autosshfs`（scoped、公开）。

### 一次性准备

1. **scope 归属**：`@shudingbo` 必须是你自己的 npm 用户名，或你创建的 npm 组织。
   npm 的用户名和组织名共用同一命名空间，不能给已有用户名再建同名组织。
   - npm 用户名就是 `shudingbo` → 直接可用，**不需要建组织**；
   - 否则到 <https://www.npmjs.com/org/create> 建组织，或换成你拥有的 scope。
2. **首次发布必须显式公开**：scoped 包默认私有。仓库已在 `package.json` 固定
   `publishConfig.access = public` 与 `publishConfig.registry = https://registry.npmjs.org/`。
3. **CI 认证：先 staged，再换 OIDC**
   npm 从 2026 年起收紧 2FA：**granular token 直接 `npm publish` 会要求交互式 OTP**（CI 里会失败
   `EOTP`），2FA-bypass token 也将在 2027-01 失去直接发布能力。所以本仓库按"有没有
   `NPM_TOKEN`"选择两种模式：

   | 模式 | 触发条件 | 行为 |
   | --- | --- | --- |
   | **Staged** | 配置了 `NPM_TOKEN` secret | CI 执行 `npm stage publish`，维护者用 2FA 批准后才真正上线 |
   | **Trusted Publishing** | 没有 `NPM_TOKEN` | CI 用 OIDC 直接 `npm publish`，同一轮还会创建 GitHub Release |

   首次发布（包还不存在，无法配置 trusted publisher）走 Staged：
   1) 生成 granular token（权限选 **Read and write (publish and stage)**，scope `@shudingbo`），
      `gh secret set NPM_TOKEN --repo shudingbo/dsh-plugin-autosshfs`；
   2) 打 tag 跑发布，CI 输出 `staged with id <id>`；
   3) 本机 `npm login` 后 `npm stage approve <id>`（要 OTP），或到 npm 网站批准；
   4) 包上线后配置 trusted publisher（二选一）：
      ```bash
      npm trust github @shudingbo/dsh-plugin-autosshfs \
        --file release.yml --repo shudingbo/dsh-plugin-autosshfs --allow-publish -y
      ```
      或在包设置页添加 Trusted Publisher：GitHub / `shudingbo/dsh-plugin-autosshfs` / `release.yml`；
   5) `gh secret delete NPM_TOKEN --repo shudingbo/dsh-plugin-autosshfs` —— 之后每次打 tag
      都是全自动发布（含 GitHub Release）。
4. 账号开启 2FA 不影响 CI 发布：staged 模式在批准时才校验 OTP，OIDC 模式由 GitHub 身份代替。

### 发一个版本

```bash
npm test
npm version patch --no-git-tag-version   # 或 minor / major
git commit -am "chore(release): $(node -p "require('./package.json').version")"
git tag "v$(node -p "require('./package.json').version")"
git push origin main --tags
```

推送 tag 后 [Release workflow](./.github/workflows/release.yml) 自动执行：
测试 → 校验 tag 与 `package.json` 版本一致 → 发布（见上表：无 `NPM_TOKEN` 时 `npm publish` 并创建
GitHub Release；有 `NPM_TOKEN` 时 `npm stage publish`，需 2FA 批准后再手动/重跑创建 Release）。

本地直接发（需先 `npm login`）：`npm publish`；`prepublishOnly` 会先跑测试。

### 让 AI 帮你发

配置好上面的 token/secret 后，在会话里说一句「发布 1.0.2」即可，流程固定为：

1. `npm test`；2. 改 `package.json` 版本并提交；3. `git tag v1.0.2` + `git push --tags`；
4. 盯 `gh run watch`，把 npm 包地址与 GitHub Release 地址回报。

凭据只存在于 GitHub secret（或你本机 `~/.npmrc`），不会进入会话与仓库。

### 多个 registry（npm 官方 + 公司内部）

- 本仓库提交了 [`.npmrc`](./.npmrc)，只含 `@shudingbo:registry=https://registry.npmjs.org/`，
  **没有**任何 token：即使机器默认源指向公司 Verdaccio，`@shudingbo/*` 的发布与安装仍走官方源。
- 你现有的 `~/.npmrc`（`@cdyw` / `@ntypes` → `http://222.18.149.18:4873/`）不受影响，按 scope 各走各的。
- `package.json` 的 `publishConfig.registry` 再兜一层，任何 `npm publish` 都不会误发到内部源。
- 若希望内部 mirror 也能取到这个包：让 Verdaccio 配 uplink 代理 npmjs（只读拉取）；
  或另加一个使用 `INTERNAL_NPM_TOKEN` + `--registry=<内部源>` 的 job。**不要把内部 token 混进公开仓库的发布步骤。**
- 公司网络拦截 `registry.npmjs.org` 时，可在 CI 里设 `NPM_CONFIG_REGISTRY` / 代理；
  本仓库零依赖，测试不需要网络。

## 开发

无第三方依赖、无构建步骤，克隆即可运行：

```bash
git clone git@github.com:shudingbo/dsh-plugin-autosshfs.git
cd dsh-plugin-autosshfs
npm test          # node --test test/*.test.mjs（44 个用例，覆盖 Linux/macOS 两条路径）
```

测试覆盖：挂载表解析（含 `/proc/self/mounts` 八进制转义）、命令构建、失败分类、配置原子写与
权限、校验/去重、脱敏、service 全流程、依赖失败路径、Agent 工具 JSON 边界、HTTP 层的鉴权/方法/
内容类型/请求体上限/跨站拒绝，以及用 shell stub 模拟的成功挂载、`allow_other` 自动回退、卸载阶梯
与 busy 诊断。

插件改动后重新安装即可（本地目录安装是 link，改完刷新页面就能看到；改动 Host 侧代码时在
「插件」页把该插件关闭再打开即可重新加载）。GitHub 安装是 git 依赖，升级到新的提交需要
`plugin_manager` 重新安装或重启 Harness。

### 发布检查清单

- `npm test` 全绿；`node --check index.js client.js host/*.js`
- `package.json` 的 `name` 与 `client.js` 里 `window.__ModuleLoader__.load({ id })` 一致（现在是
  `@shudingbo/dsh-plugin-autosshfs`）
- `cordis.patch.yml` 的 `name` 与包名一致（YAML 里以 `@` 开头必须加引号）
- `version` 与要推的 tag（`vX.Y.Z`）一致 —— CI 会校验
- 不带任何真实主机、账号、密码或私钥；`~/.autosshfs.json` 已被 `.gitignore` 排除
