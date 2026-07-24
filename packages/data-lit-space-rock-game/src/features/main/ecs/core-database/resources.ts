// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { Vec2, F32 } from "@adobe/data/math";
import { Input } from "../../data/input/input.js";

// The singleton simulation state. Each entry is a Schema carrying a `default`;
// where the data/ schema's own default fits it is bound by identity, otherwise
// the schema is spread and the default overridden. All `session` scope: this
// game state is client-local and ephemeral.
export const resources = Database.resources({
  session: {
    bounds: Vec2.schema, // play-field size [width, height]; schema default [0, 0]
    score: F32.schema, // schema default 0
    lives: { ...F32.schema, default: 3 },
    wave: F32.schema, // schema default 0
    input: { ...Input.schema, default: Input.none },
    frameDelta: { ...F32.schema, default: 1 / 60 }, // fixed timestep, seconds/tick
  },
});
