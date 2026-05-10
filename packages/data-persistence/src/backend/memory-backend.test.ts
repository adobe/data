// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createMemoryBackend } from "./memory-backend.js";
import { runPersistenceBackendConformance } from "./persistence-backend.conformance.js";

runPersistenceBackendConformance("memory", async () => ({
    backend: createMemoryBackend(),
}));
