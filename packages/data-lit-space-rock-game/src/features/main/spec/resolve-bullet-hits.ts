// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import type { State } from "./state.js";
import { Bullet } from "../data/values/bullet/bullet.js";
import { Asteroid } from "../data/values/asteroid/asteroid.js";
import { Collision } from "../data/values/collision/collision.js";

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
  { dt }: { readonly dt: number },
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
