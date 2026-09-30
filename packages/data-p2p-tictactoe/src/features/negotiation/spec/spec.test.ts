// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { spec } from "./spec.js";

// Runs every case against the pure spec functions — no ECS involved.
Conformance.checkSpec(spec);
