// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database, scheduler } from "@adobe/data/ecs";
import type { Entity } from "@adobe/data/ecs";
import { TransactionDatabase } from "../transaction-database/transaction-database.js";
import { GameStatus } from "../../data/game-status/game-status.js";
import { LaneKind } from "../../data/lane-kind/lane-kind.js";
import { Hazard } from "../../data/hazard/hazard.js";
import { Outcome } from "../../data/outcome/outcome.js";
import { State } from "../../data/state/state.js";

// The real-time tick loop. Extends the transaction database (schema +
// transactions — hopper has no index/computed layer) combined with the built-in
// `scheduler`, and declares the `systems` facet INLINE so each `create`'s `db` is
// strongly typed (the assembled database with a *writable* store) and the
// scheduler can infer the system-name union from the map's keys.
//
// The three systems mirror the internal sequence of `data/` `State.step`:
//
//   hopInput  → consume the queued hop and dispatch the `hop` transaction. NOT
//               part of step (a keypress transform); seeded empty in conformance.
//               Named `hopInput` (not `input`) so it never collides with core's
//               `input` phase anchor when the ui render plugin is combined on top.
//   movement  → advance every hazard (wrap) and carry the frog on the log it
//               rides — the "advance hazards → carry frog" half of step.
//   collision → classify the frog's fate with the `frogOutcome` oracle, then
//               dispatch the discrete outcome (winGoal / loseLife) as a
//               transaction so observers (the HUD) are notified — the
//               "outcome → apply" half of step.
//
// Every system replicates step's top-level guard (`if (!isPlaying) return`) so a
// finished game is a truly frozen frame. The scheduler drives the systems on
// requestAnimationFrame; its `schedulerState` resource gates start/pause/resume.
// A headless host (tests, server sim) omits rAF and drives frames itself by
// invoking `db.system.functions[name]()` for each name in `db.system.order`.
const systemDatabasePlugin = Database.Plugin.create({
  extends: Database.Plugin.combine(TransactionDatabase.plugin, scheduler),
  systems: {
    // Consume the queued hop, if any, and dispatch the conformant `hop`
    // transaction (reusing its data/-verified clamp+snap and notifying observers),
    // then clear the queue so one keypress is one hop. Runs before movement so the
    // player acts, then the world advances. Frozen once the game is over.
    hopInput: {
      create: (db) => () => {
        const { resources } = db.store;
        if (!GameStatus.isPlaying(resources.status)) return;
        const direction = resources.pendingDirection;
        if (direction === null) return;
        db.transactions.hop(direction);
        resources.pendingDirection = null;
      },
    },

    // Advance every hazard and carry a log-riding frog — the hot per-row half of
    // step. The carrier (the log the frog stands on) is read from the PRE-advance
    // positions, matching step; hazards then advance in place via `Hazard.nextX`
    // (column writes, no per-row allocation, no archetype migration); finally the
    // frog is moved with its log. Frozen once the game is over.
    movement: {
      schedule: { after: ["hopInput"] },
      create: (db) => () => {
        const { resources } = db.store;
        if (!GameStatus.isPlaying(resources.status)) return;
        const dt = resources.frameDelta;
        const width = resources.width;

        let frogId: Entity | undefined;
        let frogX = 0;
        let frogY = 0;
        for (const arch of db.store.queryArchetypes(["x", "y"])) {
          for (let i = 0; i < arch.rowCount; i++) {
            frogId = arch.columns.id.get(i);
            frogX = arch.columns.x.get(i);
            frogY = arch.columns.y.get(i);
          }
        }

        // Only a carrying lane (river) rides; find the log under the frog first,
        // before its position is advanced below.
        const lane = State.laneAt({ lanes: resources.lanes }, frogY);
        const riding = lane !== undefined && LaneKind.coveredOutcome[lane.kind] === "ride";
        let carried = false;
        let carrierVelocity = 0;
        if (riding) {
          for (const arch of db.store.queryArchetypes(["lane", "x", "width", "velocity"])) {
            const laneCol = arch.columns.lane;
            const xCol = arch.columns.x;
            const widthCol = arch.columns.width;
            const velocityCol = arch.columns.velocity;
            for (let i = 0; i < arch.rowCount; i++) {
              if (laneCol.get(i) === frogY && Hazard.coversAt(xCol.get(i), widthCol.get(i), frogX)) {
                carried = true;
                carrierVelocity = velocityCol.get(i);
                break;
              }
            }
          }
        }

        for (const arch of db.store.queryArchetypes(["x", "velocity"])) {
          const xCol = arch.columns.x;
          const velocityCol = arch.columns.velocity;
          for (let i = 0; i < arch.rowCount; i++) {
            xCol.set(i, Hazard.nextX(xCol.get(i), velocityCol.get(i), dt, width));
          }
        }

        if (frogId !== undefined && carried) {
          db.store.update(frogId, { x: frogX + carrierVelocity * dt });
        }
      },
    },

    // Resolve the frog's fate the way step does: read it (post-movement) and the
    // hazards (post-advance), classify with the `frogOutcome` oracle, then apply —
    // a win scores and ends the game, a fatal outcome spends a life and respawns
    // (or ends the game on the last life). Building the small hazard slice once
    // per frame (not per row) keeps the oracle the single source of the collision
    // math. Frozen once the game is over.
    collision: {
      schedule: { after: ["movement"] },
      create: (db) => () => {
        const { resources } = db.store;
        if (!GameStatus.isPlaying(resources.status)) return;

        let hasFrog = false;
        let frogX = 0;
        let frogY = 0;
        for (const arch of db.store.queryArchetypes(["x", "y"])) {
          for (let i = 0; i < arch.rowCount; i++) {
            hasFrog = true;
            frogX = arch.columns.x.get(i);
            frogY = arch.columns.y.get(i);
          }
        }
        if (!hasFrog) return;

        const hazards: Hazard[] = [];
        for (const arch of db.store.queryArchetypes(["kind", "lane", "x", "width", "velocity"])) {
          for (let i = 0; i < arch.rowCount; i++) {
            hazards.push({
              kind: arch.columns.kind.get(i),
              lane: arch.columns.lane.get(i),
              x: arch.columns.x.get(i),
              width: arch.columns.width.get(i),
              velocity: arch.columns.velocity.get(i),
            });
          }
        }

        const outcome = State.frogOutcome({
          lanes: resources.lanes,
          hazards,
          frog: { x: frogX, y: frogY },
          width: resources.width,
        });

        // Discrete atomic events go through transactions so observers (the HUD)
        // are notified. Dispatched AFTER the archetype reads above, so no live
        // cursor is held across them.
        if (outcome === "win") {
          db.transactions.winGoal();
          return;
        }
        if (Outcome.isFatal[outcome]) {
          db.transactions.loseLife();
        }
      },
    },
  },
});

export type SystemDatabase = Database.Plugin.ToDatabase<typeof systemDatabasePlugin>;

export namespace SystemDatabase {
  export const plugin = systemDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof systemDatabasePlugin>;
}
