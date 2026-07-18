// © 2026 Adobe. MIT License. See /LICENSE for details.
import { customElement, property } from "lit/decorators.js";
import type { Entity } from "@adobe/data/ecs";
import { useObservableValues, useState, useDragTransaction } from "@adobe/data-lit";
import { TodoElement } from "../todo-element.js";
import { styles } from "./todo-row.css.js";
import { TODO_ROW_HEIGHT } from "./todo-row.constants.js";
import type { dragTodo } from "../../ecs/transactions/drag-todo.js";
import * as presentation from "./todo-row-presentation.js";

// The transaction owns this shape and doesn't export it; infer it from the
// function's second parameter rather than importing a type.
type DragTodoInput = Parameters<typeof dragTodo>[1];

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

    // Dragging is a lifecycle/pointer concern, so it lives in the element (not
    // the pure presentation). A single coalesced transaction spans the whole
    // gesture: `move` frames record the live pixel offset, `end` commits the
    // reorder. Drag is a continuous manipulation, so it calls the transaction
    // directly rather than an analytics-wrapped action.
    const { entity, index } = this;
    useDragTransaction<DragTodoInput>(
      {
        transaction: this.service.transactions.dragTodo,
        update: (value) => {
          if (value.type === "move") {
            return { entity, dragPosition: value.delta[1] };
          }
          if (value.type === "end") {
            return {
              entity,
              dragPosition: value.delta[1],
              finalIndex: index + Math.round(value.delta[1] / TODO_ROW_HEIGHT),
            };
          }
        },
      },
      [this.service.transactions.dragTodo, entity, index],
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
      toggleComplete: () => this.service.actions.toggleComplete(this.entity),
      deleteTodo: () => this.service.actions.deleteTodo(this.entity),
    });
  }
}
