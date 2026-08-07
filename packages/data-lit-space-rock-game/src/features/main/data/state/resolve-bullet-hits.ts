// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
import { create } from "./create.js";
import { Bullet } from "../bullet/bullet.js";
import { Asteroid } from "../asteroid/asteroid.js";
import { Collision } from "../collision/collision.js";

// Resolve bullet↔asteroid collisions: each bullet destroys the first asteroid
// its path this frame passes through, scoring it and replacing it with its
// split children. A consumed bullet and its target both vanish.
//
// Detection is SWEPT, not point-sampled: a fast bullet moves many pixels per
// frame and would tunnel clean through a small asteroid if only its end
// position were tested. Reconstruct the segment it travelled this frame —
// prev = position - velocity*dt — and test that whole segment against each
// asteroid. Asteroids are treated as stationary at their current position: they
// drift ~1px/frame, negligible against the bullet's sweep.
export const resolveBulletHits = <
  T extends Pick<State, "bullets" | "asteroids" | "score">,
>(
  state: T,
  dt: number,
): T => {
  const asteroids: Asteroid[] = [...state.asteroids];
  // Children spawned this pass are collected separately and appended only after
  // every bullet has resolved — a bullet may hit an asteroid that existed at the
  // start of the pass, never one that a split just created this same frame.
  const spawned: Asteroid[] = [];
  const survivors: Bullet[] = [];
  let score = state.score;
  for (const bullet of state.bullets) {
    const prev = Vec2.subtract(
      bullet.position,
      Vec2.scale(bullet.velocity, dt),
    );
    const hit = asteroids.findIndex((a) =>
      Collision.segmentCircleOverlap(
        prev,
        bullet.position,
        a.position,
        Bullet.radius + Asteroid.radius(a),
      ),
    );
    if (hit < 0) {
      survivors.push(bullet);
      continue;
    }
    const [asteroid] = asteroids.splice(hit, 1);
    score += Asteroid.score(asteroid);
    spawned.push(...Asteroid.split(asteroid));
  }
  return {
    ...state,
    bullets: survivors,
    asteroids: [...asteroids, ...spawned],
    score,
  };
};

// Spec-owned cases, shared with the ecs `hitAsteroid` transaction (dispatched
// once per overlapping bullet by the collision system). Detection is SWEPT: each
// bullet's path this frame is the segment [position - velocity*dt, position], and
// it destroys the first asteroid that segment passes through, scores it (large 20
// / medium 50 / small 100), and replaces it with its split children (large→2
// medium, medium→2 small, small→none). Stationary parents give children velocity
// [0,0]. Bullet.radius 2, asteroid radii 40/20/10. Every case keeps each bullet
// overlapping at most one asteroid, so the outcome is order-independent (the ecs
// broad phase need not match the spec's order — collections compare as multisets).
const field = { ...create(), bounds: [800, 600] as [number, number] };

export const cases: Conformance<typeof resolveBulletHits> = [
  {
    name: "destroys bullet + asteroid, scores, and spawns split children (large → 2 medium)",
    before: {
      ...field,
      bullets: [{ position: [50, 50], velocity: [0, 0], age: 0 }],
      asteroids: [{ position: [50, 50], velocity: [0, 0], size: "large" }],
      score: 0,
    },
    args: 1 / 60,
    after: {
      ...field,
      bullets: [],
      asteroids: [
        { position: [50, 50], velocity: [0, 0], size: "medium" },
        { position: [50, 50], velocity: [0, 0], size: "medium" },
      ],
      score: 20,
    },
  },
  {
    name: "medium splits into two small",
    before: {
      ...field,
      bullets: [{ position: [50, 50], velocity: [0, 0], age: 0 }],
      asteroids: [{ position: [50, 50], velocity: [0, 0], size: "medium" }],
      score: 5,
    },
    args: 1 / 60,
    after: {
      ...field,
      bullets: [],
      asteroids: [
        { position: [50, 50], velocity: [0, 0], size: "small" },
        { position: [50, 50], velocity: [0, 0], size: "small" },
      ],
      score: 55,
    },
  },
  {
    name: "the smallest tier is destroyed outright — no children",
    before: {
      ...field,
      bullets: [{ position: [50, 50], velocity: [0, 0], age: 0 }],
      asteroids: [{ position: [50, 50], velocity: [0, 0], size: "small" }],
      score: 0,
    },
    args: 1 / 60,
    after: { ...field, bullets: [], asteroids: [], score: 100 },
  },
  {
    name: "a bullet that hits nothing is left untouched",
    before: {
      ...field,
      bullets: [{ position: [10, 10], velocity: [0, 0], age: 0 }],
      asteroids: [{ position: [500, 500], velocity: [0, 0], size: "large" }],
      score: 7,
    },
    args: 1 / 60,
    after: {
      ...field,
      bullets: [{ position: [10, 10], velocity: [0, 0], age: 0 }],
      asteroids: [{ position: [500, 500], velocity: [0, 0], size: "large" }],
      score: 7,
    },
  },
  {
    name: "only the overlapping asteroid is hit; distant ones remain",
    before: {
      ...field,
      bullets: [{ position: [50, 50], velocity: [0, 0], age: 0 }],
      asteroids: [
        { position: [50, 50], velocity: [0, 0], size: "large" },
        { position: [500, 500], velocity: [0, 0], size: "small" },
      ],
      score: 0,
    },
    args: 1 / 60,
    after: {
      ...field,
      bullets: [],
      asteroids: [
        { position: [50, 50], velocity: [0, 0], size: "medium" },
        { position: [50, 50], velocity: [0, 0], size: "medium" },
        { position: [500, 500], velocity: [0, 0], size: "small" },
      ],
      score: 20,
    },
  },
  {
    name: "two bullets each destroy their own asteroid",
    before: {
      ...field,
      bullets: [
        { position: [50, 50], velocity: [0, 0], age: 0 },
        { position: [500, 500], velocity: [0, 0], age: 0 },
      ],
      asteroids: [
        { position: [50, 50], velocity: [0, 0], size: "small" },
        { position: [500, 500], velocity: [0, 0], size: "small" },
      ],
      score: 0,
    },
    args: 1 / 60,
    after: { ...field, bullets: [], asteroids: [], score: 200 },
  },
  {
    name: "split children are not hittable by another bullet in the same pass",
    before: {
      ...field,
      bullets: [
        { position: [50, 50], velocity: [0, 0], age: 0 },
        { position: [50, 50], velocity: [0, 0], age: 0 },
      ],
      asteroids: [{ position: [50, 50], velocity: [0, 0], size: "large" }],
      score: 0,
    },
    args: 1 / 60,
    after: {
      ...field,
      // One bullet destroys the large (→ 2 medium). The second finds no original
      // target — the large is gone and its children, spawned this same pass, are
      // not yet hittable — so it survives.
      bullets: [{ position: [50, 50], velocity: [0, 0], age: 0 }],
      asteroids: [
        { position: [50, 50], velocity: [0, 0], size: "medium" },
        { position: [50, 50], velocity: [0, 0], size: "medium" },
      ],
      score: 20,
    },
  },
  {
    name: "boundary: distance exactly equal to the radius sum still overlaps",
    before: {
      ...field,
      bullets: [{ position: [0, 0], velocity: [0, 0], age: 0 }],
      asteroids: [{ position: [42, 0], velocity: [0, 0], size: "large" }],
      score: 0,
    },
    args: 1 / 60,
    after: {
      ...field,
      bullets: [],
      asteroids: [
        { position: [42, 0], velocity: [0, 0], size: "medium" },
        { position: [42, 0], velocity: [0, 0], size: "medium" },
      ],
      score: 20,
    },
  },
  {
    name: "a fast bullet whose path sweeps through a medium destroys it (no tunnelling)",
    before: {
      ...field,
      // Over dt=1/60 the bullet travels 50px: prev = [0,0] - [-3000,0]/60 = [50,0].
      // Both endpoints are 25px from the medium at [25,0] — outside the 22px radius
      // sum, so a point test misses. The travelled segment crosses [25,0], so a
      // swept test hits.
      bullets: [{ position: [0, 0], velocity: [-3000, 0], age: 0 }],
      asteroids: [{ position: [25, 0], velocity: [0, 0], size: "medium" }],
      score: 0,
    },
    args: 1 / 60,
    after: {
      ...field,
      bullets: [],
      asteroids: [
        { position: [25, 0], velocity: [0, 0], size: "small" },
        { position: [25, 0], velocity: [0, 0], size: "small" },
      ],
      score: 50,
    },
  },
];
