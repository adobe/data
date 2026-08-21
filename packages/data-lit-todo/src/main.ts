// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html, render } from "lit";
import { Database, createVersionUpgrader } from "@adobe/data/ecs";
import { MainService } from "./features/main/services/main-service/main-service.js";
import { versions } from "./features/main/services/main-service/versioning/versions.js";
import { TodoApp } from "./features/main/ui/todo-app/todo-app.js";

// Spectrum 2 theme registration (side-effect imports).
import "@spectrum-web-components/theme/sp-theme.js";
import "@spectrum-web-components/theme/spectrum-two/theme-light.js";
import "@spectrum-web-components/theme/spectrum-two/scale-medium.js";

const app = document.getElementById("app");
if (app) {
  // Configured with the version upgrader: a document loaded via `service.fromData`
  // is migrated from its saved `db.version` (carried in the blob metadata) up to
  // the current schema.
  const service = Database.create(MainService.plugin, {
    versioning: createVersionUpgrader(versions),
  });

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
