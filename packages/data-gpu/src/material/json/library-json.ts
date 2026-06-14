import type { MaterialDefinition } from "../material-definition.js";

/** name → material property bundle, as authored in a JSON library file. */
export type LibraryJson = Readonly<Record<string, MaterialDefinition>>;
