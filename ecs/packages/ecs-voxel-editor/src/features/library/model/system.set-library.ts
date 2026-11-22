// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { library } from "./resource.library.js";
import type { Library } from "./type.library.js";

/** Records the library as the folder's access last found it. */
export const setLibrary: System<Library> = System.create({}, ({ resources }, input: Library) => {
    resources[library] = input;
});
