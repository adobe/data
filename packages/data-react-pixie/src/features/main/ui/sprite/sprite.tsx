// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "@adobe/data/ecs";
import { useObservableValues } from "@adobe/data-react";
import { useMainService } from "../use-main-service.js";
import { spriteImages } from "./sprite-images.js";
import { useSpriteTexture } from "./use-sprite-texture.js";
import * as presentation from "./sprite-presentation.js";

export function Sprite({ entity }: { entity: Entity }) {
  const db = useMainService();
  const values = useObservableValues(
    () => ({
      sprite: db.observe.entity(entity, db.archetypes.Sprite),
    }),
    [entity],
  );

  const kind = values?.sprite?.kind ?? "bunny";
  const texture = useSpriteTexture(spriteImages[kind]);

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
