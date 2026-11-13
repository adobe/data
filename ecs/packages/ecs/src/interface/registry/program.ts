// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { SyncSystem } from '../system/sync-system.js';
import type { Derivation } from '../component/derivation.js';
import type { Definition } from '../system/definition.js';
import { recordItem, registeredAs } from './items.js';
import { sameDeclaration } from './names.js';

/** What a System constructor or `Component.derive` recorded. */
export type Item = Definition | Derivation | SyncSystem;

/**
 * Records a system under the id the plugin gave its declaration. Declared again under that id the same, as a module
 * evaluated again declares it, it's a new value of the same system. Throws for that id with another kind or declaration.
 */
export const claimSystem = (system: Definition, id: string | undefined): void => {
    recordItem(system, id, registeredAs(system, id, sameDeclaration));
};

/**
 * Records a changes or removed system under the id the plugin gave its declaration, and returns it; declared again
 * under that id the same, as a module evaluated again declares it, it's the one already recorded, with the new body,
 * which worlds it's added to run from then on. Throws for that id with another kind or declaration.
 */
export const claimSyncSystem = (syncSystem: SyncSystem, id: string | undefined): SyncSystem => {
    const registered = registeredAs(syncSystem, id, sameDeclaration);
    const existing = registered === undefined ? undefined : syncSystemOf(registered);
    if (existing !== undefined) {
        existing.body = syncSystem.body;
        return existing;
    }
    recordItem(syncSystem, id, undefined);
    return syncSystem;
};

/** Only `System.changes` and `System.removed` make values with a sync system's kind and a declaration. */
const isSyncSystem = (value: object): value is SyncSystem =>
    "declaration" in value && "body" in value && "kind" in value && (value.kind === "removed" || value.kind === "changes");

/** A changes or removed system's internals: the value `System.changes` or `System.removed` returned, or undefined for any other value. */
export const syncSystemOf = (value: object): SyncSystem | undefined => isSyncSystem(value) ? value : undefined;

/** Only constructors make values with a system's kind and a declaration. */
const isDefinition = (system: object): system is Definition =>
    "declaration" in system && "kind" in system && (system.kind === "system" || system.kind === "render" || system.kind === "composite");

/** A system's definition: the value a System constructor returned, or undefined for any other value. */
export const definitionOf = (system: { readonly name: string }): Definition | undefined => isDefinition(system) ? system : undefined;

/** A system's definition. Throws for a value no constructor returned, and for a changes or removed system. */
export const requireDefinition = (system: { readonly name: string }): Definition => {
    const definition = definitionOf(system);
    if (definition !== undefined) return definition;
    if (syncSystemOf(system) !== undefined) throw new Error(`"${String(system.name)}" is a changes or removed system, which runs in sync points while it's added; add it to the world rather than run it.`);
    throw new Error(`"${String(system.name)}" isn't a system a System constructor returned.`);
};

export { programDerivations, programVersion } from './derivations.js';

/**
 * A composite's members that run in tiers or after sync points, in order: changes and removed systems left out. Throws
 * for a member no constructor returned.
 */
export const membersOf = (composite: Definition): Definition[] => {
    if (composite.kind !== "composite") return [];
    const members: Definition[] = [];
    for (const member of composite.declaration.systems) if (syncSystemOf(member) === undefined) members.push(requireDefinition(member));
    return members;
};

/** The changes and removed systems a system holds, each once, in the order its members list them. */
export const syncSystemsOf = (system: { readonly name: string }, found: SyncSystem[] = []): SyncSystem[] => {
    const syncSystem = syncSystemOf(system);
    if (syncSystem !== undefined) {
        if (!found.includes(syncSystem)) found.push(syncSystem);
        return found;
    }
    const definition = definitionOf(system);
    if (definition?.kind === "composite") for (const member of definition.declaration.systems) syncSystemsOf(member, found);
    return found;
};
