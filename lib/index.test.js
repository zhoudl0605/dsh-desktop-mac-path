import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { after, test } from "node:test";
import { Config, apply, applyPathFix, collectPathDirs, desktopDshBinDirs, name, systemPathDirs } from "./index.js";

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
	assert.equal(parsed.addDesktopDsh, true);
	const custom = Config({ extraPaths: [binA], addDesktopDsh: false, restoreSystemPaths: false, addDesktopDsh: false });
	assert.deepEqual(custom.extraPaths, [binA]);
	assert.equal(custom.restoreSystemPaths, false);
	assert.equal(custom.addDesktopDsh, false);
});

test("desktopDshBinDirs finds the active profile's shim dir", () => {
	// Fixture: a fake Desktop user-data dir with profile-selection state and
	// the per-profile cli/<sha256('desktop')>/bin layout the Desktop uses.
	const fakeUserData = join(base, "fake-desktop-userdata");
	const profile = "desktop";
	const shimDir = join(fakeUserData, "cli", createHash("sha256").update(profile, "utf8").digest("hex"), "bin");
	mkdirSync(shimDir, { recursive: true });
	writeFileSync(join(shimDir, "dsh"), "#!/bin/sh\n");
	mkdirSync(join(fakeUserData, "profile-selection"), { recursive: true });
	writeFileSync(join(fakeUserData, "profile-selection", "state.json"), JSON.stringify({ active: profile }));
	const dirs = desktopDshBinDirs(fakeUserData);
	assert.deepEqual(dirs, [shimDir]);
});

test("desktopDshBinDirs falls back to scanning when state is missing", () => {
	const fakeUserData = join(base, "fake-desktop-userdata-scan");
	const shimDir = join(fakeUserData, "cli", "somehash", "bin");
	mkdirSync(shimDir, { recursive: true });
	writeFileSync(join(shimDir, "dsh"), "#!/bin/sh\n");
	const dirs = desktopDshBinDirs(fakeUserData);
	assert.deepEqual(dirs, [shimDir]);
});

test("desktopDshBinDirs returns [] when no shims exist", () => {
	const fakeUserData = join(base, "fake-desktop-userdata-empty");
	assert.deepEqual(desktopDshBinDirs(fakeUserData), []);
});

test("collectPathDirs honours addDesktopDsh: false", () => {
	const dirs = collectPathDirs({ addDesktopDsh: false, addDesktopDsh: false, restoreSystemPaths: false, extraPaths: [binA] });
	assert.deepEqual(dirs, [binA]);
});


test("applyPathFix prepends missing directories in order", () => {
	const env = { PATH: "/usr/bin:/bin" };
	const result = applyPathFix(env, {
		addDesktopDsh: false, restoreSystemPaths: false,
		extraPaths: [binA, binB]
	});
	assert.deepEqual(result.added, [binA, binB]);
	assert.equal(env.PATH, `${binA}:${binB}:/usr/bin:/bin`);
});

test("applyPathFix never duplicates existing entries", () => {
	const env = { PATH: `${binA}:/usr/bin` };
	const result = applyPathFix(env, {
		addDesktopDsh: false, restoreSystemPaths: false,
		extraPaths: [binA, "/usr/bin"]
	});
	assert.deepEqual(result.added, []);
	assert.equal(env.PATH, `${binA}:/usr/bin`);
});

test("applyPathFix is idempotent across calls", () => {
	const env = { PATH: "/usr/bin:/bin" };
	const config = { addDesktopDsh: false, restoreSystemPaths: false, extraPaths: [binA] };
	const first = applyPathFix(env, config);
	assert.deepEqual(first.added, [binA]);
	const second = applyPathFix(env, config);
	assert.deepEqual(second.added, []);
	assert.equal(env.PATH, `${binA}:/usr/bin:/bin`);
});

test("applyPathFix tolerates trailing slashes and empty PATH", () => {
	const env = {};
	const result = applyPathFix(env, {
		addDesktopDsh: false, restoreSystemPaths: false,
		extraPaths: [`${binA}/`]
	});
	assert.equal(env.PATH, binA);
	assert.deepEqual(result.added, [binA]);
});

test("applyPathFix skips directories that do not exist", () => {
	const env = { PATH: "/usr/bin" };
	const result = applyPathFix(env, {
		addDesktopDsh: false, restoreSystemPaths: false,
		extraPaths: [binA, missingDir, binB]
	});
	assert.deepEqual(result.added, [binA, binB]);
	assert.equal(env.PATH, `${binA}:${binB}:/usr/bin`);
	assert.ok(!env.PATH.includes(missingDir), "missing dir must not enter PATH");
});

test("applyPathFix skips entries that are files, not directories", () => {
	const env = { PATH: "/usr/bin" };
	const result = applyPathFix(env, {
		addDesktopDsh: false, restoreSystemPaths: false,
		extraPaths: [regularFile, binA]
	});
	assert.deepEqual(result.added, [binA]);
	assert.ok(!env.PATH.includes(regularFile), "file path must not enter PATH");
});

test("applyPathFix never fails when every extra path is missing", () => {
	const env = { PATH: "/usr/bin" };
	const result = applyPathFix(env, {
		addDesktopDsh: false, restoreSystemPaths: false,
		extraPaths: [missingDir, join(base, "also-missing")]
	});
	assert.deepEqual(result.added, []);
	assert.equal(env.PATH, "/usr/bin");
});

test("collectPathDirs honours restoreSystemPaths: false", () => {
	const dirs = collectPathDirs({ addDesktopDsh: false, restoreSystemPaths: false, extraPaths: [binA] });
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
		apply(ctx, { addDesktopDsh: false, restoreSystemPaths: false, extraPaths: [binA] });
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
		apply(ctx, { addDesktopDsh: false, restoreSystemPaths: false, extraPaths: [binA] });
		assert.equal(process.env.PATH, `${binA}:/usr/bin:/bin`);
		assert.ok(messages.some((message) => message.includes("nothing to add")));
	} finally {
		if (previous === undefined) delete process.env.PATH;
		else process.env.PATH = previous;
	}
});
