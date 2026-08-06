// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { Boolean } from "@adobe/data/schema";
import { Vec2, F32 } from "@adobe/data/math";
import { SpriteKind } from "../../../data/sprite-kind/sprite-kind.js";

export const components = Database.components({
  document: {
    position: Vec2.schema,
    rotation: F32.schema,
    kind: SpriteKind.schema,
    hovered: Boolean.schema,
    active: Boolean.schema,
  },
});
