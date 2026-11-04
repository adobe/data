// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * How an application's source is organized, each part defaulting to the standard's (`defaults`). Written in the
 * application's package.json as `"ecsArchitecture"`, or passed to `check` and `diagrams`.
 */
export type Config = {
    /** The folder holding the source, relative to the package: `"src"`. */
    readonly source?: string;
    /** Each layer, by its folder name, and the layers its code may import. */
    readonly layers?: { readonly [layer: string]: readonly string[] };
    /** The kinds a public declaration's file is named by: `system` in `system.clear-completed.ts`. */
    readonly kinds?: readonly string[];
    /** Folders of the source root that hold apps, samples or benchmarks rather than features. */
    readonly apps?: readonly string[];
    /** The layers that run headless: no DOM, network, timers or global object. */
    readonly headless?: readonly string[];
    /** The layers that export `systems` from `constant.systems.ts`. */
    readonly systems?: readonly string[];
    /** Modules a layer may not import, matched by prefix, each with the rule it breaks and how to fix it. */
    readonly banned?: { readonly [layer: string]: readonly { readonly module: string; readonly rule: string; readonly fix: string }[] };
    /** The folder, relative to the package, that `ecs-architecture agents` writes in: the repository's root by default. */
    readonly agents?: string;
};
