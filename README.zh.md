# dshd-mac-path

**仅限 macOS 上的 DSH Desktop。** 为 DSH Desktop 中的 agent 命令行**恢复 macOS 登录 shell 的 PATH**（Homebrew、`/etc/paths.d` 等）。

## 问题（macOS 独有）

macOS 启动 GUI 应用时只给极简 PATH（`/usr/bin:/bin:/usr/sbin:/sbin`），因为 GUI 应用不会加载运行 `path_helper` 的 shell profile。DSH 的 bash 工具继承宿主进程的环境变量，所以装在 Homebrew 下的 CLI——`/opt/homebrew/bin/gh`、`node`、`git-lfs` 等——对 agent 命令不可见，即使你的终端一切正常：

```
$ gh --version
bash: gh: command not found
```

这**不是安装 DSH Desktop 导致的**：App 从不修改 PATH（它只为自己的终端生成私有的 `dsh`/`pnpm`/`node` shim）。从 Finder/Dock 启动的任何 DSH 宿主、乃至任何会 spawn shell 的 macOS GUI 应用，都会遇到同样的问题。Windows 不受影响（GUI 应用从注册表继承完整用户 PATH），Linux 一般也不受影响（GUI 应用拿到 systemd 用户会话的 PATH）。

## 插件做什么

插件加载时把缺失的目录前置到 `process.env.PATH`：

1. **系统条目**（仅 macOS，默认开启）：复刻 `path_helper` 的行为，读取 `/etc/paths` 和 `/etc/paths.d/` 下所有文件（按文件名排序）——也就是你终端里会有的那些目录。
2. **配置条目**：`extraPaths` 补充其它目录（Apple Silicon 用 `/opt/homebrew/bin`，Intel 用 `/usr/local/bin` 等）；非 macOS 平台上这是唯一生效的机制。

DSH 的 subprocess 服务每次 spawn 都会重新快照 `process.env`（`scrubbedParentEnv()`），所以**之后所有的 agent 命令**都能看到恢复后的 PATH。不改系统配置、不动 shell profile、不碰 launchd，且幂等——重复执行不会产生重复条目。

## 安装

需要 DSH Desktop（或带 `desktop` profile 的 `dsh` CLI）。从 DSH Desktop 托盘选择 **Open DSH Terminal**，然后：

```sh
# 发布到 npm 后
dsh plugin --profile desktop add dshd-mac-path

# 或直接从本仓库安装
dsh plugin --profile desktop add github:zhoudl0605/dshd-mac-path
```

然后**重启 DSH Desktop**，让插件进入 Loader 组合。在任意 agent 会话里验证：

```
$ which gh
/opt/homebrew/bin/gh
```

## 配置

Apple Silicon 上零配置即可用（会自动读取 `/etc/paths.d/homebrew`）。需要增删条目时，在 profile 的 `cordis.patch.yml` 里配置（见 [DSH 插件开发文档](https://github.com/anywhere-labs/deepseek-harness-desktop/blob/master/docs/plugin-development.md)）：

```yaml
- id: mac-path
  config:
    extraPaths:
      - /opt/homebrew/bin
    restoreSystemPaths: true
```

| 选项 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `extraPaths` | `string[]` | `[]` | 要前置的目录，按顺序排在系统条目之后。 |
| `restoreSystemPaths` | `boolean` | `true` | 从 `/etc/paths` + `/etc/paths.d/` 复刻 `path_helper`（仅 darwin）。 |

## 工作原理（供审查）

- `apply()` 在插件加载时运行于 DSH **宿主**进程——也就是负责 spawn agent `bash -c` 命令的那个进程。
- `applyPathFix()` 把 `collectPathDirs()`（系统 + 配置）合并进 `process.env.PATH`，只前置当前不存在的目录。
- `dsh-subprocess` 的 `scrubbedParentEnv()` 每次 spawn 都会重新读取 `process.env`，因此无需改动执行器。

## 开发

```sh
node --test lib/
```

无构建步骤，运行时零依赖——`@deepseek-ai/*` 包未发布到公共 npm registry，所以本插件刻意不在运行时 import 它们。

## 许可

MIT — 见 [LICENSE](LICENSE)。
