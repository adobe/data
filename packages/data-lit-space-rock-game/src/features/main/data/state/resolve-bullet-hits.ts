// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import type { State } from "./state.js";
import { Conformance } from "./conformance-case.js";
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
export const resolveBulletHits = (
  state: Pick<State, "entities" | "score">,
  dt: number,
): Pick<State, "entities" | "score"> => {
  const entities = new Map(state.entities);
  // The asteroids that existed at the start of the pass, with their ids — a
  // bullet may hit one of these, never a split child created this same frame.
  const asteroids: [number, Asteroid][] = [];
  const bullets: [number, Bullet][] = [];
  for (const [id, value] of state.entities) {
    if (Bullet.is(value)) bullets.push([id, value]);
    else asteroids.push([id, value]);
  }
  // Children spawned this pass are collected separately and inserted only after
  // every bullet has resolved, each under a freshly minted id.
  const spawned: Asteroid[] = [];
  // Running max (not `Math.max(...keys)`, which would blow the argument stack for
  // a large entity set) to mint ids above every existing one.
  let maxId = 0;
  for (const id of state.entities.keys()) if (id > maxId) maxId = id;
  let nextId = maxId + 1;
  let score = state.score;
  for (const [bulletId, bullet] of bullets) {
    const prev = Vec2.subtract(
      bullet.position,
      Vec2.scale(bullet.velocity, dt),
    );
    const hit = asteroids.findIndex(([, a]) =>
      Collision.segmentCircleOverlap(
        prev,
        bullet.position,
        a.position,
        Bullet.radius + Asteroid.radius(a),
      ),
    );
    if (hit < 0) {
      continue;
    }
    const [[asteroidId, asteroid]] = asteroids.splice(hit, 1);
    entities.delete(bulletId);
    entities.delete(asteroidId);
    score += Asteroid.score(asteroid);
    spawned.push(...Asteroid.split(asteroid));
  }
  for (const child of spawned) {
    entities.set(nextId++, child);
  }
  return { entities, score };
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

export const cases = /*@__PURE__*/ Conformance.cases(resolveBulletHits,
  {
    name: "destroys bullet + asteroid, scores, and spawns split children (large → 2 medium)",
    before: {
      ...field,
      entities: new Map([
        [1, { position: [50, 50], velocity: [0, 0], age: 0 }],
        [2, { position: [50, 50], velocity: [0, 0], size: "large" }],
      ]),
      score: 0,
    },
    args: 1 / 60,
    after: {
      ...field,
      entities: new Map([
        [1, { position: [50, 50], velocity: [0, 0], size: "medium" }],
        [2, { position: [50, 50], velocity: [0, 0], size: "medium" }],
      ]),
      score: 20,
    },
  },
  {
    name: "medium splits into two small",
    before: {
      ...field,
      entities: new Map([
        [1, { position: [50, 50], velocity: [0, 0], age: 0 }],
        [2, { position: [50, 50], velocity: [0, 0], size: "medium" }],
      ]),
      score: 5,
    },
    args: 1 / 60,
    after: {
      ...field,
      entities: new Map([
        [1, { position: [50, 50], velocity: [0, 0], size: "small" }],
        [2, { position: [50, 50], velocity: [0, 0], size: "small" }],
      ]),
      score: 55,
    },
  },
  {
    name: "the smallest tier is destroyed outright — no children",
    before: {
      ...field,
      entities: new Map([
        [1, { position: [50, 50], velocity: [0, 0], age: 0 }],
        [2, { position: [50, 50], velocity: [0, 0], size: "small" }],
      ]),
      score: 0,
    },
    args: 1 / 60,
    after: { ...field, entities: new Map(), score: 100 },
  },
  {
    name: "a bullet that hits nothing is left untouched",
    before: {
      ...field,
      entities: new Map([
        [1, { position: [10, 10], velocity: [0, 0], age: 0 }],
        [2, { position: [500, 500], velocity: [0, 0], size: "large" }],
      ]),
      score: 7,
    },
    args: 1 / 60,
    after: {
      ...field,
      entities: new Map([
        [1, { position: [10, 10], velocity: [0, 0], age: 0 }],
        [2, { position: [500, 500], velocity: [0, 0], size: "large" }],
      ]),
      score: 7,
    },
  },
  {
    name: "only the overlapping asteroid is hit; distant ones remain",
    before: {
      ...field,
      entities: new Map([
        [1, { position: [50, 50], velocity: [0, 0], age: 0 }],
        [2, { position: [50, 50], velocity: [0, 0], size: "large" }],
        [3, { position: [500, 500], velocity: [0, 0], size: "small" }],
      ]),
      score: 0,
    },
    args: 1 / 60,
    after: {
      ...field,
      entities: new Map([
        [1, { position: [50, 50], velocity: [0, 0], size: "medium" }],
        [2, { position: [50, 50], velocity: [0, 0], size: "medium" }],
        [3, { position: [500, 500], velocity: [0, 0], size: "small" }],
      ]),
      score: 20,
    },
  },
  {
    name: "two bullets each destroy their own asteroid",
    before: {
      ...field,
      entities: new Map([
        [1, { position: [50, 50], velocity: [0, 0], age: 0 }],
        [2, { position: [500, 500], velocity: [0, 0], age: 0 }],
        [3, { position: [50, 50], velocity: [0, 0], size: "small" }],
        [4, { position: [500, 500], velocity: [0, 0], size: "small" }],
      ]),
      score: 0,
    },
    args: 1 / 60,
    after: { ...field, entities: new Map(), score: 200 },
  },
  {
    name: "split children are not hittable by another bullet in the same pass",
    before: {
      ...field,
      entities: new Map([
        [1, { position: [50, 50], velocity: [0, 0], age: 0 }],
        [2, { position: [50, 50], velocity: [0, 0], age: 0 }],
        [3, { position: [50, 50], velocity: [0, 0], size: "large" }],
      ]),
      score: 0,
    },
    args: 1 / 60,
    after: {
      ...field,
      // One bullet destroys the large (→ 2 medium). The second finds no original
      // target — the large is gone and its children, spawned this same pass, are
      // not yet hittable — so it survives.
      entities: new Map([
        [1, { position: [50, 50], velocity: [0, 0], age: 0 }],
        [2, { position: [50, 50], velocity: [0, 0], size: "medium" }],
        [3, { position: [50, 50], velocity: [0, 0], size: "medium" }],
      ]),
      score: 20,
    },
  },
  {
    name: "boundary: distance exactly equal to the radius sum still overlaps",
    before: {
      ...field,
      entities: new Map([
        [1, { position: [0, 0], velocity: [0, 0], age: 0 }],
        [2, { position: [42, 0], velocity: [0, 0], size: "large" }],
      ]),
      score: 0,
    },
    args: 1 / 60,
    after: {
      ...field,
      entities: new Map([
        [1, { position: [42, 0], velocity: [0, 0], size: "medium" }],
        [2, { position: [42, 0], velocity: [0, 0], size: "medium" }],
      ]),
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
      entities: new Map([
        [1, { position: [0, 0], velocity: [-3000, 0], age: 0 }],
        [2, { position: [25, 0], velocity: [0, 0], size: "medium" }],
      ]),
      score: 0,
    },
    args: 1 / 60,
    after: {
      ...field,
      entities: new Map([
        [1, { position: [25, 0], velocity: [0, 0], size: "small" }],
        [2, { position: [25, 0], velocity: [0, 0], size: "small" }],
      ]),
      score: 50,
    },
  },
);
