// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Service } from "../../service/index.js";

export interface PersistenceService extends Service {
    save(fileId?: string): Promise<void>;
    load(fileId?: string): Promise<void>;
}
