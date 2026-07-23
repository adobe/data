// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec2 } from "@adobe/data/math";
import { Ship } from "../../data/ship/ship.js";
import { Bullet } from "../../data/bullet/bullet.js";
import { Size } from "../../data/size/size.js";

// Pure canvas renderer. Given a 2D context and a plain snapshot of what to draw,
// it paints one frame: asteroids as circles (radius + colour looked up from the
// Size descriptors), bullets as dots, the ship as a triangle facing its
// rotation. No database and no store access — the element builds the scene.
export function draw(
  ctx: CanvasRenderingContext2D,
  scene: {
    readonly ships: readonly { readonly position: Vec2; readonly rotation: number }[];
    readonly asteroids: readonly { readonly position: Vec2; readonly size: Size }[];
    readonly bullets: readonly { readonly position: Vec2 }[];
  },
): void {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, width, height);

  ctx.lineWidth = 2;
  for (const asteroid of scene.asteroids) {
    ctx.beginPath();
    ctx.arc(asteroid.position[0], asteroid.position[1], Size.radius[asteroid.size], 0, Math.PI * 2);
    ctx.strokeStyle = Size.color[asteroid.size];
    ctx.stroke();
  }

  ctx.fillStyle = "#ffd166";
  for (const bullet of scene.bullets) {
    ctx.beginPath();
    ctx.arc(bullet.position[0], bullet.position[1], Bullet.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "#8ecae6";
  for (const ship of scene.ships) {
    drawShip(ctx, ship.position, ship.rotation);
  }
}

// A small triangle: nose along the ship's facing, two tail corners spread along
// the perpendicular. Orientation comes from the data/ helper, not re-derived.
function drawShip(ctx: CanvasRenderingContext2D, position: Vec2, rotation: number): void {
  const [fx, fy] = Ship.facing(rotation);
  const perpX = -fy;
  const perpY = fx;
  const x = position[0];
  const y = position[1];
  const noseX = x + fx * Ship.radius;
  const noseY = y + fy * Ship.radius;
  const tailX = x - fx * Ship.radius * 0.6;
  const tailY = y - fy * Ship.radius * 0.6;
  const wing = Ship.radius * 0.7;
  ctx.beginPath();
  ctx.moveTo(noseX, noseY);
  ctx.lineTo(tailX + perpX * wing, tailY + perpY * wing);
  ctx.lineTo(tailX - perpX * wing, tailY - perpY * wing);
  ctx.closePath();
  ctx.stroke();
}
