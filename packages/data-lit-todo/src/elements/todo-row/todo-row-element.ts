// © 2026 Adobe. MIT License. See /LICENSE for details.
import { customElement, property } from "lit/decorators.js";
import type { Entity } from "@adobe/data/ecs";
import { useObservableValues } from "@adobe/data-lit";
import { TodoElement } from "../../todo-element.js";
import { styles } from "./todo-row.css.js";
import * as presentation from "./todo-row-presentation.js";

const tagName = "todo-row";

declare global {
  interface HTMLElementTagNameMap {
    [tagName]: TodoRowElement;
  }
}

@customElement(tagName)
export class TodoRowElement extends TodoElement {
  static styles = styles;

  @property({ type: Number })
  declare entity: Entity;

  @property({ type: Number })
  declare index: number;

  render() {
    const values = useObservableValues(
      () => ({ todo: this.service.observe.entity(this.entity) }),
      [this.entity],
    );
    const todo = values?.todo;

    return presentation.render({
      ready: todo?.name !== undefined,
      name: todo?.name ?? "",
      complete: todo?.complete ?? false,
      dragPosition: todo?.dragPosition ?? null,
      index: this.index,
      entity: this.entity,
      dragTodo: this.service.transactions.dragTodo,
      toggleComplete: () => this.service.transactions.toggleComplete(this.entity),
      deleteTodo: () => this.service.transactions.deleteTodo(this.entity),
    });
  }
}
