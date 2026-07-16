import type { WorkspacePersistenceService } from "./workspace-persistence-service.js";
import type { WorkspaceDocument } from "./workspace-document/workspace-document.js";

const serialize = (document: WorkspaceDocument): string => JSON.stringify(document);

const deserialize = (value: string): WorkspaceDocument | null => {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "id" in parsed &&
      "title" in parsed &&
      "updatedAt" in parsed &&
      typeof parsed.id === "string" &&
      typeof parsed.title === "string" &&
      typeof parsed.updatedAt === "string"
    ) {
      return {
        id: parsed.id,
        title: parsed.title,
        updatedAt: parsed.updatedAt,
      };
    }
  } catch {
    return null;
  }
  return null;
};

export const create = (args: {
  readonly storage?: Record<string, string>;
} = {}): WorkspacePersistenceService => {
  const storage = args.storage ?? {};
  const memory = new Map<string, WorkspaceDocument>();
  let current: WorkspaceDocument | null = null;
  let subscribers: Array<(value: WorkspaceDocument | null) => void> = [];

  const notify = (value: WorkspaceDocument | null): void => {
    current = value;
    for (const subscriber of subscribers) {
      subscriber(value);
    }
  };

  return {
    currentDocument: (observer) => {
      observer(current);
      subscribers.push(observer);
      return () => {
        subscribers = subscribers.filter((subscriber) => subscriber !== observer);
      };
    },
    load: async (id) => {
      const cached = memory.get(id);
      if (cached) {
        notify(cached);
        return cached;
      }
      const stored = storage[id];
      if (!stored) {
        return null;
      }
      const document = deserialize(stored);
      if (document) {
        memory.set(id, document);
        notify(document);
      }
      return document;
    },
    save: async (document) => {
      const saved = {
        ...document,
        updatedAt: new Date(0).toISOString(),
      };
      memory.set(saved.id, saved);
      notify(saved);
      return { document: saved, persisted: false };
    },
    persist: async () => {
      if (!current) {
        return;
      }
      storage[current.id] = serialize(current);
    },
  };
};
