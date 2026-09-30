// © 2026 Adobe. MIT License. See /LICENSE for details.
import { customElement, property } from "lit/decorators.js";
import type { Entity } from "@adobe/data/ecs";
import { useObservableValues } from "@adobe/data-lit";
import { AssignElement } from "../assign-element.js";
import { styles } from "./assignee-chips.css.js";
import * as presentation from "./assignee-chips-presentation.js";

const tagName = "assignee-chips";

declare global {
  interface HTMLElementTagNameMap {
    [tagName]: AssigneeChipsElement;
  }
}

@customElement(tagName)
export class AssigneeChipsElement extends AssignElement {
  static styles = styles;

  @property({ type: Number })
  declare todo: Entity;

  render() {
    const values = useObservableValues(
      () => ({ todo: this.service.observe.entity(this.todo) }),
      [this.todo],
    );
    return presentation.render({ assignees: values?.todo?.assignees ?? [] });
  }
}
