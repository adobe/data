// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Service } from "../../service/service.js";

export interface PersistenceService extends Service {
    save(fileId?: string): Promise<void>;
    load(fileId?: string): Promise<void>;
}
