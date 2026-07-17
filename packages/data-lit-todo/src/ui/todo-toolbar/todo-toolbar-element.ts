// © 2026 Adobe. MIT License. See /LICENSE for details.
import { customElement } from "lit/decorators.js";
import { useObservableValues, useState } from "@adobe/data-lit";
import { TodoElement } from "../todo-element.js";
import { styles } from "./todo-toolbar.css.js";
import * as presentation from "./todo-toolbar-presentation.js";

const tagName = "todo-toolbar";

declare global {
  interface HTMLElementTagNameMap {
    [tagName]: TodoToolbarElement;
  }
}

@customElement(tagName)
export class TodoToolbarElement extends TodoElement {
  static styles = styles;

  render() {
    const [draftName, setDraftName] = useState("");
    const values = useObservableValues(
      () => ({
        allTodos: this.service.computed.allTodos,
        completeTodos: this.service.computed.completeTodos,
        displayCompleted: this.service.observe.resources.displayCompleted,
      }),
      [],
    );

    const addTodo = () => {
      const name = draftName.trim();
      if (name === "") return;
      this.service.actions.createTodo({ name });
      setDraftName("");
    };

    return presentation.render({
      draftName,
      totalCount: values?.allTodos.length ?? 0,
      completedCount: values?.completeTodos.length ?? 0,
      displayCompleted: values?.displayCompleted ?? false,
      setDraftName,
      addTodo,
      addRandomTodo: () => this.service.actions.addRandomTodo(),
      addBulkTodos: (count) => this.service.actions.createBulkTodos({ count }),
      toggleDisplayCompleted: () => this.service.actions.toggleDisplayCompleted(),
      clearAll: () => this.service.actions.deleteAllTodos(),
    });
  }
}
