// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import type { State } from "./state.js";
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
    const prev = Vec2.subtract(bullet.position, Vec2.scale(bullet.velocity, dt));
    const hit = asteroids.findIndex((a) =>
      Collision.segmentCircleOverlap(prev, bullet.position, a.position, Bullet.radius + Asteroid.radius(a)),
    );
    if (hit < 0) {
      survivors.push(bullet);
      continue;
    }
    const [asteroid] = asteroids.splice(hit, 1);
    score += Asteroid.score(asteroid);
    spawned.push(...Asteroid.split(asteroid));
  }
  return { ...state, bullets: survivors, asteroids: [...asteroids, ...spawned], score };
};
