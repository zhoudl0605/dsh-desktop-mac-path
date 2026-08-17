# dsh-desktop-mac-path

[English](README.md) | [中文](README.zh.md)

**专为 macOS 上的 DSH Desktop 打造的修复插件。** 为 DSH Desktop 中的 agent 命令行**恢复 macOS 登录 shell 的 PATH**（Homebrew、`/etc/paths.d` 等）。

## 关于 DSH Desktop

本插件是专为 **DSH Desktop** 打造的第三方修复插件。DSH Desktop 是 DeepSeek Harness (DSH) 的桌面客户端，由 [anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop) 项目构建（"万物皆插件，桌面本身也是插件"）。只有在 **macOS** 上通过 Finder/Dock 启动 DSH Desktop 时才需要本插件（见下文[问题](#问题macos-独有)）。

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

**工具不存在也完全无害。** 不存在的目录、或者不是目录的条目——比如没装 Homebrew 的机器、`extraPaths` 指向未安装的工具链（nvm、cargo 等）、`/etc/paths.d` 里引用已被删除的目录——都会被自动跳过。插件永远不会因此失败，PATH 也不会残留无效条目。

## 安装

需要 DSH Desktop（或带 `desktop` profile 的 `dsh` CLI）。从 DSH Desktop 托盘选择 **Open DSH Terminal**，然后：

```sh
# 发布到 npm 后
dsh plugin --profile desktop add dsh-desktop-mac-path

# 或固定到最新 release 标签
dsh plugin --profile desktop add github:zhoudl0605/dsh-desktop-mac-path#v0.1.2
```

然后**重启 DSH Desktop**，让插件进入 Loader 组合。在任意 agent 会话里验证：

```
$ which gh
/opt/homebrew/bin/gh
```

## 配置

Apple Silicon 上零配置即可用（会自动读取 `/etc/paths.d/homebrew`）。需要增删条目时，在 profile 的 `cordis.patch.yml` 里配置（见 [DSH 插件开发文档](https://github.com/anywhere-labs/deepseek-harness-desktop/blob/master/docs/plugin-development.md)）：

```yaml
- id: desktop-mac-path
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
npm install
node --test lib/
```

无构建步骤。唯一运行时依赖是 [`@deepseek-ai/schemastery`](https://www.npmjs.com/package/@deepseek-ai/schemastery)（公共 npm registry 上发布）——用于定义静态 `Config` schema，遵循 [DSH「配置与发布」规范](https://deepseekdocs.com/docs/learn/dev/config-publish)。

## 参考

- [DSH 插件生态倡议书 (plugin-ecosystem.md)](https://github.com/anywhere-labs/deepseek-harness-desktop/blob/master/docs/plugin-ecosystem.md) —— 本插件遵循的生态约定（组合优先、声明清晰、兼容优先）。
- [DSH Desktop 插件开发 (plugin-development.md)](https://github.com/anywhere-labs/deepseek-harness-desktop/blob/master/docs/plugin-development.md) —— DSH 插件的编写与安装方式。

## 许可

MIT — 见 [LICENSE](LICENSE)。
