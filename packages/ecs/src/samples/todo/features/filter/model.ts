import { System } from "../../../../index.js";
import { filter, filterSchema } from "./data.js";

export const setFilter = System.create({
    name: "filter/set",
    input: { type: "object", properties: { filter: filterSchema } },
    resources: { write: [filter] },
}, ({ input, resources }) => {
    resources[filter] = input.filter;
});
