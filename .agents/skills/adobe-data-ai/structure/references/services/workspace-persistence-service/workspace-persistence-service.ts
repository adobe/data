import { Assert } from "@adobe/data/types";
import { AsyncDataService, Service } from "@adobe/data/service";
import { Observe } from "@adobe/data/observe";
import type { SaveResult } from "./save-result.js";
import type { WorkspaceDocument } from "./workspace-document/workspace-document.js";

export interface WorkspacePersistenceService extends Service {
  currentDocument: Observe<WorkspaceDocument | null>;
  load: (id: string) => Promise<WorkspaceDocument | null>;
  save: (document: WorkspaceDocument) => Promise<SaveResult>;
  persist: () => Promise<void>;
}

type _CheckWorkspacePersistenceService = Assert<AsyncDataService.IsValid<WorkspacePersistenceService>>;

export * as WorkspacePersistenceService from "./public.js";
