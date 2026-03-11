// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Texture } from "pixi.js";

export function render(args: {
  texture: Texture;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  toggleSpriteActive: () => void;
  setSpriteHoveredTrue: () => void;
  setSpriteHoveredFalse: () => void;
}) {
  const {
    texture,
    x,
    y,
    rotation,
    scale,
    toggleSpriteActive,
    setSpriteHoveredTrue,
    setSpriteHoveredFalse,
  } = args;
  return (
    <pixiSprite
      anchor={0.5}
      eventMode="static"
      onClick={toggleSpriteActive}
      onPointerOver={setSpriteHoveredTrue}
      onPointerOut={setSpriteHoveredFalse}
      scale={scale}
      texture={texture}
      x={x}
      y={y}
      rotation={rotation}
    />
  );
}
