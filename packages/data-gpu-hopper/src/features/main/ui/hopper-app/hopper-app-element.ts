// © 2026 Adobe. MIT License. See /LICENSE for details.
import { customElement } from "lit/decorators.js";
import { DatabaseElement, useEffect, useElement, useObservableValues } from "@adobe/data-lit";
import type { Direction } from "../../data/direction/direction.js";
import { HopperApp } from "../hopper-app-plugin.js";
import * as presentation from "./hopper-app-presentation.js";
import { styles } from "./hopper-app.css.js";

const tagName = "hopper-app";

declare global {
  interface HTMLElementTagNameMap {
    [tagName]: HopperAppElement;
  }
}

// Keyboard → hop direction as a data map, so the direction set is not respelled
// as call-site conditionals.
const keyToDirection: Readonly<Record<string, Direction>> = {
  ArrowUp: "up", w: "up", W: "up",
  ArrowDown: "down", s: "down", S: "down",
  ArrowLeft: "left", a: "left", A: "left",
  ArrowRight: "right", d: "right", D: "right",
};

@customElement(tagName)
export class HopperAppElement extends DatabaseElement<typeof HopperApp.plugin> {
  static styles = styles;

  get plugin() {
    return HopperApp.plugin;
  }

  override render() {
    const canvas = useElement("canvas");
    const service = this.service;

    useEffect(() => {
      if (!canvas) return;
      service.transactions.setCanvas(canvas);
      service.transactions.initializeScene();
      canvas.focus();
    }, [canvas, service]);

    const values = useObservableValues(() => ({
      lives: service.observe.resources.lives,
      score: service.observe.resources.score,
      status: service.observe.resources.status,
    }), [service]);

    const onKeyDown = (event: KeyboardEvent) => {
      const direction = keyToDirection[event.key];
      if (direction === undefined) return;
      service.transactions.queueHop(direction);
      event.preventDefault();
    };

    return presentation.render({
      lives: values?.lives ?? 3,
      score: values?.score ?? 0,
      status: values?.status ?? "playing",
      onKeyDown,
      onNewGame: service.transactions.startGame,
    });
  }
}
