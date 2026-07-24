// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Entity } from "@adobe/data/ecs";
import { Mat4x4, Quat, Vec3 } from "@adobe/data/math";
import type { Aabb } from "@adobe/data/math";
import { pbrIblRender, shapeGeometry, VisibleMaterial } from "@adobe/data-gpu/graphics";
import type { Camera } from "@adobe/data-gpu/graphics";
import { CoreDatabase } from "../../ecs/core-database/core-database.js";
import { newGame } from "../../ecs/transaction-database/transactions/new-game.js";
import { Frog } from "../../data/frog/frog.js";
import { HazardKind } from "../../data/hazard-kind/hazard-kind.js";
import { LaneKind } from "../../data/lane-kind/lane-kind.js";
import type { Direction } from "../../data/direction/direction.js";

// Board → world mapping. The board lies on the XZ plane (Y up): game column `x`
// maps to world X, game row `y` maps to world −Z (row 0 nearest the camera). The
// built-in `unitCube` spans [-1, 1] (size 2), so a `scale` of `s` yields size
// `2s` — a one-cell cube is scale 0.5.
const TILE_Y = -0.1;
const TILE_HEIGHT = 0.1;
const TILE_DEPTH = 0.5;
const ENTITY_Y = 0.35;
const FROG_SCALE: Vec3 = [0.35, 0.35, 0.35];
const HAZARD_Y = 0.3;
const HAZARD_HEIGHT = 0.3;
const HAZARD_DEPTH = 0.35;
// When the frog rides a log it rests ON the log's top face, not at ground level.
const FROG_Y_ON_LOG = HAZARD_Y + HAZARD_HEIGHT + FROG_SCALE[1];
const UNIT_CUBE_BOUNDS: Aabb = { min: [-1, -1, -1], max: [1, 1, 1] };

const colorKey = (color: readonly number[]): string => color.join(",");

// The renderer, combined ON TOP of the headless `FeatureDatabase` at the element
// level (never inside it, so the simulation stays GPU-free). Draws the game as
// colored cubes via `pbrIblRender` — with `light.environmentUrl` left null so its
// IBL bake is procedural (zero network) — reusing the shared unit cube baked by
// `shapeGeometry` with one color material per palette entry.
const hopperRenderPlugin = Database.Plugin.create({
  extends: Database.Plugin.combine(pbrIblRender, shapeGeometry, CoreDatabase.plugin),
  components: {
    // A render cube's back-reference to the game entity it visualises.
    _gameEntity: { default: 0 as Entity },
  },
  resources: {
    // color key → the cube mesh-asset entity baked for that color.
    _cubeMeshByColor: { default: null as Map<string, Entity> | null, nonPersistent: true },
  },
  archetypes: {
    // A moving cube bound to a game entity (frog / hazard). `_worldMatrix` is
    // added by the transform system, so this renders like any `Model`.
    _RenderCube: ["mesh", "position", "rotation", "scale", "visible", "parent", "_gameEntity"],
  },
  transactions: {
    // Fixed isometric camera + a warm directional key light (no environment map),
    // and a fresh game. Called once when the canvas connects.
    initializeScene(t) {
      newGame(t);
      const w = t.resources.width;
      const h = t.resources.height;
      const cx = (w - 1) / 2;
      const cz = -(h - 1) / 2;
      const d = Math.max(w, h) * 1.15;
      t.resources.camera = {
        aspect: 16 / 9,
        fieldOfView: Math.PI / 6,
        nearPlane: 0.1,
        farPlane: 1000,
        position: [cx + d, d, cz + d],
        target: [cx, 0, cz],
        up: [0, 1, 0],
        orthographic: 1,
      } satisfies Camera;
      // Bright ambient so the few isometric cube faces read clearly under a
      // single directional light; no `environmentUrl` → procedural IBL, no fetch.
      t.resources.light = {
        direction: Vec3.normalize([-1, -2, -1.5]),
        color: [1, 0.95, 0.85],
        ambientStrength: 0.95,
        environmentUrl: null,
      };
    },
    // Reset to a fresh game. `newGame` deletes then re-inserts the frog and
    // hazards, which recycles their entity ids; the render cubes are keyed by
    // those ids, so a surviving cube would silently re-bind to a different-kind
    // entity (a log landing on the frog's start, the frog cube drifting off to a
    // hazard). Drop the render cubes here so `_renderSync` rebuilds them from the
    // fresh entities next frame.
    startGame(t) {
      newGame(t);
      for (const arch of t.queryArchetypes(t.archetypes._RenderCube.components)) {
        for (let row = arch.rowCount - 1; row >= 0; row--) t.delete(arch.columns.id.get(row));
      }
    },
    // Queue a hop; the `hopInput` system consumes it next frame.
    queueHop(t, direction: Direction) {
      t.resources.pendingDirection = direction;
    },
  },
  systems: {
    // Keep the simulation's `frameDelta` fed from the real frame clock (the
    // headless tests set it by hand instead).
    _frameDeltaSync: {
      schedule: { during: ["input"] },
      create: (db) => () => {
        db.store.resources.frameDelta = db.store.resources.frameTime.dt;
      },
    },

    // One-time scene build once the GPU device and the shared cube are ready:
    // bake one color material per palette entry (all reusing the shared cube
    // geometry) and lay down the static lane tiles.
    _buildScene: {
      schedule: { during: ["update"] },
      create: (db) => {
        let built = false;
        return () => {
          if (built) return;
          const { device, _shapeMeshes } = db.store.resources;
          if (!device || !_shapeMeshes) return;

          let vertexBuffer: GPUBuffer | null = null;
          let indexBuffer: GPUBuffer | null = null;
          let indexCount = 0;
          for (const arch of db.store.queryArchetypes(["_mesh", "_vertexBuffer", "_indexBuffer", "_indexCount"])) {
            const meshCol = arch.columns._mesh;
            const vbCol = arch.columns._vertexBuffer;
            const ibCol = arch.columns._indexBuffer;
            const countCol = arch.columns._indexCount;
            for (let i = 0; i < arch.rowCount; i++) {
              if (meshCol.get(i) === _shapeMeshes.cube) {
                vertexBuffer = vbCol.get(i);
                indexBuffer = ibCol.get(i);
                indexCount = countCol.get(i);
              }
            }
          }
          if (!vertexBuffer || !indexBuffer) return;
          const vb = vertexBuffer;
          const ib = indexBuffer;

          const byColor = new Map<string, Entity>();
          const ensure = (color: readonly [number, number, number, number]): Entity => {
            const key = colorKey(color);
            const existing = byColor.get(key);
            if (existing !== undefined) return existing;
            const meshAsset = db.store.archetypes.StaticMesh.insert({ localBounds: UNIT_CUBE_BOUNDS });
            const material = db.store.archetypes._VisibleMaterial.insert({
              nonPersistent: true,
              _materialBindGroup: VisibleMaterial.createColorBindGroup(device, { color, metallic: 0, roughness: 0.7 }),
              _mesh: meshAsset,
            });
            db.store.archetypes._PbrPrimitive.insert({
              nonPersistent: true,
              _mesh: meshAsset,
              _material: material,
              _vertexBuffer: vb,
              _skinVertexBuffer: null,
              _indexBuffer: ib,
              _indexCount: indexCount,
              _indexFormat: "uint16",
              _nodeLocalMatrix: Mat4x4.identity,
            });
            byColor.set(key, meshAsset);
            return meshAsset;
          };

          ensure(Frog.frogColor);
          ensure(HazardKind.hazardColor.car);
          ensure(HazardKind.hazardColor.log);

          const w = db.store.resources.width;
          const cx = (w - 1) / 2;
          for (const lane of db.store.resources.lanes) {
            const meshAsset = ensure(LaneKind.laneColor[lane.kind]);
            db.store.archetypes.Model.insert({
              mesh: meshAsset,
              position: [cx, TILE_Y, -lane.row],
              rotation: Quat.identity,
              scale: [w / 2, TILE_HEIGHT, TILE_DEPTH],
              visible: true,
              parent: 0,
            });
          }

          db.store.resources._cubeMeshByColor = byColor;
          built = true;
        };
      },
    },

    // Every frame, reconcile the moving render cubes to the game entities and
    // reposition them: create a cube for a new frog/hazard, drop a cube whose
    // game entity is gone (a new game recreates them), and copy each live
    // entity's board position into its cube's world transform.
    _renderSync: {
      schedule: { during: ["preRender"] },
      create: (db) => () => {
        const byColor = db.store.resources._cubeMeshByColor;
        if (!byColor) return;

        const cubeByGame = new Map<Entity, Entity>();
        for (const arch of db.store.queryArchetypes(["_gameEntity", "position"])) {
          const idCol = arch.columns.id;
          const gameCol = arch.columns._gameEntity;
          for (let i = 0; i < arch.rowCount; i++) cubeByGame.set(gameCol.get(i), idCol.get(i));
        }

        const alive = new Set<Entity>();
        const frogMesh = byColor.get(colorKey(Frog.frogColor));
        const lanes = db.store.resources.lanes;
        for (const arch of db.store.queryArchetypes(["x", "y"])) {
          const idCol = arch.columns.id;
          const xCol = arch.columns.x;
          const yCol = arch.columns.y;
          for (let i = 0; i < arch.rowCount; i++) {
            const gameId = idCol.get(i);
            alive.add(gameId);
            const y = yCol.get(i);
            // On a river lane an alive frog is riding a log — lift it onto the
            // log's top face instead of leaving it at ground level.
            const lane = lanes.find((l) => l.row === y);
            const onLog = lane !== undefined && LaneKind.coveredOutcome[lane.kind] === "ride";
            const position: Vec3 = [xCol.get(i), onLog ? FROG_Y_ON_LOG : ENTITY_Y, -y];
            const cube = cubeByGame.get(gameId);
            if (cube !== undefined) {
              db.store.update(cube, { position });
            } else if (frogMesh !== undefined) {
              db.store.archetypes._RenderCube.insert({
                mesh: frogMesh, position, rotation: Quat.identity, scale: FROG_SCALE,
                visible: true, parent: 0, _gameEntity: gameId,
              });
            }
          }
        }

        for (const arch of db.store.queryArchetypes(["kind", "lane", "x", "width", "velocity"])) {
          const idCol = arch.columns.id;
          const kindCol = arch.columns.kind;
          const laneCol = arch.columns.lane;
          const xCol = arch.columns.x;
          const widthCol = arch.columns.width;
          for (let i = 0; i < arch.rowCount; i++) {
            const gameId = idCol.get(i);
            alive.add(gameId);
            const width = widthCol.get(i);
            const position: Vec3 = [xCol.get(i) + width / 2, HAZARD_Y, -laneCol.get(i)];
            const cube = cubeByGame.get(gameId);
            if (cube !== undefined) {
              db.store.update(cube, { position });
            } else {
              const mesh = byColor.get(colorKey(HazardKind.hazardColor[kindCol.get(i)]));
              if (mesh !== undefined) {
                db.store.archetypes._RenderCube.insert({
                  mesh, position, rotation: Quat.identity,
                  scale: [width / 2, HAZARD_HEIGHT, HAZARD_DEPTH],
                  visible: true, parent: 0, _gameEntity: gameId,
                });
              }
            }
          }
        }

        for (const arch of db.store.queryArchetypes(["_gameEntity"])) {
          const idCol = arch.columns.id;
          const gameCol = arch.columns._gameEntity;
          for (let i = arch.rowCount - 1; i >= 0; i--) {
            if (!alive.has(gameCol.get(i))) db.store.delete(idCol.get(i));
          }
        }
      },
    },
  },
});

export type HopperRenderDatabase = Database.Plugin.ToDatabase<typeof hopperRenderPlugin>;

export namespace HopperRenderDatabase {
  export const plugin = hopperRenderPlugin;
}
