// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "../../../../index.js";
import { filter, type Filter } from "./data.js";

export const setFilter = System.create({
    resources: { write: [filter] },
}, ({ resources }, input: { readonly filter: Filter }) => {
    resources[filter] = input.filter;
});
