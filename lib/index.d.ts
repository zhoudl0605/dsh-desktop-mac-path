/**
 * dsh-desktop-mac-path type declarations.
 * Runtime dependency: `@deepseek-ai/schemastery` (for the Config schema).
 */

import type z from "@deepseek-ai/schemastery";

export declare const name: "desktop-mac-path";
export declare const inject: never[];

export declare const Config: z.ObjectType<{
	extraPaths: z.ArrayType<z.StringType>;
	restoreSystemPaths: z.BooleanType;
	addDesktopDsh: z.BooleanType;
}>;

export interface MacPathConfig {
	/** Prepend the active profile's Desktop CLI shim dir (`dsh`/`pnpm`/`node`) when it exists. Defaults to true. */
	addDesktopDsh?: boolean;
	/** Replicate `path_helper` from `/etc/paths` + `/etc/paths.d/` (darwin only). Defaults to true. */
	restoreSystemPaths?: boolean;
	/** Extra directories to prepend, in order, after any system entries. */
	extraPaths?: string[];
}

export declare function systemPathDirs(): string[];

export declare function desktopDshBinDirs(baseDir?: string): string[];

export declare function collectPathDirs(config?: MacPathConfig): string[];

export declare function applyPathFix(
	env?: Record<string, string | undefined>,
	config?: MacPathConfig
): { added: string[]; path: string };

export declare function apply(
	ctx: { logger: { info(message: string): void; debug(message: string): void } },
	config?: MacPathConfig
): void;
