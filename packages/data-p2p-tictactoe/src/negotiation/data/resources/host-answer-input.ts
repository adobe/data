// © 2026 Adobe. MIT License. See /LICENSE for details.

// Live value of the host's "paste answer" textarea. Backing it with a resource
// keeps the textarea controlled and avoids touching the DOM from actions.
export const hostAnswerInput = { default: "" as string, ephemeral: true };
