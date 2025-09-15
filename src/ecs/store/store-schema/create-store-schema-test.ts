/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/

import { Assert } from "../../../types/assert.js";
import { Equal } from "../../../types/equal.js";
import { StringKeyof } from "../../../types/types.js";
import { ComponentSchemas } from "../../component-schemas.js";
import { Archetype, CoreComponents } from "../../index.js";
import { ResourceSchemas } from "../../resource-schemas.js";
import { ArchetypeComponents } from "../archetype-components.js";
import { StoreFromSchema } from "./store-schema.js";
import { createStoreSchema } from "./create-store-schema.js";

const storeSchema = createStoreSchema(
    {
        velocity: { type: "number" },
        particle: { type: "boolean" },
    },
    {
        mousePosition: { type: "number", default: 0 },
        fooPosition: { type: "number", default: 0 },
    },
    {
        Particle: ["particle"],
        DynamicParticle: ["particle", "velocity"],
    }
)

type TestStore = StoreFromSchema<typeof storeSchema>;
type CheckParticle = Assert<Equal<TestStore["archetypes"]["Particle"], Archetype<CoreComponents & {
    particle: boolean;
}>>>;
type CheckDynamicParticle = Assert<Equal<TestStore["archetypes"]["DynamicParticle"], Archetype<CoreComponents & {
    particle: boolean;
    velocity: number;
}>>>;
