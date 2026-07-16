// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { ServiceDatabase } from "./service-database.js";
import * as actions from "./actions/index.js";

/**
 * The full negotiation database: state surface + the imperative `negotiation`
 * service + the UI-facing actions that drive it. Each action is a one-line
 * delegation, so a container element calls `service.actions.startHost()` and
 * never touches the full database.
 *
 * Static (not parameterised by game): the plugin — and so the service — is
 * built during `connectedCallback`, before a container's bound props exist,
 * so a container must supply the game-specific `NegotiationConfig` after mount
 * via `actions.configure(...)`.
 */
const negotiationDatabasePlugin = Database.Plugin.create({
  extends: ServiceDatabase.plugin,
  actions,
});

export type NegotiationDatabase = Database.Plugin.ToDatabase<
  typeof negotiationDatabasePlugin
>;

export namespace NegotiationDatabase {
  export const plugin = negotiationDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof negotiationDatabasePlugin>;
}
