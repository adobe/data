// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html, render } from "lit";
import { Database } from "@adobe/data/ecs";
import { ActionDatabase } from "./features/main/ecs/action-database/action-database.js";
import { TodoApp } from "./features/main/ui/todo-app/todo-app.js";

// Spectrum 2 theme registration (side-effect imports).
import "@spectrum-web-components/theme/sp-theme.js";
import "@spectrum-web-components/theme/spectrum-two/theme-light.js";
import "@spectrum-web-components/theme/spectrum-two/scale-medium.js";

const app = document.getElementById("app");
if (app) {
  const service = Database.create(ActionDatabase.plugin);

  service.actions.createTodo({ name: "Buy groceries" });
  service.actions.createTodo({ name: "Pick up dry cleaning" });
  service.actions.createTodo({ name: "Water the plants", complete: true });

  render(
    html`
      <sp-theme system="spectrum-two" color="light" scale="medium">
        ${TodoApp({ service })}
      </sp-theme>
    `,
    app,
  );
}
