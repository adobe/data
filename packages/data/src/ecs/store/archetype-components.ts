// © 2026 Adobe. MIT License. See /LICENSE for details.

import { StringKeyof } from "../../types/types.js";
import { OptionalComponents } from "../optional-components.js";

export type ArchetypeComponents<ComponentNames extends string> = { readonly [ACK: string]: readonly (ComponentNames | StringKeyof<OptionalComponents>)[] };
