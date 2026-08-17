import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Config, apply, applyPathFix, collectPathDirs, name, systemPathDirs } from "./index.js";

// Portable fixture: real temp directories (tests must not depend on machine
// layout such as /opt/homebrew/bin existing or not).
const base = mkdtempSync(join(tmpdir(), "dshd-mac-path-test-"));
const binA = join(base, "bin-a");
const binB = join(base, "bin-b");
mkdirSync(binA);
mkdirSync(binB);
const missingDir = join(base, "missing");
const regularFile = join(base, "not-a-dir");
writeFileSync(regularFile, "x");
after(() => rmSync(base, { recursive: true, force: true }));

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
	const custom = Config({ extraPaths: [binA], restoreSystemPaths: false });
	assert.deepEqual(custom.extraPaths, [binA]);
	assert.equal(custom.restoreSystemPaths, false);
});

test("applyPathFix prepends missing directories in order", () => {
	const env = { PATH: "/usr/bin:/bin" };
	const result = applyPathFix(env, {
		restoreSystemPaths: false,
		extraPaths: [binA, binB]
	});
	assert.deepEqual(result.added, [binA, binB]);
	assert.equal(env.PATH, `${binA}:${binB}:/usr/bin:/bin`);
});

test("applyPathFix never duplicates existing entries", () => {
	const env = { PATH: `${binA}:/usr/bin` };
	const result = applyPathFix(env, {
		restoreSystemPaths: false,
		extraPaths: [binA, "/usr/bin"]
	});
	assert.deepEqual(result.added, []);
	assert.equal(env.PATH, `${binA}:/usr/bin`);
});

test("applyPathFix is idempotent across calls", () => {
	const env = { PATH: "/usr/bin:/bin" };
	const config = { restoreSystemPaths: false, extraPaths: [binA] };
	const first = applyPathFix(env, config);
	assert.deepEqual(first.added, [binA]);
	const second = applyPathFix(env, config);
	assert.deepEqual(second.added, []);
	assert.equal(env.PATH, `${binA}:/usr/bin:/bin`);
});

test("applyPathFix tolerates trailing slashes and empty PATH", () => {
	const env = {};
	const result = applyPathFix(env, {
		restoreSystemPaths: false,
		extraPaths: [`${binA}/`]
	});
	assert.equal(env.PATH, binA);
	assert.deepEqual(result.added, [binA]);
});

test("applyPathFix skips directories that do not exist", () => {
	const env = { PATH: "/usr/bin" };
	const result = applyPathFix(env, {
		restoreSystemPaths: false,
		extraPaths: [binA, missingDir, binB]
	});
	assert.deepEqual(result.added, [binA, binB]);
	assert.equal(env.PATH, `${binA}:${binB}:/usr/bin`);
	assert.ok(!env.PATH.includes(missingDir), "missing dir must not enter PATH");
});

test("applyPathFix skips entries that are files, not directories", () => {
	const env = { PATH: "/usr/bin" };
	const result = applyPathFix(env, {
		restoreSystemPaths: false,
		extraPaths: [regularFile, binA]
	});
	assert.deepEqual(result.added, [binA]);
	assert.ok(!env.PATH.includes(regularFile), "file path must not enter PATH");
});

test("applyPathFix never fails when every extra path is missing", () => {
	const env = { PATH: "/usr/bin" };
	const result = applyPathFix(env, {
		restoreSystemPaths: false,
		extraPaths: [missingDir, join(base, "also-missing")]
	});
	assert.deepEqual(result.added, []);
	assert.equal(env.PATH, "/usr/bin");
});

test("collectPathDirs honours restoreSystemPaths: false", () => {
	const dirs = collectPathDirs({ restoreSystemPaths: false, extraPaths: [binA] });
	assert.deepEqual(dirs, [binA]);
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
		apply(ctx, { restoreSystemPaths: false, extraPaths: [binA] });
		assert.equal(process.env.PATH, binA);
		assert.ok(messages.some((message) => message.includes(binA)));
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
		process.env.PATH = `${binA}:/usr/bin:/bin`;
		apply(ctx, { restoreSystemPaths: false, extraPaths: [binA] });
		assert.equal(process.env.PATH, `${binA}:/usr/bin:/bin`);
		assert.ok(messages.some((message) => message.includes("nothing to add")));
	} finally {
		if (previous === undefined) delete process.env.PATH;
		else process.env.PATH = previous;
	}
});
