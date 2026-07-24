// © 2026 Adobe. MIT License. See /LICENSE for details.
import { customElement } from "lit/decorators.js";
import { useObservableValues, useState } from "@adobe/data-lit";
import { AssignElement } from "../assign-element.js";
import { styles } from "./users-tab.css.js";
import * as presentation from "./users-tab-presentation.js";

const tagName = "users-tab";

declare global {
  interface HTMLElementTagNameMap {
    [tagName]: UsersTabElement;
  }
}

@customElement(tagName)
export class UsersTabElement extends AssignElement {
  static styles = styles;

  render() {
    const [draftName, setDraftName] = useState("");
    const values = useObservableValues(
      () => ({ tasksByUser: this.service.computed.tasksByUser }),
      [],
    );

    const addUser = () => {
      const name = draftName.trim();
      if (name === "") return;
      this.service.transactions.addUser({ name });
      setDraftName("");
    };

    return presentation.render({
      draftName,
      setDraftName,
      addUser,
      users: values?.tasksByUser ?? [],
    });
  }
}
