// © 2026 Adobe. MIT License. See /LICENSE for details.
import { customElement } from "lit/decorators.js";
import { useObservableValues } from "@adobe/data-lit";
import { TodoElement } from "../../todo-element.js";
import { styles } from "./todo-list.css.js";
import * as presentation from "./todo-list-presentation.js";

const tagName = "todo-list";

declare global {
  interface HTMLElementTagNameMap {
    [tagName]: TodoListElement;
  }
}

@customElement(tagName)
export class TodoListElement extends TodoElement {
  static styles = styles;

  render() {
    const values = useObservableValues(
      () => ({ todos: this.service.computed.visibleTodos }),
      [],
    );

    return presentation.render({ todos: values?.todos ?? [] });
  }
}
