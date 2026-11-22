// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index } from "@adobe/ecs";
import { Instance } from "./archetype.instance.js";
import { parent } from "./component.parent.js";

/** The instances placed within a model, `lookup(model)`, or within every model, `lookup()`. */
export const instancesIn = Index.create({ key: [parent], sorted: true, components: { with: [...Instance] } });
