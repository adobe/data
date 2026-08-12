// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Representative full states for the projection round-trip (toState ∘ fromState ≡
// identity). Varied ships / bullets / asteroids + non-default counters exercise the
// whole ecs↔State map, including a multiset case (identical same-size asteroids).
export const samples: readonly State[] = [
  {
    bounds: [800, 600],
    ship: { position: [400, 300], velocity: [12, -7], rotation: 1.25 },
    bullets: new Set([
      { position: [100, 100], velocity: [400, 0], age: 0.1 },
      { position: [220, 340], velocity: [-100, 200], age: 0.9 },
    ]),
    asteroids: new Set([
      { position: [50, 60], velocity: [10, 20], size: "large" },
      { position: [700, 80], velocity: [-30, 5], size: "medium" },
      { position: [640, 540], velocity: [0, -15], size: "small" },
    ]),
    score: 240,
    lives: 2,
    wave: 5,
  },
  {
    bounds: [320, 240],
    ship: { position: [160, 120], velocity: [0, 0], rotation: -Math.PI / 2 },
    bullets: new Set(),
    asteroids: new Set(),
    score: 0,
    lives: 3,
    wave: 0,
  },
  {
    bounds: [500, 500],
    ship: { position: [250, 250], velocity: [0, 0], rotation: 0 },
    bullets: new Set(),
    asteroids: new Set([
      { position: [250, 250], velocity: [0, 0], size: "medium" },
      { position: [250, 250], velocity: [0, 0], size: "medium" },
      { position: [250, 250], velocity: [0, 0], size: "medium" },
    ]),
    score: 90,
    lives: 1,
    wave: 3,
  },
];
