// © 2026 Adobe. MIT License. See /LICENSE for details.
import { customElement, property } from "lit/decorators.js";
import type { Entity } from "@adobe/data/ecs";
import { useObservableValues } from "@adobe/data-lit";
import { AssignElement } from "../assign-element.js";
import { styles } from "./assignee-dropdown.css.js";
import * as presentation from "./assignee-dropdown-presentation.js";

const tagName = "assignee-dropdown";

declare global {
  interface HTMLElementTagNameMap {
    [tagName]: AssigneeDropdownElement;
  }
}

@customElement(tagName)
export class AssigneeDropdownElement extends AssignElement {
  static styles = styles;

  @property({ type: Number })
  declare todo: Entity;

  render() {
    const values = useObservableValues(
      () => ({
        users: this.service.computed.users,
        todo: this.service.observe.entity(this.todo),
      }),
      [this.todo],
    );

    const assigned = new Set(values?.todo?.assignees ?? []);
    return presentation.render({
      users: (values?.users ?? []).map((u) => ({
        name: u.name,
        assigned: assigned.has(u.name),
      })),
      toggleAssignee: (name: string) =>
        assigned.has(name)
          ? this.service.transactions.unassignUser({ todo: this.todo, name })
          : this.service.transactions.assignUser({ todo: this.todo, name }),
    });
  }
}
