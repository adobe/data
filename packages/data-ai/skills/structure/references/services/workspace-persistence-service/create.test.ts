import { describe, expect, it } from "vitest";
import { WorkspacePersistenceService } from "./workspace-persistence-service.js";

describe("WorkspacePersistenceService.create", () => {
  it("loads, saves, and persists a workspace document", async () => {
    const storage: Record<string, string> = {};
    const service = WorkspacePersistenceService.create({ storage });

    const document: WorkspacePersistenceService.WorkspaceDocument = {
      id: "ws-1",
      title: "Draft",
      updatedAt: "1970-01-01T00:00:00.000Z",
    };

    expect(await service.load("ws-1")).toBeNull();

    const saved = await service.save(document);
    expect(saved.document.title).toBe("Draft");
    expect(saved.persisted).toBe(false);

    await service.persist();
    expect(storage["ws-1"]).toContain("Draft");

    const reloaded = WorkspacePersistenceService.create({ storage });
    expect(await reloaded.load("ws-1")).toEqual(saved.document);
  });
});
