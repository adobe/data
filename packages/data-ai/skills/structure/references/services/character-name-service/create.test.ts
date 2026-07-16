import { describe, expect, it } from "vitest";
import { CharacterNameService } from "./character-name-service.js";

describe("CharacterNameService.create", () => {
  it("generates deterministic fake names", async () => {
    const service = CharacterNameService.create();
    const input = { count: 2, style: "fantasy" as const, seed: 42 };

    expect(await service.generateNames(input)).toEqual([
      { value: "Dornthor", style: "fantasy" },
      { value: "Alddell", style: "fantasy" },
    ]);
  });

  it("streams generated names", async () => {
    const service = CharacterNameService.create();
    const names: CharacterNameService.GeneratedName[] = [];

    for await (const name of service.generateNameStream({
      count: 2,
      style: "sci-fi",
      seed: 7,
    })) {
      names.push(name);
    }

    expect(names).toEqual([
      { value: "Luma Flux", style: "sci-fi" },
      { value: "Vex IX", style: "sci-fi" },
    ]);
  });
});
