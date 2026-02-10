// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Boolean, Schema } from "@adobe/data/schema";
import { Vec2, F32 } from "@adobe/data/math";

export const spriteTypeSchema = { enum: ["bunny", "fox"] } as const satisfies Schema;
export type SpriteType = Schema.ToType<typeof spriteTypeSchema>;

export type FilterType = "none" | "sepia" | "blur" | "vintage" | "night";

export const pixiePlugin = Database.Plugin.create({
  components: {
    position: Vec2.schema,
    rotation: F32.schema,
    sprite: spriteTypeSchema,
    hovered: Boolean.schema,
    active: Boolean.schema,
  },
  resources: {
    filterType: { default: "none" as FilterType },
  },
  archetypes: {
    Sprite: ["position", "rotation", "sprite", "hovered", "active"],
  },
  transactions: {
    tick: (t, delta: number) => {
      const entities = t.select(["position", "rotation", "sprite", "hovered", "active"]);
      for (const entity of entities) {
        const row = t.read(entity);
        if (row?.rotation !== undefined) {
          t.update(entity, { rotation: row.rotation + delta * 0.1 });
        }
      }
    },
    createSprite: (
      t,
      args: { position: [number, number]; rotation?: number; sprite: "bunny" | "fox" },
    ) => {
      return t.archetypes.Sprite.insert({
        position: args.position,
        rotation: args.rotation ?? 0,
        sprite: args.sprite,
        hovered: false,
        active: false,
      });
    },
    setSpriteHovered: (t, args: { entity: number; hovered: boolean }) => {
      t.update(args.entity, { hovered: args.hovered });
    },
    setSpriteActive: (t, args: { entity: number; active: boolean }) => {
      t.update(args.entity, { active: args.active });
    },
    toggleSpriteActive: (t, args: { entity: number }) => {
      const row = t.read(args.entity);
      if (row?.active !== undefined) {
        t.update(args.entity, { active: !row.active });
      }
    },
    setFilterType: (t, args: { filterType: FilterType }) => {
      t.resources.filterType = args.filterType;
    },
  },
  systems: {
    pixie_plugin_initialize: {
      create: (db) => {
        db.store.archetypes.Sprite.insert({
          position: [100, 100],
          rotation: 0,
          sprite: "bunny",
          hovered: false,
          active: false,
        });
        db.store.archetypes.Sprite.insert({
          position: [200, 150],
          rotation: 0.5,
          sprite: "bunny",
          hovered: false,
          active: false,
        });
        db.store.archetypes.Sprite.insert({
          position: [300, 200],
          rotation: 1,
          sprite: "fox",
          hovered: false,
          active: false,
        });
        db.store.archetypes.Sprite.insert({
          position: [150, 250],
          rotation: 0.2,
          sprite: "fox",
          hovered: false,
          active: false,
        });
      }
    }
  }
});

export type PixieDatabase = Database.FromPlugin<typeof pixiePlugin>;
