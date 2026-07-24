// © 2026 Adobe. MIT License. See /LICENSE for details.
import { customElement } from "lit/decorators.js";
import { useState } from "@adobe/data-lit";
import { TodoElement } from "../todo-element.js";
import { styles } from "./todo-app.css.js";
import * as presentation from "./todo-app-presentation.js";

const tagName = "todo-app";

declare global {
  interface HTMLElementTagNameMap {
    [tagName]: TodoAppElement;
  }
}

@customElement(tagName)
export class TodoAppElement extends TodoElement {
  static styles = styles;

  render() {
    const [tab, setTab] = useState<"todos" | "users">("todos");
    return presentation.render({ tab, setTab });
  }
}
