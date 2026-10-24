// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index } from "../../../../index.js";
import { done, todo } from "../todos/data.js";

/** Todos by whether they're done: its lists' lengths are the counts, kept as todos change. */
export const byDone = Index.create({ key: [done], components: { has: [todo] } });
