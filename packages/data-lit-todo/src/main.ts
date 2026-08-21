// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html, render } from "lit";
import { Database, createVersionUpgrader, createStoragePersistenceService } from "@adobe/data/ecs";
import { MainService } from "./features/main/services/main-service/main-service.js";
import { versions } from "./features/main/services/main-service/versioning/versions.js";
import { TodoApp } from "./features/main/ui/todo-app/todo-app.js";

// Spectrum 2 theme registration (side-effect imports).
import "@spectrum-web-components/theme/sp-theme.js";
import "@spectrum-web-components/theme/spectrum-two/theme-light.js";
import "@spectrum-web-components/theme/spectrum-two/scale-medium.js";

const app = document.getElementById("app");
if (app) {
  // Configured with the version upgrader: each persisted quadrant is migrated from
  // its saved `db.version` (carried in the blob metadata) up to the current schema.
  const service = Database.create(MainService.plugin, {
    versioning: createVersionUpgrader(versions),
  });

  // Split persistence: the DOCUMENT quadrant (the todos, shared) and the SETTINGS
  // quadrant (`displayCompleted`, per-device) are saved to — and loaded from — two
  // SEPARATE locations, each its own independently pluggable mechanism. Here both
  // use `localStorage` under distinct keys; swap `storage` for any Storage-shaped
  // backend (a cloud-backed document store, a per-device settings store, …). Each
  // service auto-loads on start and auto-saves (debounced) only the entities in its
  // own quadrant, and each blob carries + upgrades its own quadrant's version.
  void (async () => {
    await createStoragePersistenceService({
      database: service,
      scope: { shared: true }, // document quadrant → the todos
      storage: localStorage,
      defaultFileId: "data-lit-todo/document",
      autoSaveOnChange: true,
      autoLoadOnStart: true,
    });
    await createStoragePersistenceService({
      database: service,
      scope: { nonShared: true }, // settings quadrant → displayCompleted
      storage: localStorage,
      defaultFileId: "data-lit-todo/settings",
      autoSaveOnChange: true,
      autoLoadOnStart: true,
    });

    // Seed example todos only on a first run (nothing loaded from the document store).
    if (service.select(["todo"]).length === 0) {
      service.actions.createTodo({ name: "Buy groceries" });
      service.actions.createTodo({ name: "Pick up dry cleaning" });
      service.actions.createTodo({ name: "Water the plants", complete: true });
    }

    render(
      html`
        <sp-theme system="spectrum-two" color="light" scale="medium">
          ${TodoApp({ service })}
        </sp-theme>
      `,
      app,
    );
  })();
}
