// © 2026 Adobe. MIT License. See /LICENSE for details.

/** The guide's packages, in its order, as `guide-packages.ts` reads them from the guide's dependencies. */
declare module "virtual:guide-packages" {
    /** One of a package's files beside its guide's index, by its name there. */
    type Named = { readonly name: string; readonly source: string };
    export const packages: readonly {
        readonly name: string;
        /** Its guide's index, `src/guide/README.md`. */
        readonly index: string;
        readonly prose: readonly Named[];
        readonly sources: readonly Named[];
        readonly outputs: readonly Named[];
        /** What the guide's compiler reads of it, by path in the package, its package.json first. */
        readonly files: readonly (readonly [string, string])[];
        /** Its declarations, which the guide's checker reads, by path in the package, its package.json first. */
        readonly declarations: readonly (readonly [string, string])[];
    }[];
}

/** Each of the guide's packages' exports, by its name, as a run's frame imports them. */
declare module "virtual:guide-runtime" {
    export const modules: { readonly [name: string]: { readonly [name: string]: unknown } };
}
