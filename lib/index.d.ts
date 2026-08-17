/**
 * dsh-mac-path type declarations.
 * The plugin has zero runtime dependencies; types are hand-written.
 */

export declare const name: "mac-path";
export declare const inject: never[];

export interface MacPathConfig {
	/** Replicate `path_helper` from `/etc/paths` + `/etc/paths.d/` (darwin only). Defaults to true. */
	restoreSystemPaths?: boolean;
	/** Extra directories to prepend, in order, after any system entries. */
	extraPaths?: string[];
}

export declare function systemPathDirs(): string[];

export declare function collectPathDirs(config?: MacPathConfig): string[];

export declare function applyPathFix(
	env?: Record<string, string | undefined>,
	config?: MacPathConfig
): { added: string[]; path: string };

export declare function apply(
	ctx: { logger: { info(message: string): void; debug(message: string): void } },
	config?: MacPathConfig
): void;
