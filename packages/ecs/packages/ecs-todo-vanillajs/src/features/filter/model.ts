// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { filter, type Filter } from "./data.js";

export const setFilter = System.create({}, ({ resources }, input: { readonly filter: Filter }) => {
    resources[filter] = input.filter;
});
