// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createMemoryFile } from "./memory-file.js";
import { runRandomAccessFileConformance } from "./random-access-file.conformance.js";

runRandomAccessFileConformance("memory", () => createMemoryFile());
