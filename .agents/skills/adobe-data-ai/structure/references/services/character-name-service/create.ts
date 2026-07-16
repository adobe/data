import { fakeGenerateNameStream, fakeGenerateNames } from "./fake-generate-names.js";
import type { CharacterNameService } from "./character-name-service.js";

export const create = (): CharacterNameService => ({
  generateNames: async (input) => fakeGenerateNames(input),
  generateNameStream: (input) => fakeGenerateNameStream(input),
});
