// © 2026 Adobe. MIT License. See /LICENSE for details.
import { packages } from "virtual:guide-packages";

/**
 * The guide's packages as the compiler reads them, each installed at `/node_modules/` and its name: its manifest, and
 * of the files it ships, those its `guide.files` name, which the build reads types, the examples' imports and the
 * kernels it inlines from.
 */
export const packageFiles: ReadonlyMap<string, string> = new Map(packages.flatMap(({ name, files }) =>
    files.map(([path, text]): [string, string] => [`/node_modules/${name}/${path}`, text])));
