// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database, scheduler } from "@adobe/data/ecs";
import { ActionDatabase } from "../actions/action-database.js";
import { Frog } from "../../data/values/frog/frog.js";
import { Lane } from "../../data/values/lane/lane.js";
import { LaneKind } from "../../data/values/lane-kind/lane-kind.js";
import { Outcome } from "../../data/values/outcome/outcome.js";
import { GameStatus } from "../../data/values/game-status/game-status.js";

// The real-time tick loop; each system conforms to its same-named spec function:
//
//   movement  → carry the frog on the log it rides (found from the pre-scroll
//               positions) and scroll every hazard, writing columns in place.
//   collision → classify the frog's fate and dispatch the discrete outcome (winGoal /
//               loseLife) as a transaction so observers (the HUD) are notified.
//
// Each system is frozen once the game is over. The built-in `scheduler` drives them on
// requestAnimationFrame; a headless host drives frames itself by invoking
// `db.system.functions[name]()` for each name of each tier in `db.system.order`
// (skipping `schedulerSystem`).
const systemDatabasePlugin = Database.Plugin.create({
  extends: Database.Plugin.combine(ActionDatabase.plugin, scheduler),
  systems: {
    movement: {
      create: (db) => () => {
        const { resources } = db.store;
        if (!GameStatus.isPlaying(resources.status)) return;
        const dt = resources.frameDelta;
        const { boardWidth: width, frog } = resources;
        const hazards = db.store.archetypes.Hazard.components;

        const lane = Lane.at(resources.lanes, frog.y);
        let carrierVelocity: number | undefined;
        if (lane !== undefined && LaneKind.coveredOutcome[lane.kind] === "ride") {
          for (const arch of db.store.queryArchetypes(hazards)) {
            const { lane: laneCol, x: xCol, width: widthCol, velocity: velocityCol } = arch.columns;
            for (let i = 0; i < arch.rowCount && carrierVelocity === undefined; i++) {
              if (laneCol.get(i) === frog.y && Lane.coversAt(xCol.get(i), widthCol.get(i), frog.x)) {
                carrierVelocity = velocityCol.get(i);
              }
            }
          }
        }

        for (const arch of db.store.queryArchetypes(hazards)) {
          const { x: xCol, velocity: velocityCol } = arch.columns;
          for (let i = 0; i < arch.rowCount; i++) {
            xCol.set(i, Lane.nextX(xCol.get(i), velocityCol.get(i), dt, width));
          }
        }

        if (carrierVelocity !== undefined) {
          resources.frog = { x: frog.x + carrierVelocity * dt, y: frog.y };
        }
      },
    },

    collision: {
      schedule: { after: ["movement"] },
      create: (db) => () => {
        const { resources } = db.store;
        if (!GameStatus.isPlaying(resources.status)) return;
        const { frog } = resources;
        const lane = Lane.at(resources.lanes, frog.y);
        if (lane === undefined) return;

        let covered = false;
        if (Frog.onBoard(frog, resources.boardWidth)) {
          for (const arch of db.store.queryArchetypes(db.store.archetypes.Hazard.components)) {
            const { lane: laneCol, x: xCol, width: widthCol } = arch.columns;
            for (let i = 0; i < arch.rowCount && !covered; i++) {
              covered = laneCol.get(i) === frog.y && Lane.coversAt(xCol.get(i), widthCol.get(i), frog.x);
            }
          }
        }

        // Dispatched after the archetype reads, so no live cursor is held across them.
        const outcome = LaneKind.outcome(lane.kind, covered);
        if (outcome === "win") db.transactions.winGoal();
        else if (Outcome.isFatal[outcome]) db.transactions.loseLife();
      },
    },
  },
});

export type SystemDatabase = Database.Plugin.ToDatabase<typeof systemDatabasePlugin>;

export namespace SystemDatabase {
  export const plugin = systemDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof systemDatabasePlugin>;
}
