// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { control } from "./control.js";
import { Input } from "../data/values/input/input.js";

// Cases for the `control` system. turnRate 3, thrustAccel 200, so every `after` is
// exact. Control never moves the ship; `movement` does.
export const cases: Conformance.SpecCases<State, typeof control> = {
  cases: [
    {
      name: "turns right by a positive turn input",
      before: { ship: { position: [50, 50], velocity: [0, 0], rotation: 0 } },
      args: { dt: 1, input: { turn: 1, thrust: false, fire: false } },
      after: { ship: { position: [50, 50], velocity: [0, 0], rotation: 3 } },
    },
    {
      name: "turns left by a negative turn input",
      before: { ship: { position: [50, 50], velocity: [0, 0], rotation: 0 } },
      args: { dt: 1, input: { turn: -1, thrust: false, fire: false } },
      after: { ship: { position: [50, 50], velocity: [0, 0], rotation: -3 } },
    },
    {
      name: "idle input holds rotation and velocity",
      before: { ship: { position: [50, 50], velocity: [10, 0], rotation: 0.7 } },
      args: { dt: 1, input: Input.none },
      after: { ship: { position: [50, 50], velocity: [10, 0], rotation: 0.7 } },
    },
    {
      name: "thrusts along the facing without moving the ship",
      before: { ship: { position: [50, 50], velocity: [0, 0], rotation: 0 } },
      args: { dt: 0.1, input: { turn: 0, thrust: true, fire: false } },
      after: { ship: { position: [50, 50], velocity: [20, 0], rotation: 0 } },
    },
    {
      // −3 turns to 0, so thrust points +x; the old rotation would point elsewhere.
      name: "turn composes before thrust — thrust uses the post-turn rotation",
      before: { ship: { position: [50, 50], velocity: [0, 0], rotation: -3 } },
      args: { dt: 1, input: { turn: 1, thrust: true, fire: false } },
      after: { ship: { position: [50, 50], velocity: [200, 0], rotation: 0 } },
    },
    {
      name: "does nothing once the game is over",
      before: { ship: { position: [50, 50], velocity: [0, 0], rotation: 0 }, lives: 0 },
      args: { dt: 1, input: { turn: 1, thrust: true, fire: false } },
      after: {},
    },
  ],
};
