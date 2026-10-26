// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import type { WebgpuSupport } from "./elements/guide-note.js";
import { dark, proseWidth, stacked, webgpu } from "./data.js";

export const setDark = System.create({}, ({ resources }, input: { readonly dark: boolean }) => {
    resources[dark] = input.dark;
});

export const setStacked = System.create({}, ({ resources }, input: { readonly stacked: boolean }) => {
    resources[stacked] = input.stacked;
});

/** The prose's width as the reader dragged or keyed the splitter beside it. */
export const setProseWidth = System.create({}, ({ resources }, input: { readonly width: number }) => {
    resources[proseWidth] = input.width;
});

export const setWebgpu = System.create({}, ({ resources }, input: { readonly webgpu: WebgpuSupport }) => {
    resources[webgpu] = input.webgpu;
});
