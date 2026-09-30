// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Database } from "@adobe/data/ecs";
import type { Service } from "@adobe/data/service";
import type { Role } from "../../data/values/role/role.js";

/**
 * The game this negotiation connects peers into: the plugin the synced game
 * database is built from, and the sync `userId` each role plays as. Game-specific,
 * so negotiation has no implementation of its own: the app injects one with
 * `Database.create(plugin, { services: { game } })`.
 *
 * Not an async data service: it carries a plugin and a sync mapping, which are
 * configuration rather than Data.
 */
export interface GameService<P extends Database.Plugin = Database.Plugin> extends Service {
  readonly plugin: P;
  readonly assignUserId: (role: Role) => string;
}

export * as GameService from "./public.js";
