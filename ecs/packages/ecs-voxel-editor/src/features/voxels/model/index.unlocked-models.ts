// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index } from "@adobe/ecs";
import { model } from "./component.model.js";
import { sizeUnlocked } from "./component.size-unlocked.js";

/** The models whose size is unlocked. */
export const unlockedModels = Index.create({ key: [], components: { with: [model, sizeUnlocked] } });
