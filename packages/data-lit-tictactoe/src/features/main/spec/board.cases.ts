// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { board } from "./board.js";
import { marksOf } from "./marks-of.js";

export const cases: Conformance.SpecDerivations<typeof board> = {
  cases: [
    {
      name: "is blank with no marks",
      input: { marks: new Map() },
      value: "         ",
    },
    {
      name: "places each mark at its cell, whatever the entity order",
      input: {
        marks: new Map([
          [7, { mark: "O", cellIndex: 8 }],
          [3, { mark: "X", cellIndex: 0 }],
        ]),
      },
      value: "X       O",
    },
    {
      name: "draws a full board",
      input: { marks: marksOf("XOXXOOOXX") },
      value: "XOXXOOOXX",
    },
  ],
};
