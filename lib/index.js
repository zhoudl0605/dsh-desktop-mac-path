/**
 * dsh-desktop-mac-path
 *
 * A fixer plugin dedicated to DSH Desktop
 * (https://github.com/anywhere-labs/deepseek-harness-desktop) on macOS:
 * restore the macOS login-shell PATH (Homebrew, /etc/paths.d, ...) for agent
 * shell commands running inside a GUI-launched DSH Desktop host.
 *
 * macOS launches GUI applications with a minimal PATH
 * (`/usr/bin:/bin:/usr/sbin:/sbin`) because they never source the shell
 * profiles that run `path_helper`. DSH's bash tool inherits the host process
 * environment, so CLI tools installed under Homebrew (`/opt/homebrew/bin/gh`,
 * `node`, ...) are invisible to agent commands even though a Terminal works
 * fine. This plugin prepends the missing directories to `process.env.PATH`
 * when it loads; DSH's subprocess service snapshots `process.env` for every
 * spawn (`scrubbedParentEnv()`), so every subsequent agent command sees the
 * restored PATH. No system configuration is touched.
 *
 * The problem is macOS-specific: Windows GUI apps inherit the full user PATH
 * from the registry, and Linux GUI apps get the systemd user-session PATH.
 * On non-darwin platforms this plugin only applies `extraPaths`.
 *
 * The only runtime dependency is `@deepseek-ai/schemastery` (published on the
 * public npm registry) for the static `Config` schema; everything else is
 * plain Node.js. `apply(ctx, config)` receives the schema-validated
 * configuration, and the exported helpers still parse defensively.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import z from "@deepseek-ai/schemastery";

export const name = "desktop-mac-path";

export const inject = [];

/**
 * Static configuration schema (schemastery), following the DSH plugin
 * conventions in the "配置与发布" docs:
 * https://deepseekdocs.com/docs/learn/dev/config-publish
 */
export const Config = z.object({
	/**
	 * Extra directories to prepend to PATH, in order, after any system
	 * entries. Typical use: `["/opt/homebrew/bin"]` on Apple Silicon, or
	 * `["/usr/local/bin"]` on Intel.
	 */
	extraPaths: z.array(z.string()).default([]),
	/**
	 * Replicate macOS `path_helper`: read `/etc/paths` and every file in
	 * `/etc/paths.d/` (sorted by name) and prepend the listed directories.
	 * Only applies on darwin. Defaults to true.
	 */
	restoreSystemPaths: z.boolean().default(true)
});

/**
 * Read the directories `path_helper` would prepend on this platform.
 * Returns an empty array on non-macOS platforms.
 * @returns system PATH directories in `path_helper` order.
 */
export function systemPathDirs() {
	if (process.platform !== "darwin") return [];
	const dirs = [];
	const pathsFile = "/etc/paths";
	if (existsSync(pathsFile)) {
		for (const line of readFileSync(pathsFile, "utf8").split("\n")) {
			const dir = line.trim();
			if (dir.length > 0) dirs.push(dir);
		}
	}
	const pathsDir = "/etc/paths.d";
	if (existsSync(pathsDir)) {
		const entries = readdirSync(pathsDir).filter((entry) => !entry.startsWith(".")).sort();
		for (const entry of entries) {
			const path = join(pathsDir, entry);
			let stat;
			try {
				stat = statSync(path);
			} catch {
				continue;
			}
			if (!stat.isFile()) continue;
			for (const line of readFileSync(path, "utf8").split("\n")) {
				const dir = line.trim();
				if (dir.length > 0) dirs.push(dir);
			}
		}
	}
	return dirs;
}

/**
 * Collect the directories that should be prepended for a configuration.
 *
 * Supported configuration fields (all optional):
 * - `restoreSystemPaths` (boolean, default `true`): replicate `path_helper`
 *   from `/etc/paths` + `/etc/paths.d/` (darwin only).
 * - `extraPaths` (string[], default `[]`): extra directories to prepend, in
 *   order, after any system entries.
 * @param config - raw plugin configuration.
 * @returns directories in application order.
 */
export function collectPathDirs(config = {}) {
	const dirs = [];
	if (config?.restoreSystemPaths !== false) dirs.push(...systemPathDirs());
	if (Array.isArray(config?.extraPaths)) {
		for (const entry of config.extraPaths) {
			if (typeof entry === "string" && entry.length > 0) dirs.push(entry);
		}
	}
	return dirs;
}

/**
 * Whether `dir` exists and is a directory (symlinks to directories count).
 * Non-existent entries are never added to PATH: a missing toolchain (no
 * Homebrew, no nvm, ...) must be harmless — the plugin simply skips it.
 * @param dir - candidate PATH entry.
 * @returns true when the entry is an existing directory.
 */
function isExistingDirectory(dir) {
	try {
		return statSync(dir).isDirectory();
	} catch {
		return false;
	}
}

/**
 * Prepend every missing directory to `env.PATH` in order, without
 * duplicating entries that are already present. Entries that do not exist
 * or are not directories are skipped, so a machine without Homebrew, nvm,
 * cargo, ... is never polluted with dangling PATH entries and the plugin
 * never fails. Idempotent: calling it repeatedly with the same environment
 * is a no-op.
 * @param env - the environment object to mutate (defaults to `process.env`).
 * @param config - raw plugin configuration.
 * @returns what was added and the resulting PATH value.
 */
export function applyPathFix(env = process.env, config = {}) {
	const current = (env.PATH ?? "").split(":").filter((entry) => entry.length > 0);
	const seen = new Set(current);
	const added = [];
	for (const dir of collectPathDirs(config)) {
		const normalized = dir.replace(/\/+$/u, "") || dir;
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		if (!isExistingDirectory(normalized)) continue;
		added.push(normalized);
	}
	if (added.length === 0) return { added, path: env.PATH ?? "" };
	const path = [...added, ...current].join(":");
	env.PATH = path;
	return { added, path };
}

/**
 * Load the desktop-mac-path plugin: restore the login-shell PATH for all
 * subsequent agent shell commands in this host process.
 * @param ctx - the Cordis context.
 * @param config - schema-validated plugin configuration (see {@link collectPathDirs}).
 */
export function apply(ctx, config = {}) {
	const { added } = applyPathFix(process.env, config);
	if (added.length > 0) {
		ctx.logger.info(`desktop-mac-path: prepended to PATH: ${added.join(", ")}`);
	} else {
		ctx.logger.debug("desktop-mac-path: PATH already complete, nothing to add");
	}
}
