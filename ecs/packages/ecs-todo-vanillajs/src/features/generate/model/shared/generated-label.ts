// © 2026 Adobe. MIT License. See /LICENSE for details.

const tasks = ["Buy milk", "Call the plumber", "Fix the bike", "Read a novel", "Write a letter", "Plan the trip", "Clean the kitchen", "Book a table"];

/** The label of the `n`th generated todo. */
export const generatedLabel = (n: number): string => `${tasks[n % tasks.length]} #${n + 1}`;
