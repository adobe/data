import type { WorkspaceDocument } from "./workspace-document/workspace-document.js";

export type SaveResult = {
  readonly document: WorkspaceDocument;
  readonly persisted: boolean;
};
