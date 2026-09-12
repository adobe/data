// © 2026 Adobe. MIT License. See /LICENSE for details.
import { customElement, property } from "lit/decorators.js";
import type { Entity } from "@adobe/data/ecs";
import { useObservableValues, useState, useDragGenerator } from "@adobe/data-lit";
import { TodoElement } from "../todo-element.js";
import { styles } from "./todo-row.css.js";
import { TODO_ROW_HEIGHT } from "./todo-row.constants.js";
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
    // Local UI state: whether the (lazily-loaded) assignee editor is open. The
    // assign feature's code + service database load only when this first flips.
    const [editing, setEditing] = useState(false);
    const values = useObservableValues(
      () => ({ todo: this.service.observe.entity(this.entity) }),
      [this.entity],
    );
    const todo = values?.todo;

    // Dragging is a lifecycle/pointer concern, so the pointer stream is
    // captured here — but mapping it into transaction args is logic, and
    // belongs to the `dragTodo` action, not this element (`element.md`: no
    // shape-building in a callback). `useDragGenerator` hands the action a
    // raw `DragState` generator; the action drives the `dragTodo` transaction
    // with it directly, so the whole gesture — every live frame plus the
    // final drop — commits as one coalesced, undoable step.
    const { entity, index } = this;
    useDragGenerator(
      {},
      [this.service.actions.dragTodo, entity, index],
      (drag) =>
        this.service.actions.dragTodo({
          entity,
          index,
          rowHeight: TODO_ROW_HEIGHT,
          drag,
        }),
    );

    return presentation.render({
      ready: todo?.name !== undefined,
      name: todo?.name ?? "",
      complete: todo?.complete ?? false,
      dragPosition: todo?.dragPosition ?? null,
      assignees: todo?.assignees ?? [],
      editing,
      toggleEditing: () => setEditing(!editing),
      index: this.index,
      entity: this.entity,
      toggleComplete: () => this.service.actions.toggleComplete({ id: this.entity }),
      deleteTodo: () => this.service.actions.deleteTodo({ id: this.entity }),
    });
  }
}
