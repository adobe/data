// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { drag } from "./internal/resource.drag.js";

/** Ends the selecting drag. */
export const releaseSelect: System = System.create({}, ({ resources }) => {
    if (resources[drag] !== null) resources[drag] = null;
});
