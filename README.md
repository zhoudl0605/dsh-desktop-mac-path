# dsh-desktop-mac-path

[English](README.md) | [中文](README.zh.md)

**A fixer plugin dedicated to DSH Desktop on macOS.** Restore the **macOS
login-shell PATH** (Homebrew, `/etc/paths.d`, …) for agent shell commands
running inside GUI-launched DSH Desktop hosts.

## About DSH Desktop

This plugin is a third-party fixer dedicated to **DSH Desktop** — the
desktop client for DeepSeek Harness (DSH), built by the
[anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop)
project ("everything is a plugin; the desktop itself is a plugin"). You only
need this fixer when DSH Desktop runs **on macOS** and is launched from
Finder/Dock (see [The problem](#the-problem-macos-specific) below).

## The problem (macOS-specific)

macOS launches GUI applications with a minimal PATH
(`/usr/bin:/bin:/usr/sbin:/sbin`) because they never source the shell
profiles that run `path_helper`. DSH's bash tool inherits the host process
environment, so CLI tools installed under Homebrew — `/opt/homebrew/bin/gh`,
`node`, `git-lfs`, … — are invisible to agent commands, even though your
Terminal works fine:

```
$ gh --version
bash: gh: command not found
```

This is **not** caused by DSH Desktop: the app never modifies PATH (it only
generates private `dsh`/`pnpm`/`node` shims for its own terminal). The same
problem hits any DSH host launched from Finder/Dock, or any other macOS GUI
app that spawns shells. Windows is unaffected (GUI apps inherit the full
user PATH from the registry) and Linux is generally unaffected (GUI apps get
the systemd user-session PATH).

## What this plugin does

When it loads, the plugin prepends the missing directories to
`process.env.PATH`:

1. **System entries** (macOS only, on by default): replicates `path_helper`
   by reading `/etc/paths` and every file in `/etc/paths.d/` (sorted by
   name) — exactly the directories your Terminal would have.
2. **Configured entries**: `extraPaths` for anything else
   (`/opt/homebrew/bin` on Apple Silicon, `/usr/local/bin` on Intel, …),
   which is also the only mechanism used on non-macOS platforms.

DSH's subprocess service snapshots `process.env` for every spawn
(`scrubbedParentEnv()`), so **every subsequent agent command** sees the
restored PATH. No system configuration, shell profile, or launchd setting is
touched, and the fix is idempotent — re-running it never duplicates entries.

## Install

Requires DSH Desktop (or a `dsh` CLI with a `desktop` profile). From the
DSH Desktop tray, open **Open DSH Terminal** and run:

```sh
# once published to npm
dsh plugin --profile desktop add dsh-desktop-mac-path

# or pinned to the latest release tag
dsh plugin --profile desktop add github:zhoudl0605/dsh-desktop-mac-path#v0.1.0
```

Then **restart DSH Desktop** so the plugin enters the Loader composition.
Verify inside any agent conversation:

```
$ which gh
/opt/homebrew/bin/gh
```

## Configuration

The plugin works with zero configuration on Apple Silicon (it picks up
`/etc/paths.d/homebrew` automatically). To add or adjust entries, configure
it in your profile's `cordis.patch.yml` (see the [DSH plugin
documentation](https://github.com/anywhere-labs/deepseek-harness-desktop/blob/master/docs/plugin-development.md)):

```yaml
- id: desktop-mac-path
  config:
    extraPaths:
      - /opt/homebrew/bin
    restoreSystemPaths: true
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `extraPaths` | `string[]` | `[]` | Directories to prepend, in order, after system entries. |
| `restoreSystemPaths` | `boolean` | `true` | Replicate `path_helper` from `/etc/paths` + `/etc/paths.d/` (darwin only). |

## How it works (for reviewers)

- `apply()` runs in the DSH **host** process when the plugin loads — the same
  process that spawns the agent's `bash -c` commands.
- `applyPathFix()` merges `collectPathDirs()` (system + configured) into
  `process.env.PATH`, prepending only directories that are not already
  present.
- `dsh-subprocess`'s `scrubbedParentEnv()` re-reads `process.env` at every
  spawn, so no executor change is required.

## Development

```sh
npm install
node --test lib/
```

No build step. The only runtime dependency is
[`@deepseek-ai/schemastery`](https://www.npmjs.com/package/@deepseek-ai/schemastery)
(published on the public npm registry) for the static `Config` schema,
following the [DSH "配置与发布" conventions](https://deepseekdocs.com/docs/learn/dev/config-publish).

## References

- [DSH Plugin Ecosystem (plugin-ecosystem.en.md)](https://github.com/anywhere-labs/deepseek-harness-desktop/blob/master/docs/plugin-ecosystem.en.md) — the ecosystem conventions this plugin follows (composition-first, clear declarations, compatibility-first).
- [DSH Desktop Plugin Development (plugin-development.en.md)](https://github.com/anywhere-labs/deepseek-harness-desktop/blob/master/docs/plugin-development.en.md) — how DSH plugins are written and installed.
- [DSH 插件生态倡议书 (plugin-ecosystem.md)](https://github.com/anywhere-labs/deepseek-harness-desktop/blob/master/docs/plugin-ecosystem.md) — 中文版。

## License

MIT — see [LICENSE](LICENSE).
