// © 2026 Adobe. MIT License. See /LICENSE for details.

import { deserializeFromStorage, serializeToStorage } from "../../functions/serialization/serialize-to-storage.js";
import { debounce } from "../../internal/function/debounce.js";
import { Database, Entity } from "../index.js";
import { PersistenceScope } from "../persistence-scope.js";
import { PersistenceService } from "./persistence-service.js";

export const createStoragePersistenceService = async (options: {
    database: Database<any, any, any, any>,
    defaultFileId: string,
    autoSaveOnChange: boolean,
    autoLoadOnStart: boolean,
    storage?: Storage,
    /**
     * Restrict this service to specific persistent quadrant(s) — e.g.
     * `{ nonShared: true }` for a settings-only service. Omit to own the whole
     * persistent snapshot (both document and settings). The same scope is used
     * for both save and load.
     */
    scope?: PersistenceScope,
}): Promise<PersistenceService> => {
    const { database, defaultFileId, autoSaveOnChange: autoSave, autoLoadOnStart, storage = sessionStorage, scope } = options;
    const service: PersistenceService = {
        serviceName: "SessionPersistenceService",
        save: async (fileId = defaultFileId) => {
            await serializeToStorage(database.toData({ scope }), fileId, storage);
        },
        load: async (fileId = defaultFileId) => {
            const data = await deserializeFromStorage(fileId, storage);
            if (data) {
                database.fromData(data, scope);
            }
        }
    }
    if (autoLoadOnStart) {
        await service.load();
    }
    if (autoSave) {
        // Whether an entity falls within this service's scope. Unscoped ⇒ any
        // persistent entity; scoped ⇒ only the persistent quadrant(s) it owns.
        const entityInScope = (entity: number): boolean => {
            if (!Entity.isPersistent(entity)) return false;
            if (scope === undefined) return true;
            return Boolean((scope.shared && Entity.isShared(entity)) || (scope.nonShared && Entity.isNonShared(entity)));
        };
        const debouncedSave = debounce(() => service.save(), 300);
        database.observe.transactions(t => {
            if (t.intermediate || !t.persistent) return;
            for (const entity of t.changedEntities.keys()) {
                if (entityInScope(entity)) { debouncedSave(); return; }
            }
        });
    }
    return service;
};
