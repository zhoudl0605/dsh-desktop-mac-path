/**
 * dsh-mac-path
 *
 * Restore the macOS login-shell PATH (Homebrew, /etc/paths.d, ...) for agent
 * shell commands running inside a GUI-launched DSH host (DSH Desktop, `dsh
 * web` started from Finder/Dock, ...).
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
 * This plugin deliberately has zero runtime dependencies: the `@deepseek-ai/*`
 * packages are not published to the public npm registry, so a third-party
 * plugin must not import them at runtime. `apply(ctx, config)` receives the
 * raw configuration object and parses it defensively.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const name = "mac-path";

export const inject = [];

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
 * Prepend every missing directory to `env.PATH` in order, without
 * duplicating entries that are already present. Idempotent: calling it
 * repeatedly with the same environment is a no-op.
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
		added.push(normalized);
	}
	if (added.length === 0) return { added, path: env.PATH ?? "" };
	const path = [...added, ...current].join(":");
	env.PATH = path;
	return { added, path };
}

/**
 * Load the mac-path plugin: restore the login-shell PATH for all subsequent
 * agent shell commands in this host process.
 * @param ctx - the Cordis context.
 * @param config - raw plugin configuration (see {@link collectPathDirs}).
 */
export function apply(ctx, config = {}) {
	const { added } = applyPathFix(process.env, config);
	if (added.length > 0) {
		ctx.logger.info(`mac-path: prepended to PATH: ${added.join(", ")}`);
	} else {
		ctx.logger.debug("mac-path: PATH already complete, nothing to add");
	}
}
