// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Size } from "../../data/size/size.js";
import { Bullet } from "../../data/bullet/bullet.js";
import { draw } from "./asteroids-draw.js";

type Arc = { x: number; y: number; r: number };

// A DOM-free recorder implementing exactly the 2D-context subset `draw` calls.
const createContext = () => {
  const arcs: Arc[] = [];
  const recorder = {
    canvas: { width: 800, height: 600 },
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    fillRect() {},
    beginPath() {},
    arc(x: number, y: number, r: number) {
      arcs.push({ x, y, r });
    },
    stroke() {},
    fill() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
  };
  // The recorder implements only the methods `draw` uses; narrow it to the full
  // context so the pure renderer runs headless. Case-1: known subset.
  const ctx = recorder as unknown as CanvasRenderingContext2D;
  return { ctx, arcs };
};

const scene: Parameters<typeof draw>[1] = {
  ships: [{ position: [400, 300], rotation: 0 }],
  asteroids: [
    { position: [100, 100], size: "large" },
    { position: [200, 220], size: "small" },
  ],
  bullets: [{ position: [50, 50] }],
};

describe("asteroids-draw", () => {
  it("draws a circle per asteroid sized from the Size descriptor", () => {
    const { ctx, arcs } = createContext();
    draw(ctx, scene);
    for (const asteroid of scene.asteroids) {
      expect(arcs.some((arc) => arc.r === Size.radius[asteroid.size])).toBe(true);
    }
  });

  it("draws a dot per bullet at the bullet radius", () => {
    const { ctx, arcs } = createContext();
    draw(ctx, scene);
    expect(arcs.some((arc) => arc.r === Bullet.radius)).toBe(true);
  });

  it("paints an empty scene without throwing", () => {
    const { ctx } = createContext();
    expect(() => draw(ctx, { ships: [], asteroids: [], bullets: [] })).not.toThrow();
  });
});
