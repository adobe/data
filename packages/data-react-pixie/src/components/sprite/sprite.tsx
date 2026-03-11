// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "@adobe/data/ecs";
import { useObservableValues } from "@adobe/data-react";
import { usePixieDatabase } from "../../state/use-pixie-database";
import { SpriteType } from "../../types/sprite-type/sprite-type";
import { useSpriteTexture } from "./use-sprite-texture";
import * as presentation from "./sprite-presentation";

export function Sprite({ entity }: { entity: Entity }) {
  const db = usePixieDatabase();
  const values = useObservableValues(
    () => ({
      sprite: db.observe.entity(entity, db.archetypes.Sprite),
    }),
    [entity],
  );

  const spriteType = values?.sprite?.sprite ?? "bunny";
  const texture = useSpriteTexture(SpriteType.image[spriteType]);

  if (!values?.sprite || !texture) return null;

  const { sprite } = values;
  const scale = sprite.active ? 1.5 : sprite.hovered ? 1.25 : 1;

  return presentation.render({
    texture,
    x: sprite.position[0],
    y: sprite.position[1],
    rotation: sprite.rotation,
    scale,
    toggleSpriteActive: () => db.transactions.toggleSpriteActive({ entity }),
    setSpriteHoveredTrue: () => db.transactions.setSpriteHovered({ entity, hovered: true }),
    setSpriteHoveredFalse: () => db.transactions.setSpriteHovered({ entity, hovered: false }),
  });
}
