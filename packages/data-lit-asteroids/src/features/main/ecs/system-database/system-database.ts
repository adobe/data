// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database, scheduler } from "@adobe/data/ecs";
import type { Entity } from "@adobe/data/ecs";
import { Vec2 } from "@adobe/data/math";
import { ComputedDatabase } from "../computed-database/computed-database.js";
import { Motion } from "../../data/motion/motion.js";
import { Spatial } from "../../data/spatial/spatial.js";
import { Collision } from "../../data/collision/collision.js";
import { Asteroid } from "../../data/asteroid/asteroid.js";
import { Bullet } from "../../data/bullet/bullet.js";
import { Ship } from "../../data/ship/ship.js";
import { State } from "../../data/state/state.js";

// The real-time tick loop. Extends the computed database (schema + indexes +
// transactions + computed) combined with the built-in `scheduler`, and declares
// the `systems` facet INLINE so each `create`'s `db` is strongly typed (the
// assembled database with a *writable* store) and the scheduler can infer the
// system-name union from the map's keys.
//
// The five systems mirror the internal sequence of the `data/` `State.step`
// oracle — advance → fire → age → collide → refill — so the tick cannot diverge
// from the spec even though the work is split across ordered systems:
//
//   control  → the turn/thrust half of State.stepShip (rotation + velocity)
//   movement → the advance+wrap half of stepShip and stepAsteroids (ship + rocks)
//   lifetime → State.fireBullet THEN State.stepBullets (fire from the *post-move*
//              muzzle, then advance + age + retire every bullet, new one included)
//   collision→ resolveBulletHits then resolveShipHits (discrete transactions)
//   waves    → State.spawnWave once the field is clear
//
// Firing lives in `lifetime` (after `movement`) precisely so the bullet leaves
// the ship's post-move muzzle and is advanced+aged in the same frame — matching
// step's stepShip→fireBullet→stepBullets order. The scheduler drives the systems
// on requestAnimationFrame; its `schedulerState` resource ("running" | "paused" |
// "disposed") gates start/pause/resume. A headless host (tests, server sim) omits
// rAF and drives frames itself by invoking `db.system.functions[name]()` for each
// name in `db.system.order`.
const systemDatabasePlugin = Database.Plugin.create({
  extends: Database.Plugin.combine(ComputedDatabase.plugin, scheduler),
  systems: {
    // Apply the player's intent to the ship: turn, then thrust along the new
    // facing — the rotation/velocity half of State.stepShip (movement advances
    // the ship's position afterwards). Frozen once the game is over.
    control: {
      create: (db) => () => {
        const { resources } = db.store;
        if (State.isGameOver({ lives: resources.lives })) return;
        const input = resources.input;
        const dt = resources.frameDelta;
        for (const arch of db.store.queryArchetypes(["position", "velocity", "rotation"])) {
          const rotation = arch.columns.rotation;
          const velocity = arch.columns.velocity;
          for (let i = 0; i < arch.rowCount; i++) {
            const turned = Ship.turn(rotation.get(i), input.turn, dt);
            rotation.set(i, turned);
            if (input.thrust) {
              velocity.set(i, Ship.thrust(velocity.get(i), turned, dt));
            }
          }
        }
      },
    },

    // The hot per-row path for the non-bullet bodies (ship + asteroids): advance
    // by velocity and wrap at the screen edges — the Motion half of
    // State.stepShip / stepAsteroids. Bullets are excluded (only they carry
    // `age`); they advance in `lifetime`, paired with firing, so the step's
    // fireBullet→stepBullets adjacency is preserved. The broad-phase cell is
    // derived from `position` by the `byCell` computed-key index, so a moved
    // body needs no cell bookkeeping here. Every body stays in its own
    // archetype, so these are in-place column writes with no migration and no
    // transaction overhead. Frozen once the game is over.
    movement: {
      schedule: { after: ["control"] },
      create: (db) => () => {
        const { resources } = db.store;
        if (State.isGameOver({ lives: resources.lives })) return;
        const dt = resources.frameDelta;
        const bounds = resources.bounds;
        for (const arch of db.store.queryArchetypes(
          ["position", "velocity"],
          { exclude: ["age"] },
        )) {
          const position = arch.columns.position;
          const velocity = arch.columns.velocity;
          for (let i = 0; i < arch.rowCount; i++) {
            position.set(i, Motion.wrap(Motion.advance(position.get(i), velocity.get(i), dt), bounds));
          }
        }
      },
    },

    // Bullet lifecycle, running after movement so the ship is already at its
    // post-move position — the ecs wiring for State.fireBullet followed by
    // State.stepBullets. First, on a `fire` edge, dispatch fireBullet (reusing
    // the data/-verified muzzle kinematics off the *post-move* ship and notifying
    // the HUD) and clear the edge so one keypress is one shot. Then advance + age
    // + wrap every bullet — the freshly-fired one included, exactly as stepBullets
    // maps over the bullet it was just handed — dropping any that outlive their
    // lifetime. `Bullet.isExpired` reads the age *before* the increment (as the
    // spec does), so an expiring bullet is retired rather than advanced. Deletion
    // hole-fills from the tail, so iterate tail→head: indices ahead of the cursor
    // stay valid and no snapshot is needed. Runs before collision so a bullet that
    // expires this frame can no longer score a hit. Frozen once the game is over.
    lifetime: {
      schedule: { after: ["movement"] },
      create: (db) => () => {
        const { resources } = db.store;
        if (State.isGameOver({ lives: resources.lives })) return;
        const dt = resources.frameDelta;
        const bounds = resources.bounds;
        if (resources.input.fire) {
          db.transactions.fireBullet();
          resources.input = { ...resources.input, fire: false };
        }
        for (const arch of db.store.queryArchetypes(["position", "velocity", "age"])) {
          const id = arch.columns.id;
          const position = arch.columns.position;
          const velocity = arch.columns.velocity;
          const age = arch.columns.age;
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

    // Resolve collisions the way State.step does: bullet↔asteroid first (each
    // bullet destroys the first asteroid its path this frame sweeps through),
    // then ship↔asteroid. Both discrete outcomes are dispatched as transactions —
    // hitAsteroid (score + split) and loseLife (spend a life, respawn) — so the
    // data/-verified logic is reused and the reactive HUD is notified.
    //
    // Two different broad phases: the SHIP is point-like and moves slowly, so it
    // uses the `byCell` index (this cell + its 8 neighbours) then a circle test.
    // A BULLET is swept — its per-frame travel can span many cells, which the
    // 3×3 byCell window cannot bound — so bullet detection brute-force scans the
    // whole Asteroid archetype (rock counts are small; the byCell index was
    // already over-engineering) with a segment-vs-circle test. Set/scan order
    // need not match the spec's array order (the conformance test compares as a
    // multiset). Bullet ids are snapshotted first: a dispatch migrates archetype
    // rows, so we must not hold a live cursor across one; a bullet is only removed
    // by its own hit, so reading each surviving bullet's position/velocity by id
    // stays valid. Frozen once the game is over.
    collision: {
      schedule: { after: ["movement", "lifetime"] },
      create: (db) => {
        const findHitAsteroid = (
          center: Vec2,
          radius: number,
          exclude?: ReadonlySet<Entity>,
        ): Entity | undefined => {
          const candidates = new Set<Entity>();
          for (const cell of Spatial.neighborKeys(center, Spatial.cellSize)) {
            for (const entity of db.indexes.byCell.find({ cell })) candidates.add(entity);
          }
          for (const candidate of candidates) {
            if (exclude !== undefined && exclude.has(candidate)) continue;
            const asteroid = db.store.read(candidate, db.store.archetypes.Asteroid);
            if (asteroid === null) continue;
            if (Collision.circlesOverlap(center, radius, asteroid.position, Asteroid.radius(asteroid))) {
              return candidate;
            }
          }
          return undefined;
        };
        // Swept bullet detection: test the segment the bullet travelled this
        // frame (prev → position) against every asteroid. A long sweep spans
        // many cells, so the byCell 3×3 window can't bound it — scan the whole
        // Asteroid archetype (counts are small).
        const findSweptHitAsteroid = (
          prev: Vec2,
          position: Vec2,
          radius: number,
          exclude: ReadonlySet<Entity>,
        ): Entity | undefined => {
          for (const arch of db.store.queryArchetypes(["size"])) {
            const id = arch.columns.id;
            for (let i = 0; i < arch.rowCount; i++) {
              const entity = id.get(i);
              if (exclude.has(entity)) continue;
              const asteroid = db.store.read(entity, db.store.archetypes.Asteroid);
              if (asteroid === null) continue;
              if (
                Collision.segmentCircleOverlap(
                  prev,
                  position,
                  asteroid.position,
                  radius + Asteroid.radius(asteroid),
                )
              ) {
                return entity;
              }
            }
          }
          return undefined;
        };
        return () => {
          if (State.isGameOver({ lives: db.store.resources.lives })) return;

          // Detect every (bullet, asteroid) pair FIRST, against the untouched
          // store — so no child a split spawns this frame is ever a target (and
          // no reused entity id can alias one). Each asteroid is claimed by at
          // most one bullet, matching resolveBulletHits. Then apply.
          const dt = db.store.resources.frameDelta;
          const bulletIds: Entity[] = [];
          for (const arch of db.store.queryArchetypes(["position", "age"])) {
            const id = arch.columns.id;
            for (let i = 0; i < arch.rowCount; i++) bulletIds.push(id.get(i));
          }
          const claimed = new Set<Entity>();
          const hits: { readonly bullet: Entity; readonly asteroid: Entity }[] = [];
          for (const bullet of bulletIds) {
            const position = db.store.get(bullet, "position");
            const velocity = db.store.get(bullet, "velocity");
            if (position === undefined || velocity === undefined) continue;
            // Reconstruct the bullet's path this frame. NOTE: this is off on a
            // frame where the bullet screen-wrapped (position jumped across an
            // edge), a rare edge case — acceptable for now.
            const prev = Vec2.subtract(position, Vec2.scale(velocity, dt));
            const asteroid = findSweptHitAsteroid(prev, position, Bullet.radius, claimed);
            if (asteroid !== undefined) {
              claimed.add(asteroid);
              hits.push({ bullet, asteroid });
            }
          }
          for (const hit of hits) db.transactions.hitAsteroid(hit);

          // resolveShipHits spends at most one life regardless of how many
          // asteroids touch the ship, so stop at the first overlap.
          for (const arch of db.store.queryArchetypes(["position", "rotation"])) {
            const position = arch.columns.position;
            for (let i = 0; i < arch.rowCount; i++) {
              if (findHitAsteroid(position.get(i), Ship.radius) !== undefined) {
                db.transactions.loseLife();
                return;
              }
            }
          }
        };
      },
    },

    // Refill the field once it is clear — the ecs wiring for State.spawnWave.
    // Only the Asteroid archetype carries `size`, so a non-empty match means rocks
    // remain and there is nothing to do; otherwise dispatch spawnWave (which bumps
    // `wave` and inserts the next ring through the data/-verified layout). Frozen
    // once the game is over — step never reaches spawnWave after game over, so a
    // dead game does not respawn a wave.
    waves: {
      schedule: { after: ["collision"] },
      create: (db) => () => {
        if (State.isGameOver({ lives: db.store.resources.lives })) return;
        for (const arch of db.store.queryArchetypes(["size"])) {
          if (arch.rowCount > 0) return;
        }
        db.transactions.spawnWave();
      },
    },
  },
});

export type SystemDatabase = Database.Plugin.ToDatabase<typeof systemDatabasePlugin>;

export namespace SystemDatabase {
  export const plugin = systemDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof systemDatabasePlugin>;
}
