// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { Bullet } from "../bullet/bullet.js";
import { Asteroid } from "../asteroid/asteroid.js";
import { Collision } from "../collision/collision.js";

// Resolve bullet↔asteroid collisions: each bullet destroys the first asteroid
// it overlaps, scoring it and replacing it with its split children. A consumed
// bullet and its target both vanish.
export const resolveBulletHits = <
  T extends Pick<State, "bullets" | "asteroids" | "score">,
>(
  state: T,
): T => {
  const asteroids: Asteroid[] = [...state.asteroids];
  const survivors: Bullet[] = [];
  let score = state.score;
  for (const bullet of state.bullets) {
    const hit = asteroids.findIndex((a) =>
      Collision.circlesOverlap(bullet.position, Bullet.radius, a.position, Asteroid.radius(a)),
    );
    if (hit < 0) {
      survivors.push(bullet);
      continue;
    }
    const [asteroid] = asteroids.splice(hit, 1);
    score += Asteroid.score(asteroid);
    asteroids.push(...Asteroid.split(asteroid));
  }
  return { ...state, bullets: survivors, asteroids, score };
};
