/**
 * dsh-plugin-desktop-path type declarations.
 * The plugin has zero runtime dependencies; types are hand-written.
 */

export declare const name: "desktop-path";
export declare const inject: never[];

export interface DesktopPathConfig {
	/** Replicate `path_helper` from `/etc/paths` + `/etc/paths.d/` (darwin only). Defaults to true. */
	restoreSystemPaths?: boolean;
	/** Extra directories to prepend, in order, after any system entries. */
	extraPaths?: string[];
}

export declare function systemPathDirs(): string[];

export declare function collectPathDirs(config?: DesktopPathConfig): string[];

export declare function applyPathFix(
	env?: Record<string, string | undefined>,
	config?: DesktopPathConfig
): { added: string[]; path: string };

export declare function apply(
	ctx: { logger: { info(message: string): void; debug(message: string): void } },
	config?: DesktopPathConfig
): void;
