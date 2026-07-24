// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import { customElement } from "lit/decorators.js";
import type { Vec2 } from "@adobe/data/math";
import {
  DatabaseElement,
  useEffect,
  useElement,
  useObservableValues,
  useRef,
  useWindowEvent,
} from "@adobe/data-lit";
import { FeatureDatabase } from "../../ecs/feature-database.js";
import type { Input } from "../../data/input/input.js";
import type { Size } from "../../data/size/size.js";
import { styles } from "./space-rock-game.css.js";
import * as presentation from "./space-rock-game-presentation.js";
import { draw } from "./space-rock-game-draw.js";

const tagName = "space-rock-game";
const canvasWidth = 800;
const canvasHeight = 600;

declare global {
  interface HTMLElementTagNameMap {
    [tagName]: SpaceRockGameElement;
  }
}

// The direction keys currently held. Turn/thrust reflect the held set; fire is
// dispatched as an edge (see the keydown handler), never tracked here.
type Held = { left: boolean; right: boolean; up: boolean };

// Map held keys → the player's Input for a tick. Keeping the key→Input mapping
// here (rather than in data/) is deliberate: which physical keys mean turn /
// thrust / fire is a UI concern.
const toInput = (held: Held, fire: boolean): Input => ({
  turn: (held.right ? 1 : 0) - (held.left ? 1 : 0),
  thrust: held.up,
  fire,
});

// Read the live store into the plain scene the pure `draw` paints. This is the
// render bridge, not game logic: the scheduler advances the sim on its own rAF,
// mostly via in-place column writes that never fire observers, so the canvas
// must read the current columns synchronously each frame rather than subscribe.
const buildScene = (game: FeatureDatabase) => {
  const ships: { position: Vec2; rotation: number }[] = [];
  for (const arch of game.queryArchetypes(["position", "rotation"])) {
    const position = arch.columns.position;
    const rotation = arch.columns.rotation;
    for (let i = 0; i < arch.rowCount; i++) {
      ships.push({ position: position.get(i), rotation: rotation.get(i) });
    }
  }
  const asteroids: { position: Vec2; size: Size }[] = [];
  for (const arch of game.queryArchetypes(["position", "size"])) {
    const position = arch.columns.position;
    const size = arch.columns.size;
    for (let i = 0; i < arch.rowCount; i++) {
      asteroids.push({ position: position.get(i), size: size.get(i) });
    }
  }
  const bullets: { position: Vec2 }[] = [];
  for (const arch of game.queryArchetypes(["position", "age"])) {
    const position = arch.columns.position;
    for (let i = 0; i < arch.rowCount; i++) {
      bullets.push({ position: position.get(i) });
    }
  }
  return { ships, asteroids, bullets };
};

@customElement(tagName)
export class SpaceRockGameElement extends DatabaseElement<typeof FeatureDatabase.plugin> {
  static styles = styles;

  get plugin() {
    return FeatureDatabase.plugin;
  }

  render() {
    const service = this.service;
    const canvas = useElement("canvas");
    const held = useRef<Held>({ left: false, right: false, up: false });

    // Bootstrap once: size the play-field to the canvas, then start a game.
    useEffect(() => {
      service.transactions.setBounds([canvasWidth, canvasHeight]);
      service.transactions.newGame();
    }, [service]);

    // Draw loop — render only. The scheduler ticks the sim on its own rAF; this
    // loop paints the current store each frame and cancels on teardown.
    useEffect(() => {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // The draw loop reads columns synchronously each frame — the full db the
      // container base class exposes to imperative-rendering subclasses (the
      // reactive `service` can't, since systems mutate columns without firing
      // observers).
      const game = this.database;
      let handle = requestAnimationFrame(function frame() {
        draw(ctx, buildScene(game));
        handle = requestAnimationFrame(frame);
      });
      return () => cancelAnimationFrame(handle);
    }, [canvas]);

    // Continuous keys update the held set and re-dispatch (fire cleared). Space
    // is an edge: dispatch fire once per physical press (ignore auto-repeat).
    useWindowEvent(
      "keydown",
      () => (event: KeyboardEvent) => {
        if (event.repeat) return;
        const keys = held.current;
        if (event.code === "ArrowLeft") keys.left = true;
        else if (event.code === "ArrowRight") keys.right = true;
        else if (event.code === "ArrowUp") keys.up = true;
        else if (event.code === "Space") {
          event.preventDefault();
          service.transactions.setInput(toInput(keys, true));
          return;
        } else return;
        event.preventDefault();
        service.transactions.setInput(toInput(keys, false));
      },
      [service],
    );

    useWindowEvent(
      "keyup",
      () => (event: KeyboardEvent) => {
        const keys = held.current;
        if (event.code === "ArrowLeft") keys.left = false;
        else if (event.code === "ArrowRight") keys.right = false;
        else if (event.code === "ArrowUp") keys.up = false;
        else return;
        service.transactions.setInput(toInput(keys, false));
      },
      [service],
    );

    const values = useObservableValues(
      () => ({
        score: service.observe.resources.score,
        lives: service.observe.resources.lives,
        wave: service.observe.resources.wave,
        gameOver: service.computed.gameOver,
      }),
      [],
    );

    return html`
      <canvas width=${canvasWidth} height=${canvasHeight}></canvas>
      ${presentation.render({
        score: values?.score ?? 0,
        lives: values?.lives ?? 0,
        wave: values?.wave ?? 0,
        gameOver: values?.gameOver ?? false,
        newGame: service.transactions.newGame,
      })}
    `;
  }
}
