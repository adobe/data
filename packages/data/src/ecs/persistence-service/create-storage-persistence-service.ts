// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Data } from "../../data.js";
import { deserializeFromStorage, serializeToStorage } from "../../functions/serialization/serialize-to-storage.js";
import { Database } from "../index.js";
import { PersistenceService } from "./persistence-service.js";

export const createStoragePersistenceService = async (options: {
    database: Database<any, any, any, any>,
    defaultFileId: string,
    autoSaveOnChange: boolean,
    autoLoadOnStart: boolean,
    storage?: Storage
}): Promise<PersistenceService> => {
    const { database, defaultFileId, autoSaveOnChange: autoSave, autoLoadOnStart, storage = sessionStorage } = options;
    const service: PersistenceService = {
        serviceName: "SessionPersistenceService",
        save: async (fileId = defaultFileId) => {
            await serializeToStorage(database.toData(), fileId, storage);
        },
        load: async (fileId = defaultFileId) => {
            const data = await deserializeFromStorage(fileId, storage);
            if (data) {
                database.fromData(data);
            }
        }
    }
    if (autoLoadOnStart) {
        await service.load();
    }
    if (autoSave) {
        database.observe.transactions(t => {
            if (!t.transient) {
                service.save();
            }
        })
    }
    return service;
};
