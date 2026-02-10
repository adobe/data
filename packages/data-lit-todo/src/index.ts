// © 2026 Adobe. MIT License. See /LICENSE for details.

export type { SampleMetadata, Sample } from "./sample-types.js";

import type { Sample } from "./sample-types.js";
import { todoSample } from "./todo-sample.js";
import "./todo-host.js"; // Ensure todo-host is registered

export const samples: readonly Sample[] = [todoSample];
