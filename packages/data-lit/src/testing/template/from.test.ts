// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { html, nothing } from "lit";
import { Template } from "./template.js";

describe("Template.from", () => {
  it("collects static markup and interpolated primitives into text", () => {
    const q = Template.from(html`<sp-toast>${"Saved!"} (${3})</sp-toast>`);
    expect(q.has("<sp-toast")).toBe(true);
    expect(q.text).toContain("Saved!");
    expect(q.text).toContain("(3)");
  });

  it("exposes leaf binding values for identity checks (callbacks, nothing, booleans)", () => {
    const onClick = () => {};
    const q = Template.from(
      html`<sp-button @click=${onClick} ?disabled=${true}>${nothing}</sp-button>`,
    );
    expect(q.values).toContain(onClick);
    expect(q.values).toContain(true);
    expect(q.values).toContain(nothing);
  });

  it("finds interpolated child templates by fragment, recursively", () => {
    const label = "Undo";
    const q = Template.from(html`
      <div>${html`<section>${html`<sp-button>${label}</sp-button>`}</section>`}</div>
    `);
    const button = q.find("<sp-button");
    expect(button).toBeDefined();
    expect(button?.has("Undo")).toBe(true);
  });

  it("flattens values from nested templates and arrays", () => {
    const a = () => {};
    const b = () => {};
    const q = Template.from(html`<ul>${[html`<li @x=${a}></li>`, html`<li @x=${b}></li>`]}</ul>`);
    expect(q.values).toContain(a);
    expect(q.values).toContain(b);
    expect(q.children).toHaveLength(2);
  });

  it("throws when given something that is not a TemplateResult", () => {
    expect(() => Template.from(nothing)).toThrow(TypeError);
    expect(() => Template.from(undefined)).toThrow(TypeError);
  });
});
