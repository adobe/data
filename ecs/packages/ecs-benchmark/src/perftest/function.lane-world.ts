// © 2026 Adobe. MIT License. See /LICENSE for details.
import { World, workers } from "@adobe/ecs";
import type { Lane } from "./type.lane.js";

/** A new world for `lane`, its pool `threads` workers on the `threads` lane and none otherwise. */
export const laneWorld = (lane: Lane, threads: number): World => World.create({ [workers]: lane === "threads" ? threads : 0 });
