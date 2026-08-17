import assert from "node:assert/strict";
import { test } from "node:test";
import { Config, apply, applyPathFix, collectPathDirs, name, systemPathDirs } from "./index.js";

test("plugin exports a cordis-compatible surface", () => {
	assert.equal(name, "desktop-mac-path");
	assert.equal(typeof apply, "function");
	assert.equal(typeof applyPathFix, "function");
	assert.equal(typeof Config, "function");
});

test("Config schema applies defaults", () => {
	const parsed = Config({});
	assert.deepEqual(parsed.extraPaths, []);
	assert.equal(parsed.restoreSystemPaths, true);
	const custom = Config({ extraPaths: ["/opt/homebrew/bin"], restoreSystemPaths: false });
	assert.deepEqual(custom.extraPaths, ["/opt/homebrew/bin"]);
	assert.equal(custom.restoreSystemPaths, false);
});

test("applyPathFix prepends missing directories in order", () => {
	const env = { PATH: "/usr/bin:/bin" };
	const result = applyPathFix(env, {
		restoreSystemPaths: false,
		extraPaths: ["/opt/homebrew/bin", "/usr/local/bin"]
	});
	assert.deepEqual(result.added, ["/opt/homebrew/bin", "/usr/local/bin"]);
	assert.equal(env.PATH, "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin");
});

test("applyPathFix never duplicates existing entries", () => {
	const env = { PATH: "/opt/homebrew/bin:/usr/bin" };
	const result = applyPathFix(env, {
		restoreSystemPaths: false,
		extraPaths: ["/opt/homebrew/bin", "/usr/bin"]
	});
	assert.deepEqual(result.added, []);
	assert.equal(env.PATH, "/opt/homebrew/bin:/usr/bin");
});

test("applyPathFix is idempotent across calls", () => {
	const env = { PATH: "/usr/bin:/bin" };
	const config = { restoreSystemPaths: false, extraPaths: ["/opt/homebrew/bin"] };
	const first = applyPathFix(env, config);
	assert.deepEqual(first.added, ["/opt/homebrew/bin"]);
	const second = applyPathFix(env, config);
	assert.deepEqual(second.added, []);
	assert.equal(env.PATH, "/opt/homebrew/bin:/usr/bin:/bin");
});

test("applyPathFix tolerates trailing slashes and empty PATH", () => {
	const env = {};
	const result = applyPathFix(env, {
		restoreSystemPaths: false,
		extraPaths: ["/opt/homebrew/bin/"]
	});
	assert.equal(env.PATH, "/opt/homebrew/bin");
	assert.deepEqual(result.added, ["/opt/homebrew/bin"]);
});

test("collectPathDirs honours restoreSystemPaths: false", () => {
	const dirs = collectPathDirs({ restoreSystemPaths: false, extraPaths: ["/opt/homebrew/bin"] });
	assert.deepEqual(dirs, ["/opt/homebrew/bin"]);
});

test("systemPathDirs returns path_helper-compatible entries on darwin", () => {
	const dirs = systemPathDirs();
	assert.ok(Array.isArray(dirs));
	if (process.platform === "darwin") {
		assert.ok(dirs.includes("/usr/bin"), "expected /etc/paths to contain /usr/bin");
	}
});

test("apply restores PATH and reports through the logger", () => {
	const messages = [];
	const ctx = {
		logger: {
			info: (message) => messages.push(message),
			debug: (message) => messages.push(message)
		}
	};
	const previous = process.env.PATH;
	try {
		delete process.env.PATH;
		apply(ctx, { restoreSystemPaths: false, extraPaths: ["/opt/homebrew/bin"] });
		assert.equal(process.env.PATH, "/opt/homebrew/bin");
		assert.ok(messages.some((message) => message.includes("/opt/homebrew/bin")));
	} finally {
		if (previous === undefined) delete process.env.PATH;
		else process.env.PATH = previous;
	}
});

test("apply is a silent no-op when PATH is already complete", () => {
	const messages = [];
	const ctx = { logger: { info: (m) => messages.push(m), debug: (m) => messages.push(m) } };
	const previous = process.env.PATH;
	try {
		process.env.PATH = "/opt/homebrew/bin:/usr/bin:/bin";
		apply(ctx, { restoreSystemPaths: false, extraPaths: ["/opt/homebrew/bin"] });
		assert.equal(process.env.PATH, "/opt/homebrew/bin:/usr/bin:/bin");
		assert.ok(messages.some((message) => message.includes("nothing to add")));
	} finally {
		if (previous === undefined) delete process.env.PATH;
		else process.env.PATH = previous;
	}
});
