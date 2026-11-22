// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index } from "@adobe/ecs";
import { Instance } from "./archetype.instance.js";
import { instanceOf } from "./component.instance-of.js";

/** The instances placing a model, wherever they are: `lookup(model)`. */
export const instancesOf = Index.create({ key: [instanceOf], components: { with: [...Instance] } });
