// © 2026 Adobe. MIT License. See /LICENSE for details.
import { checkChapters } from "ecs-guide-checks";

/** What each chapter teaches, which its prose names as code and its program does. */
const teaches: { readonly [chapter: number]: readonly string[] } = {
    1: ["Target.options", "Target.size", "Target.Options.default", "View.target", "View.viewport", "View.projection", "View.wgsl(1)"],
    2: ["Device.request()", "gpuDevice", "Surface.attach", "Surface.observe", "Frame.systems", "after: [Frame.update], before: [Frame.present]", "View.begin(encoder, view)", "View.states"],
};

/**
 * Changes to each chapter's program, each taking away a point it teaches, which its output catches: each its code as
 * written, once in the program, what takes its place, and the failure it then prints, where it's one.
 */
const mutations: { readonly [chapter: number]: readonly (readonly [string, string, string?])[] } = {
    1: [["[View.viewport]: [0.5, 0, 0.5, 1]", "[View.viewport]: [0, 0, 0.5, 1]"], ["sampleCount: 4 ", "sampleCount: 1 "], ["commands.despawn(screen);", ""], ["View.wgsl(1)", "View.wgsl(2)"]],
    2: [["for (let frames = 0; frames < 3; frames++) await world.run(frame);", ""]],
};

checkChapters({ folder: new URL(".", import.meta.url), teaches, mutations });
