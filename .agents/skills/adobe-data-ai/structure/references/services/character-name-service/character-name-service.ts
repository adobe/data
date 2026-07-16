import { Assert } from "@adobe/data/types";
import { AsyncDataService, Service } from "@adobe/data/service";
import type { GenerateNamesInput } from "./generate-names-input.js";
import type { GeneratedName } from "./generated-name.js";

export interface CharacterNameService extends Service {
  generateNames: (input: GenerateNamesInput) => Promise<readonly GeneratedName[]>;
  generateNameStream: (input: GenerateNamesInput) => AsyncGenerator<GeneratedName>;
}

type _CheckCharacterNameService = Assert<AsyncDataService.IsValid<CharacterNameService>>;

export * as CharacterNameService from "./public.js";
