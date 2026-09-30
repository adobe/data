// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database, scheduler } from "@adobe/data/ecs";
import type { Entity } from "@adobe/data/ecs";
import { Vec2 } from "@adobe/data/math";
import { ActionDatabase } from "../actions/action-database.js";
import { Motion } from "../../data/values/motion/motion.js";
import { Spatial } from "../../data/values/spatial/spatial.js";
import { Collision } from "../../data/values/collision/collision.js";
import { Asteroid } from "../../data/values/asteroid/asteroid.js";
import { Bullet } from "../../data/values/bullet/bullet.js";
import { Ship } from "../../data/values/ship/ship.js";
import { Lives } from "../../data/values/lives/lives.js";
import { Size } from "../../data/values/size/size.js";

// The real-time tick loop: the action database combined with the built-in
// `scheduler`. Each frame runs these systems in their `schedule` order —
// advance → fire → age → collide → refill:
//
//   control   → turn + thrust the ship (rotation + velocity)
//   movement  → advance + wrap the ship and every asteroid
//   lifetime  → fire on a `fire` edge (from the post-move muzzle), then advance +
//               age + retire every bullet, the new one included
//   collision → hitAsteroid per bullet hit, then loseLife if the ship is struck
//   waves     → refillWave once the field is clear (injected `random`)
//
// Continuous motion is in-place column (and resource) writes — no per-frame
// transaction; the discrete outcomes (fire, hit, lose a life, refill) dispatch
// transactions. Every system is frozen once the game is over. The scheduler drives
// them on requestAnimationFrame; a headless host (tests, server sim) instead invokes
// `db.system.functions[name]()` for each name of each tier in `db.system.order`
// (skipping `schedulerSystem`).
const systemDatabasePlugin = Database.Plugin.create({
  extends: Database.Plugin.combine(ActionDatabase.plugin, scheduler),
  systems: {
    control: {
      create: (db) => () => {
        const { resources } = db.store;
        if (Lives.isGameOver(resources.lives)) return;
        const { input, frameDelta: dt, ship } = resources;
        const rotation = Ship.turn(ship.rotation, input.turn, dt);
        const velocity = input.thrust ? Ship.thrust(ship.velocity, rotation, dt) : ship.velocity;
        resources.ship = { position: ship.position, velocity, rotation };
      },
    },

    // The hot per-row path for the non-bullet bodies. Bullets (the only rows with
    // `age`) advance in `lifetime`, after firing, so the fired bullet moves this frame.
    movement: {
      schedule: { after: ["control"] },
      create: (db) => () => {
        const { resources } = db.store;
        if (Lives.isGameOver(resources.lives)) return;
        const dt = resources.frameDelta;
        const bounds = resources.bounds;
        const ship = resources.ship;
        resources.ship = { ...ship, position: Motion.wrap(Motion.advance(ship.position, ship.velocity, dt), bounds) };
        for (const arch of db.store.queryArchetypes(["position", "velocity"], { exclude: ["age"] })) {
          const position = arch.columns.position;
          const velocity = arch.columns.velocity;
          for (let i = 0; i < arch.rowCount; i++) {
            position.set(i, Motion.wrap(Motion.advance(position.get(i), velocity.get(i), dt), bounds));
          }
        }
      },
    },

    // Fire on a `fire` edge (clearing it, so one keypress is one shot), then advance +
    // age + wrap every bullet, retiring the ones that expire this tick
    // (`Bullet.isExpired` reads the age before the increment). Deletes hole-fill from
    // the tail, so iterate tail→head: rows ahead of the cursor are already done.
    lifetime: {
      schedule: { after: ["movement"] },
      create: (db) => () => {
        const { resources } = db.store;
        if (Lives.isGameOver(resources.lives)) return;
        const dt = resources.frameDelta;
        const bounds = resources.bounds;
        if (resources.input.fire) {
          db.transactions.fireBullet();
          resources.input = { ...resources.input, fire: false };
        }
        for (const arch of db.store.queryArchetypes(["position", "velocity", "age"])) {
          const { id, position, velocity, age } = arch.columns;
          for (let i = arch.rowCount - 1; i >= 0; i--) {
            const current = age.get(i);
            if (Bullet.isExpired(current, dt)) {
              db.store.delete(id.get(i));
            } else {
              position.set(i, Motion.wrap(Motion.advance(position.get(i), velocity.get(i), dt), bounds));
              age.set(i, current + dt);
            }
          }
        }
      },
    },

    // Bullet↔asteroid first, then ship↔asteroid. A bullet's path this frame
    // (position - velocity·dt → position) can span many cells, so bullet detection
    // scans every asteroid with a segment test; the point-like ship uses the `byCell`
    // broad phase (its cell + the eight neighbours). All bullet hits are detected
    // against the untouched store before any is applied, so a child spawned this frame
    // is never a target; each asteroid is claimed by at most one bullet.
    collision: {
      schedule: { after: ["movement", "lifetime"] },
      create: (db) => {
        const findSweptHitAsteroid = (
          prev: Vec2,
          position: Vec2,
          exclude: ReadonlySet<Entity>,
        ): Entity | undefined => {
          for (const arch of db.store.queryArchetypes(db.store.archetypes.Asteroid.components)) {
            const { id, position: center, size } = arch.columns;
            for (let i = 0; i < arch.rowCount; i++) {
              const entity = id.get(i);
              if (exclude.has(entity)) continue;
              const reach = Bullet.radius + Size.radius[size.get(i)];
              if (Collision.segmentCircleOverlap(prev, position, center.get(i), reach)) return entity;
            }
          }
          return undefined;
        };
        const shipIsStruck = (center: Vec2): boolean => {
          for (const cell of Spatial.neighborKeys(center, Spatial.cellSize)) {
            for (const entity of db.indexes.byCell.find({ cell })) {
              const asteroid = db.store.read(entity, db.store.archetypes.Asteroid);
              if (asteroid === null) continue;
              if (Collision.circlesOverlap(center, Ship.radius, asteroid.position, Asteroid.radius(asteroid))) return true;
            }
          }
          return false;
        };
        return () => {
          const { resources } = db.store;
          if (Lives.isGameOver(resources.lives)) return;
          const dt = resources.frameDelta;
          const claimed = new Set<Entity>();
          const hits: { readonly bullet: Entity; readonly asteroid: Entity }[] = [];
          for (const arch of db.store.queryArchetypes(db.store.archetypes.Bullet.components)) {
            const { id, position, velocity } = arch.columns;
            for (let i = 0; i < arch.rowCount; i++) {
              const end = position.get(i);
              const asteroid = findSweptHitAsteroid(Vec2.subtract(end, Vec2.scale(velocity.get(i), dt)), end, claimed);
              if (asteroid !== undefined) {
                claimed.add(asteroid);
                hits.push({ bullet: id.get(i), asteroid });
              }
            }
          }
          for (const hit of hits) db.transactions.hitAsteroid(hit);
          if (shipIsStruck(resources.ship.position)) db.transactions.loseLife();
        };
      },
    },

    // Refill a cleared field (only asteroids carry `size`) with a randomized wave.
    waves: {
      schedule: { after: ["collision"] },
      create: (db) => {
        const random = db.services.random;
        return () => {
          if (Lives.isGameOver(db.store.resources.lives)) return;
          for (const arch of db.store.queryArchetypes(["size"])) {
            if (arch.rowCount > 0) return;
          }
          db.transactions.refillWave({ random });
        };
      },
    },
  },
});

export type SystemDatabase = Database.Plugin.ToDatabase<typeof systemDatabasePlugin>;

export namespace SystemDatabase {
  export const plugin = systemDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof systemDatabasePlugin>;
}
