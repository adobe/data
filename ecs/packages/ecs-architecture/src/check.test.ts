// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from 'vitest';
import { check } from './check.js';

type Files = Readonly<Record<string, string>>;

const readme = (name: string): string => `# ${name}\n\nA summary.\n`;
const systemsOf = (list = '', imports = ''): string =>
    `import type { System } from '@adobe/ecs';\n${imports}\nexport const systems: readonly System[] = [${list}];\n`;

/** A small app that follows every rule: a feature with a model, a view and elements, and a sample using them. */
const valid = () => ({
    'CLAUDE.md': '# src\n',
    'thing/model/README.md': readme('model'),
    'thing/model/index.ts': "export * from './component.thing.js';\nexport * from './constant.systems.js';\n",
    'thing/model/component.thing.ts':
        "/** A thing. */\nexport const thing = Symbol();\n\ndeclare module '@adobe/ecs' {\n    interface Components {\n        [thing]: { type: true };\n    }\n}\n",
    'thing/model/constant.systems.ts': systemsOf(),
    'thing/elements/README.md': readme('elements'),
    'thing/elements/index.ts': "export * from './element.thing-card.js';\n",
    'thing/elements/element.thing-card.ts': '/** The card. */\nexport const thingCard = (): string => "card";\n',
    'thing/view/README.md': readme('view'),
    'thing/view/index.ts': "export * from './constant.systems.js';\nexport * from './function.show-thing.js';\n",
    'thing/view/constant.systems.ts': systemsOf(),
    'thing/view/function.show-thing.ts':
        "import { thing } from '../model/index.js';\nimport { thingCard } from '../elements/index.js';\n\n/** Shows a thing. */\nexport const showThing = (): unknown => [thing, thingCard()];\n",
    'samples/app.ts': "import { showThing } from '../thing/view/index.js';\nimport { thingCard } from '../thing/elements/index.js';\nexport const app = [showThing, thingCard];\n",
});

const rules = async (files: Files): Promise<string[]> => (await check(files)).map(violation => violation.rule);
const without = (files: Files, ...paths: string[]): Files => Object.fromEntries(Object.entries(files).filter(([p]) => !paths.includes(p)));
/** A part component of thing/model, with the given root file. */
const part = (name: string, rootFile: string, source: string, extraIndex = ''): Files => ({
    [`thing/model/${name}/README.md`]: readme(name),
    [`thing/model/${name}/index.ts`]: `export * from './${rootFile}.js';\n${extraIndex}`,
    [`thing/model/${name}/${rootFile}.ts`]: source,
});

describe('the standard, followed', () => {
    it('a feature with a model, elements and a view has no violations', async () => {
        expect(await check(valid())).toEqual([]);
    });

    it('a view and a port may import the model, a view the elements, and a layer its own parts', async () => {
        const files = {
            ...valid(),
            ...part('inside', 'component.inside', "/** Inside. */\nexport const inside = Symbol();\n"),
            'thing/model/constant.systems.ts': systemsOf(),
            'thing/model/component.thing.ts': valid()['thing/model/component.thing.ts'].replace('Symbol();', "Symbol(); void inside;").replace('/** A thing. */', "import { inside } from './inside/index.js';\n/** A thing. */"),
            'thing/ports/README.md': readme('ports'),
            'thing/ports/index.ts': "export * from './function.connect-thing.js';\n",
            'thing/ports/function.connect-thing.ts': "import { thing } from '../model/index.js';\n\n/** Connects. */\nexport const connectThing = (): unknown => thing;\n",
            'samples/app.ts': valid()['samples/app.ts'] + "import { connectThing } from '../thing/ports/index.js';\nexport const port = connectThing;\n",
        };
        expect(await rules(files)).toEqual([]);
    });
});

describe('layout', () => {
    it('rejects a stray file in the root of src', async () => {
        expect(await rules({ ...valid(), 'stray.ts': 'export {};\n' })).toContain('src-root-files');
    });

    it('rejects src/index.ts that is more than re-exports', async () => {
        expect(await rules({ ...valid(), 'index.ts': "export * from './samples/app.js';\nconsole.log('start');\n" })).toContain('index-is-only-re-exports');
        expect(await rules({ ...valid(), 'index.ts': "export * from './samples/app.js';\n" })).toEqual([]);
    });

    it('rejects a top-level component that is not a layer', async () => {
        expect((await rules({ ...valid(), 'camera/README.md': readme('camera'), 'camera/index.ts': 'export {};\n' })).filter(r => r === 'layer-name')).toHaveLength(1);
    });

    it('allows an ARCHITECTURE.md beside a feature\'s layers and in the root of src', async () => {
        expect(await rules({ ...valid(), 'ARCHITECTURE.md': '# Architecture\n', 'thing/ARCHITECTURE.md': '# thing\n' })).toEqual([]);
    });

    it('rejects a file in a feature or a group', async () => {
        expect(await rules({ ...valid(), 'thing/stray.ts': 'export {};\n' })).toContain('folder-holds-only-folders');
    });

    it('rejects a layer folder with no index.ts', async () => {
        expect(await rules({ ...valid(), 'other/view/function.show.ts': 'export {};\n' })).toContain('layer-needs-index');
    });

    it('rejects a root file named wrongly or exporting something else', async () => {
        expect(await rules({ ...valid(), 'thing/model/helper.ts': 'export const x = 1;\n' })).toContain('file-name');
        expect(await rules({ ...valid(), 'thing/model/component.thing.ts': valid()['thing/model/component.thing.ts'].replace('const thing', 'const other') })).toContain('file-exports-its-name');
    });

    it('rejects an index that skips a root file or exports anything else', async () => {
        expect(await rules({ ...valid(), 'thing/model/index.ts': "export * from './constant.systems.js';\n" })).toContain('index-exports-root-files');
        expect(await rules({ ...valid(), 'thing/model/index.ts': valid()['thing/model/index.ts'] + 'export const x = 1;\n' })).toContain('index-is-only-re-exports');
    });

    it('rejects a layer with no README, or a README with no summary, but does not ask a part for one', async () => {
        expect(await rules(without(valid(), 'thing/model/README.md'))).toContain('readme');
        const inside = part('inside', 'component.inside', '/** Inside. */\nexport const inside = Symbol();\n');
        const files = {
            ...valid(), ...without(inside, 'thing/model/inside/README.md'),
            'thing/model/component.thing.ts': "import { inside } from './inside/index.js';\n" + valid()['thing/model/component.thing.ts'].replace('Symbol();', 'Symbol(); void inside;'),
        };
        expect(await rules(files)).toEqual([]);
        expect(await rules({ ...valid(), 'thing/model/README.md': '# model\nno blank line\n' })).toContain('readme');
    });
});

describe('root files: the export first, in any size', () => {
    const body = (lines: number): string => Array.from({ length: lines }, (_, i) => `    run(${i});`).join('\n');
    const withFunction = (source: string, extra: Files = {}): Files => ({
        ...valid(),
        'thing/model/index.ts': valid()['thing/model/index.ts'] + "export * from './function.do-it.js';\n",
        'thing/model/function.do-it.ts': source,
        'samples/app.ts': valid()['samples/app.ts'] + "import { doIt } from '../thing/model/index.js';\nexport const used = doIt;\n",
        ...extra,
    });

    it('accepts a long implementation in the root file, with its private helpers beneath the export', async () => {
        expect(await rules(withFunction(`/** Does it. */\nexport const doIt = (): void => {\n${body(60)}\n};\n`))).toEqual([]);
        expect(await rules(withFunction('/** Does it. */\nexport const doIt = (): number => helper;\n\nconst helper = 1;\n'))).toEqual([]);
    });

    it('allows a declaration above the export only when the export uses it, and rejects one it does not', async () => {
        expect(await rules(withFunction('const helper = 1;\n\n/** Does it. */\nexport const doIt = (): number => helper;\n'))).toEqual([]);
        expect(await rules(withFunction('const helper = 1;\nconst unrelated = 2;\n\n/** Does it. */\nexport const doIt = (): number => helper;\n'))).toContain('export-first');
        expect(await rules(withFunction("import { thing } from './component.thing.js';\n/** Does it. */\nexport const doIt = (): unknown => thing;\n"))).toEqual([]);
    });

    it('accepts a re-export of an implementation in a folder, for what cannot sit beneath its export', async () => {
        const files = withFunction(
            "import { doIt as implementation } from './function.do-it/function.do-it.js';\n\n/** Does it. */\nexport const doIt: () => void = implementation;\n",
            { 'thing/model/function.do-it/function.do-it.ts': 'const first = 1;\nexport const doIt = (): number => first;\n' },
        );
        expect(await rules(files)).toEqual([]);
    });
});

describe('one export per file, and tests named for what they test', () => {
    const withShared = (path: string, source: string): Files => ({
        ...valid(),
        'thing/view/function.show-thing.ts': `import { shown } from './shared/${path.replace(/\.ts$/, '.js')}';\n${valid()['thing/view/function.show-thing.ts'].replace('thingCard()]', 'thingCard(), shown]')}`,
        [`thing/view/shared/${path}`]: source,
    });

    it('holds a file in a private folder to one export, first, the file named for it', async () => {
        expect(await rules(withShared('constant.shown.ts', '/** Shown. */\nexport const shown = 1;\n'))).toEqual([]);
        expect(await rules(withShared('shown.ts', '/** Shown. */\nexport const shown = 1;\n'))).toContain('file-name');
        expect(await rules(withShared('constant.shown.ts', '/** Shown. */\nexport const shown = 1;\nexport type Shown = number;\n'))).toContain('file-exports-its-name');
        expect(await rules(withShared('constant.shown.ts', 'const unrelated = 2;\n\n/** Shown. */\nexport const shown = 1;\n'))).toContain('export-first');
    });

    it('lets a private file that exports nothing, or a file of an app, be named for what it does', async () => {
        expect(await rules({ ...valid(), 'thing/view/shared/setup.ts': 'void 0;\n' })).toEqual([]);
        expect(await rules({ ...valid(), 'samples/app.ts': valid()['samples/app.ts'] + 'export const other = 1;\n' })).toEqual([]);
    });

    it('wants a test beside the file it tests, named for it, and lets a test at the source root test the whole', async () => {
        const withTest = (path: string): Files => ({ ...valid(), [path]: "import { it } from 'vitest';\nit('works', () => {});\n" });
        expect(await rules(withTest('thing/view/function.show-thing.test.ts'))).toEqual([]);
        expect(await rules(withTest('thing/elements/element.thing-card.browser.test.ts'))).toEqual([]);
        expect(await rules(withTest('thing/model/index.test.ts'))).toEqual([]);
        expect(await rules(withTest('whole.test.ts'))).toEqual([]);
        expect(await rules(withTest('thing/view/show-thing.test.ts'))).toContain('test-name');
        expect(await rules(withTest('thing/model/model.test.ts'))).toContain('test-name');
    });
});

describe('imports', () => {
    it('rejects a deep import into another component', async () => {
        const files = { ...valid(), 'thing/view/function.show-thing.ts': valid()['thing/view/function.show-thing.ts'].replace("'../model/index.js'", "'../model/component.thing.js'") };
        expect(await rules(files)).toContain('deep-import');
    });

    it('rejects an import of a part from outside its layer, and accepts it through the layer', async () => {
        const withPart = part('inside', 'component.inside', '/** Inside. */\nexport const inside = Symbol();\n');
        const view = (spec: string, from: string): Files => ({
            ...valid(), ...withPart,
            'thing/model/index.ts': valid()['thing/model/index.ts'] + from,
            'thing/view/function.show-thing.ts': `import { inside } from '${spec}';\nimport { thing } from '../model/index.js';\n/** Shows. */\nexport const showThing = (): unknown => [inside, thing];\n`,
        });
        expect(await rules(view('../model/inside/index.js', ''))).toContain('nested-import');
        expect(await rules(view('../model/index.js', "export { inside } from './inside/index.js';\n"))).toEqual([]);
    });

    it('rejects a part importing its parent', async () => {
        const files = { ...valid(), ...part('inside', 'component.inside', "import { thing } from '../index.js';\n/** Inside. */\nexport const inside = thing;\n") };
        expect(await rules(files)).toContain('part-imports-parent');
    });

    it('rejects a model importing a view, a port importing elements, and an element importing the model', async () => {
        const model = { ...valid(), 'thing/model/component.thing.ts': "import { showThing } from '../view/index.js';\n" + valid()['thing/model/component.thing.ts'].replace('Symbol();', 'Symbol(); void showThing;') };
        expect(await rules(model)).toContain('layer-rank');
        const port = {
            ...valid(),
            'thing/ports/README.md': readme('ports'),
            'thing/ports/index.ts': "export * from './function.connect.js';\n",
            'thing/ports/function.connect.ts': "import { thingCard } from '../elements/index.js';\n/** Connects. */\nexport const connect = (): unknown => thingCard;\n",
        };
        expect(await rules(port)).toContain('layer-rank');
        const element = { ...valid(), 'thing/elements/element.thing-card.ts': "import { thing } from '../model/index.js';\n/** The card. */\nexport const thingCard = (): unknown => thing;\n" };
        expect(await rules(element)).toContain('layer-rank');
    });

    it('rejects an import cycle between components, and between features', async () => {
        const pair = (a: string, b: string): Files => ({
            ...valid(),
            [`${a}/model/README.md`]: readme('model'), [`${a}/model/index.ts`]: "export * from './component.a.js';\nexport * from './constant.systems.js';\n",
            [`${a}/model/component.a.ts`]: `import { b } from '${b}';\n/** A. */\nexport const a = b;\n`, [`${a}/model/constant.systems.ts`]: systemsOf(),
        });
        const cycle = {
            ...pair('one', '../../two/model/index.js'), ...without(pair('two', '../../one/model/index.js'), 'CLAUDE.md', 'thing/model/README.md'),
            'two/model/component.a.ts': "import { a as b } from '../../one/model/index.js';\n/** B. */\nexport const a = b;\n",
        };
        expect(await rules(cycle)).toContain('import-cycle');
        expect(await rules(cycle)).toContain('feature-cycle');
    });

    it('allows a type-only import to close a cycle', async () => {
        const files = {
            ...valid(),
            'thing/model/component.thing.ts': "import type { Shown } from '../view/index.js';\n" + valid()['thing/model/component.thing.ts'],
        };
        expect(await rules(files)).not.toContain('import-cycle');
    });
});

describe('purity', () => {
    it('rejects the ECS in an element', async () => {
        const files = { ...valid(), 'thing/elements/element.thing-card.ts': "import { Entity } from '@adobe/ecs';\n/** The card. */\nexport const thingCard = (): unknown => Entity.none;\n" };
        expect(await rules(files)).toContain('elements-know-nothing-of-the-ecs');
    });

    it('rejects the GPU, a UI library or the DOM in a model, and allows a comment to mention them', async () => {
        const model = (source: string): Files => ({ ...valid(), 'thing/model/component.thing.ts': source + valid()['thing/model/component.thing.ts'] });
        expect(await rules(model("import { View } from '@adobe/ecs-gpu';\nvoid View;\n"))).toContain('model-is-headless');
        expect(await rules(model("import { html } from 'lit';\nvoid html;\n"))).toContain('model-is-headless');
        expect(await rules(model('void document.body;\n'))).toContain('model-is-headless');
        expect(await rules(model('// the document is not read here\n'))).toEqual([]);
    });
});

describe('systems', () => {
    const withTick = (extra: Files = {}): Files => ({
        ...valid(),
        'thing/model/index.ts': valid()['thing/model/index.ts'] + "export * from './system.tick.js';\n",
        'thing/model/system.tick.ts': "import { System } from '@adobe/ecs';\n\n/** Ticks. */\nexport const tick: System = System.create({}, () => {});\n",
        'samples/app.ts': valid()['samples/app.ts'] + "import { tick } from '../thing/model/index.js';\nexport const ticked = tick;\n",
        ...extra,
    });

    it('requires model and view to export systems, typed as a readonly array', async () => {
        expect(await rules(without(valid(), 'thing/model/constant.systems.ts'))).toContain('systems-export');
        expect(await rules({ ...valid(), 'thing/view/constant.systems.ts': 'export const systems = [];\n' })).toContain('systems-export');
    });

    it('requires a system to be listed, run by name or part of a composite', async () => {
        expect(await rules(withTick())).toContain('unlisted-system');
        expect(await rules(withTick({ 'thing/model/constant.systems.ts': systemsOf('tick', "import { tick } from './system.tick.js';") }))).toEqual([]);
        expect(await rules(withTick({ 'samples/app.ts': valid()['samples/app.ts'] + "import { tick } from '../thing/model/index.js';\nworld.run(tick);\n" }))).toEqual([]);
        expect(await rules(withTick({ 'samples/app.ts': valid()['samples/app.ts'] + "import { tick } from '../thing/model/index.js';\nconst composite = { systems: [tick] };\n" }))).toEqual([]);
    });

    it('requires a parent to include the systems of a part', async () => {
        const inside = part('inside', 'constant.systems', systemsOf());
        expect(await rules({ ...valid(), ...inside })).toContain('systems-spread');
        const included = { ...valid(), ...inside, 'thing/model/constant.systems.ts': systemsOf('...inside', "import { systems as inside } from './inside/index.js';") };
        expect(await rules(included)).not.toContain('systems-spread');
    });
});

describe('apps', () => {
    const app = (imports: string): Files => ({
        ...valid(),
        'thing/model/constant.systems.ts': systemsOf('tick', "import { tick } from './systems/system.tick.js';"),
        'thing/model/systems/system.tick.ts': "import { System } from '@adobe/ecs';\n\n/** Ticks. */\nexport const tick: System = System.create({}, () => {});\n",
        'samples/frame.ts': `${imports}\nexport const frame = [...modelSystems, ...viewSystems];\n`,
    });

    it('wants a frame to list the systems of the layers its layers depend on', async () => {
        const both = "import { systems as modelSystems } from '../thing/model/index.js';\nimport { systems as viewSystems } from '../thing/view/index.js';";
        expect(await rules(app(both))).toEqual([]);
        const viewOnly = app("import { systems as viewSystems } from '../thing/view/index.js';\nconst modelSystems = [];");
        expect(await rules(viewOnly)).toContain('app-misses-systems');
    });

    it('counts a plugin that lists layers\' systems as listing them', async () => {
        const files = {
            ...app("import { thingPlugin } from '../thing/view/index.js';\nconst modelSystems = [];\nconst viewSystems = [thingPlugin];"),
            'thing/view/constant.thing-plugin.ts': "import { systems } from './constant.systems.js';\nimport { systems as model } from '../model/index.js';\n\n/** The thing. */\nexport const thingPlugin = { systems: [...model, ...systems] };\n",
            'thing/view/index.ts': valid()['thing/view/index.ts'] + "export * from './constant.thing-plugin.js';\n",
        };
        expect(await rules(files)).toEqual([]);
    });

    it('does not ask for a layer with no systems', async () => {
        const files = { ...valid(), 'samples/frame.ts': "import { systems as viewSystems } from '../thing/view/index.js';\nexport const frame = viewSystems;\n" };
        expect(await rules(files)).toEqual([]);
    });
});

describe('exports', () => {
    const withExtra = (extra = ''): Files => ({
        ...valid(),
        'thing/model/index.ts': valid()['thing/model/index.ts'] + "export * from './constant.unused.js';\n",
        'thing/model/constant.unused.ts': `${extra}/** Nobody reads it. */\nexport const unused = 1;\n`,
    });

    it('rejects a public export nothing outside the component uses', async () => {
        expect(await rules(withExtra())).toContain('unused-export');
    });

    it('allows one marked on purpose', async () => {
        expect(await rules(withExtra('// component-check: unused-export-ok registered by being imported\n'))).toEqual([]);
    });

    it('does not count a re-export as a use', async () => {
        const files = {
            ...withExtra(),
            'thing/model/index.ts': valid()['thing/model/index.ts'],
            ...part('inside', 'constant.shared', '/** Shared. */\nexport const shared = 1;\n', ''),
        };
        // `shared` is exported by `inside`, which nothing outside it uses (the model's index doesn't pass it up)
        expect(await rules(files)).toContain('unused-export');
    });
});

describe('what the first version of the check let through', () => {
    const modelWith = (source: string): Files => ({ ...valid(), 'thing/model/component.thing.ts': source + valid()['thing/model/component.thing.ts'] });

    it('rejects a model that reaches a view by a dynamic import, or a port that imports the GPU', async () => {
        expect(await rules(modelWith("void import('../view/index.js');\n"))).toContain('layer-rank');
        const port = {
            ...valid(),
            'thing/ports/README.md': readme('ports'),
            'thing/ports/index.ts': "export * from './function.connect.js';\n",
            'thing/ports/function.connect.ts': "import { Frame } from '@adobe/ecs-gpu';\n/** Connects. */\nexport const connect = (): unknown => Frame;\n",
        };
        expect(await rules(port)).toContain('ports-no-gpu');
    });

    it('rejects a model that fetches, sets timers or reads the clock, and allows names it declares itself', async () => {
        for (const source of ['void fetch("x");\n', 'setTimeout(() => {}, 1);\n', 'void Date.now();\n', 'void globalThis;\n']) {
            expect(await rules(modelWith(source)), source).toContain('model-is-headless');
        }
        const after = (source: string): Files => ({ ...valid(), 'thing/model/component.thing.ts': valid()['thing/model/component.thing.ts'] + source });
        expect(await rules(after('const window = { size: 1 };\nvoid window;\n'))).toEqual([]);
        expect(await rules(after('const view = { navigator: 1 };\nvoid view.navigator;\n'))).toEqual([]);
    });

    it('rejects an index that re-exports from outside the component', async () => {
        const files = { ...valid(), 'thing/model/index.ts': valid()['thing/model/index.ts'] + "export * from '../view/function.show-thing.js';\n" };
        expect(await rules(files)).toContain('index-is-only-re-exports');
    });

    it('rejects a root file that exports a second name of any kind', async () => {
        for (const extra of ['export interface Extra { readonly a: number }\n', 'export enum Mode { A }\n', 'export const other = 1, more = 2;\n']) {
            const files = { ...valid(), 'thing/model/component.thing.ts': valid()['thing/model/component.thing.ts'] + extra };
            expect(await rules(files), extra).toContain('file-exports-its-name');
        }
    });

    it('requires a system to be typed as its interface, with void for no input', async () => {
        const tick = (type: string): Files => ({
            ...valid(),
            'thing/model/index.ts': valid()['thing/model/index.ts'] + "export * from './system.tick.js';\n",
            'thing/model/system.tick.ts': `import { System } from '@adobe/ecs';\n\n/** Ticks. */\nexport const tick${type} = System.create({}, () => {});\n`,
            'thing/model/constant.systems.ts': systemsOf('tick', "import { tick } from './system.tick.js';"),
            'samples/app.ts': valid()['samples/app.ts'] + "import { tick } from '../thing/model/index.js';\nexport const ticked = tick;\n",
        });
        expect(await rules(tick(': System'))).toEqual([]);
        expect(await rules(tick(': System<{ readonly n: number }>'))).toEqual([]);
        expect(await rules(tick(''))).toContain('system-typed');
        expect(await rules(tick(': System<undefined>'))).toContain('system-typed');
    });

    it('requires a parent to spread a part\'s systems, not just import them', async () => {
        const inside = part('inside', 'constant.systems', systemsOf());
        const imported = { ...valid(), ...inside, 'thing/model/constant.systems.ts': systemsOf('', "import { systems as inside } from './inside/index.js';") };
        expect(await rules(imported)).toContain('systems-spread');
    });

    it('finds a system nobody runs in a private systems folder', async () => {
        const dead = {
            ...valid(),
            'thing/model/systems/system.dead.ts': "import { System } from '@adobe/ecs';\n\n/** Dead. */\nexport const dead: System = System.create({}, () => {});\n",
        };
        expect(await rules(dead)).toContain('unlisted-system');
        const listed = { ...dead, 'thing/model/constant.systems.ts': systemsOf('dead', "import { dead } from './systems/system.dead.js';") };
        expect(await rules(listed)).toEqual([]);
    });

    it('does not take a same-named local variable for a use of an export', async () => {
        const files = {
            ...valid(),
            'thing/model/index.ts': valid()['thing/model/index.ts'] + "export * from './constant.unused.js';\n",
            'thing/model/constant.unused.ts': '/** Nobody imports it. */\nexport const unused = 1;\n',
            'samples/app.ts': valid()['samples/app.ts'] + 'const unused = 2;\nexport const other = unused;\n',
        };
        expect(await rules(files)).toContain('unused-export');
    });

    it('rejects a feature that holds other folders beside its layers', async () => {
        expect(await rules({ ...valid(), 'thing/scratch/function.x.ts': 'export {};\n' })).toContain('feature-holds-only-layers');
    });

    it('reads a README with Windows line endings', async () => {
        expect(await rules({ ...valid(), 'thing/model/README.md': '# model\r\n\r\nA summary.\r\n' })).toEqual([]);
    });
});

describe('systems, found through imports', () => {
    const tickFile = "import { System } from '@adobe/ecs';\n\n/** Ticks. */\nexport const tick: System = System.create({}, () => {});\n";
    const withTick = (extra: Files): Files => ({
        ...valid(),
        'thing/model/index.ts': valid()['thing/model/index.ts'] + "export * from './system.tick.js';\n",
        'thing/model/system.tick.ts': tickFile,
        'samples/app.ts': valid()['samples/app.ts'] + "import { tick } from '../thing/model/index.js';\nexport const ticked = tick;\n",
        ...extra,
    });

    it('follows an import renamed and re-exported through an index to the system it names', async () => {
        expect(await rules(withTick({ 'samples/run.ts': "import { tick as step } from '../thing/model/index.js';\ndeclare const world: { run(system: unknown): void };\nworld.run(step);\n" }))).toEqual([]);
    });

    it('takes a world.add of the system as running it', async () => {
        expect(await rules(withTick({ 'samples/run.ts': "import { tick } from '../thing/model/index.js';\ndeclare const world: { add(system: unknown): void };\nworld.add(tick);\n" }))).toEqual([]);
    });

    it('doesn\'t take a run of another binding of the same name for a run of the system', async () => {
        expect(await rules(withTick({ 'samples/run.ts': "const tick = 1;\ndeclare const world: { run(system: unknown): void };\nworld.run(tick);\n" }))).toContain('unlisted-system');
    });
});

describe('configuration', () => {
    it('takes the layers, kinds and apps it\'s given', async () => {
        const files: Files = {
            'thing/core/README.md': readme('core'),
            'thing/core/index.ts': "export * from './shader.thing.js';\n",
            'thing/core/shader.thing.ts': '/** A shader. */\nexport const thing = "";\n',
            'demos/app.ts': "import { thing } from '../thing/core/index.js';\nexport const app = thing;\n",
        };
        expect(await rules(files)).toContain('layer-name');
        expect(await rules(files)).toContain('folder-holds-only-folders');
        expect(await check(files, { layers: { core: ['core'] }, kinds: ['shader'], apps: ['demos'], systems: [] })).toEqual([]);
    });

    it('checks the imports a layer may make by the layers it\'s given', async () => {
        const files: Files = {
            ...valid(),
            'thing/elements/element.thing-card.ts': "import { thing } from '../model/index.js';\n/** The card. */\nexport const thingCard = (): unknown => thing;\n",
        };
        expect(await rules(files)).toContain('layer-rank');
        const layers = { elements: ['elements', 'model'], model: ['model'], view: ['model', 'elements', 'view'] };
        expect((await check(files, { layers })).map(violation => violation.rule)).toEqual([]);
    });
});

describe('tests', () => {
    it('may import anything by its path, and their imports through an index count as uses', async () => {
        const files: Files = {
            ...valid(),
            'thing/model/index.ts': valid()['thing/model/index.ts'] + "export * from './constant.unused.js';\n",
            'thing/model/constant.unused.ts': '/** Only a test reads it. */\nexport const unused = 1;\n',
            'thing/elements/index.test.ts': "import { unused } from '../model/index.js';\nimport { thing } from '../model/component.thing.js';\nimport { helper } from '../view/shared/view.test-helper.js';\nvoid [unused, thing, helper];\n",
            'thing/view/shared/view.test-helper.ts': 'export const helper = 1;\nvoid document;\n',
        };
        expect(await rules(files)).toEqual([]);
    });
});

describe('what review found', () => {
    const tickFile = "import { System } from '@adobe/ecs';\n\n/** Ticks. */\nexport const tick: System = System.create({}, () => {});\n";
    const withTick = (extra: Files): Files => ({
        ...valid(),
        'thing/model/index.ts': valid()['thing/model/index.ts'] + "export * from './system.tick.js';\n",
        'thing/model/system.tick.ts': tickFile,
        'samples/app.ts': valid()['samples/app.ts'] + "import { tick } from '../thing/model/index.js';\nexport const ticked = tick;\n",
        ...extra,
    });
    const modelWith = (source: string): Files => ({ ...valid(), 'thing/model/component.thing.ts': valid()['thing/model/component.thing.ts'] + source });

    it('counts a run through a namespace import, and not one of a parameter shadowing the import', async () => {
        expect(await rules(withTick({ 'samples/run.ts': "import * as model from '../thing/model/index.js';\ndeclare const world: { run(system: unknown): void };\nworld.run(model.tick);\n" }))).toEqual([]);
        const shadowed = "import { tick } from '../thing/model/index.js';\ndeclare const world: { run(system: unknown): void };\nexport const execute = (tick: unknown): void => world.run(tick);\nvoid tick;\n";
        expect(await rules(withTick({ 'samples/run.ts': shadowed }))).toContain('unlisted-system');
    });

    it('reads no global from an imported name, a local Date, or a name declared only in another function', async () => {
        expect((await rules(modelWith("import { fetch as load } from './component.thing.js';\nvoid load;\n"))).filter(rule => rule === 'model-is-headless')).toEqual([]);
        expect(await rules(modelWith('const clock = (): number => { const Date = { now: () => 1 }; return Date.now(); };\nvoid clock;\n'))).toEqual([]);
        expect(await rules(modelWith('const one = (fetch: () => void): void => fetch();\nconst two = (): void => { void fetch; };\nvoid [one, two];\n'))).toContain('model-is-headless');
    });

    it('rejects a root file that re-exports beside its export', async () => {
        expect(await rules({ ...valid(), 'thing/model/component.thing.ts': valid()['thing/model/component.thing.ts'] + "export { showThing } from '../view/index.js';\n" })).toContain('file-exports-its-name');
    });

    it('allows a chain of declarations above the export that the export needs as it loads', async () => {
        const files: Files = {
            ...valid(),
            'thing/model/index.ts': valid()['thing/model/index.ts'] + "export * from './constant.value.js';\n",
            'thing/model/constant.value.ts': 'const first = 1;\nconst second = first + 1;\n\n/** A value. */\nexport const value = second;\n',
            'samples/app.ts': valid()['samples/app.ts'] + "import { value } from '../thing/model/index.js';\nexport const read = value;\n",
        };
        expect(await rules(files)).toEqual([]);
    });

    it('counts a part\'s export the parent passes on under another name as used', async () => {
        const files: Files = {
            ...valid(),
            ...part('inside', 'constant.shared', '/** Shared. */\nexport const shared = 1;\n'),
            'thing/model/index.ts': valid()['thing/model/index.ts'] + "export { shared as common } from './inside/index.js';\n",
            'samples/app.ts': valid()['samples/app.ts'] + "import { common } from '../thing/model/index.js';\nexport const read = common;\n",
        };
        expect(await rules(files)).toEqual([]);
    });

    it('takes a type-only named re-export as no runtime dependency, and a dynamic import as a use of every export', async () => {
        const typeOnly = { ...valid(), 'thing/model/component.thing.ts': "export { type Shown } from '../view/index.js';\n" + valid()['thing/model/component.thing.ts'] };
        expect(await rules(typeOnly)).not.toContain('import-cycle');
        const dynamic: Files = {
            ...valid(),
            'thing/model/index.ts': valid()['thing/model/index.ts'] + "export * from './constant.lazy.js';\n",
            'thing/model/constant.lazy.ts': '/** Loaded later. */\nexport const lazy = 1;\n',
            'samples/later.ts': "export const later = async (): Promise<number> => (await import('../thing/model/index.js')).lazy;\n",
        };
        expect(await rules(dynamic)).toEqual([]);
    });

    it('reads an app made of several modules as one, ignores tests, and counts a plugin\'s own systems', async () => {
        const app = (extra: Files): Files => ({
            ...valid(),
            'thing/model/constant.systems.ts': systemsOf('tick', "import { tick } from './systems/system.tick.js';"),
            'thing/model/systems/system.tick.ts': tickFile,
            ...extra,
        });
        expect(await rules(app({
            'samples/demo/model.ts': "import { systems } from '../../thing/model/index.js';\nexport const model = systems;\n",
            'samples/demo/view.ts': "import { systems } from '../../thing/view/index.js';\nexport const view = systems;\n",
        }))).toEqual([]);
        expect(await rules(app({ 'thing.view.test.ts': "import { systems } from './thing/view/index.js';\nvoid systems;\n" }))).toEqual([]);
        const plugin: Files = app({
            'thing/view/constant.thing-plugin.ts': "import { systems } from './constant.systems.js';\nimport { systems as model } from '../model/index.js';\n\n/** The thing. */\nexport const thingPlugin = { systems: [...model, ...systems] };\n",
            'thing/view/index.ts': valid()['thing/view/index.ts'] + "export * from './constant.thing-plugin.js';\n",
            'thing/view/constant.systems.ts': systemsOf('show', "import { show } from './systems/system.show.js';"),
            'thing/view/systems/system.show.ts': "import { System } from '@adobe/ecs';\n\n/** Shows. */\nexport const show: System = System.create({}, () => {});\n",
            'samples/demo/app.ts': "import { thingPlugin } from '../../thing/view/index.js';\nexport const plugins = [thingPlugin];\n",
        });
        expect(await rules(plugin)).toEqual([]);
    });
});

describe('derived components', () => {
    const glow = "import { Component } from '@adobe/ecs';\nimport { thing } from './component.thing.js';\n\n/** A glow. */\nexport const glow = Symbol();\n\ndeclare module '@adobe/ecs' {\n    interface Components {\n        [glow]: { type: true; derived: true };\n    }\n}\n\nComponent.derive(glow, { from: [thing] });\n";
    const withGlow = (files: Files): Files => ({ ...files, 'thing/model/component.glow.ts': glow, 'thing/model/index.ts': files['thing/model/index.ts'] + "export * from './component.glow.js';\n", 'samples/app.ts': files['samples/app.ts'] + "import { glow } from '../thing/model/index.js';\nexport const glowing = glow;\n" });
    it('are derived in the file that declares them', async () => {
        expect(await rules(withGlow(valid()))).toEqual([]);
    });
    it('rejects Component.derive anywhere else, saying where it belongs', async () => {
        const files = withGlow(valid());
        const moved = {
            ...files,
            'thing/model/component.glow.ts': glow.replace("import { Component } from '@adobe/ecs';\nimport { thing } from './component.thing.js';\n\n", '').replace('\nComponent.derive(glow, { from: [thing] });\n', ''),
            'thing/model/component.thing.ts': "import { Component } from '@adobe/ecs';\nimport { glow } from './component.glow.js';\n\n" + files['thing/model/component.thing.ts'] + '\nComponent.derive(glow, { from: [thing] });\n',
        };
        const violations = await check(moved);
        expect(violations.map(violation => [violation.file, violation.rule, violation.problem, violation.fix])).toEqual([[
            'thing/model/component.thing.ts', 'derive-beside-component',
            '`Component.derive(glow, ...)` derives a component declared in thing/model/component.glow.ts, not this file.',
            "Move it into thing/model/component.glow.ts, below `export const glow = Symbol()` and its declare module entry: a derived component is defined where it's declared, so whoever imports it gets its derivations.",
        ]]);
    });
});

describe('what the second review found', () => {
    const modelWith = (source: string): Files => ({ ...valid(), 'thing/model/component.thing.ts': valid()['thing/model/component.thing.ts'] + source });

    it('reads a global in a destructuring default, and not in a var a nested block declares for its function', async () => {
        expect(await rules(modelWith('export const read = (options: { value?: unknown }): unknown => { const { value = document } = options; return value; };\n'))).toContain('model-is-headless');
        expect(await rules(modelWith('const clock = (): number => { if (Math.random() > 2) { var Date = { now: () => 1 }; } return Date.now(); };\nvoid clock;\n'))).toEqual([]);
    });

    it('counts an app listing a layer\'s systems through a namespace import', async () => {
        const tickFile = "import { System } from '@adobe/ecs';\n\n/** Ticks. */\nexport const tick: System = System.create({}, () => {});\n";
        const files: Files = {
            ...valid(),
            'thing/model/constant.systems.ts': systemsOf('tick', "import { tick } from './systems/system.tick.js';"),
            'thing/model/systems/system.tick.ts': tickFile,
            'samples/demo/app.ts': "import * as view from '../../thing/view/index.js';\nexport const frame = [...view.systems];\n",
        };
        expect(await rules(files)).toContain('app-misses-systems');
    });
});

describe('what the third review found', () => {
    const tickFile = "import { System } from '@adobe/ecs';\n\n/** Ticks. */\nexport const tick: System = System.create({}, () => {});\n";
    const app = (source: string): Files => ({
        ...valid(),
        'thing/model/constant.systems.ts': systemsOf('tick', "import { tick } from './systems/system.tick.js';"),
        'thing/model/systems/system.tick.ts': tickFile,
        'samples/demo/app.ts': source,
    });

    it('takes neither a type-only import of systems nor a parameter shadowing a namespace as listing them', async () => {
        expect(await rules(app("import { systems as view } from '../../thing/view/index.js';\nimport type { systems as model } from '../../thing/model/index.js';\nexport const frame: typeof model = [...view];\n"))).toContain('app-misses-systems');
        expect(await rules(app("import { systems as view } from '../../thing/view/index.js';\nimport * as model from '../../thing/model/index.js';\nexport const frame = [...view];\nexport const read = (model: { systems: readonly unknown[] }): unknown => model.systems;\nvoid model.thing;\n"))).toContain('app-misses-systems');
    });

    it('counts a type named through an import type as a use of its export', async () => {
        const files: Files = {
            ...valid(),
            'thing/model/index.ts': valid()['thing/model/index.ts'] + "export * from './type.shape.js';\n",
            'thing/model/type.shape.ts': '/** A shape. */\nexport type Shape = { readonly size: number };\n',
            'samples/shape.ts': "export const size = (shape: import('../thing/model/index.js').Shape): number => shape.size;\n",
        };
        expect(await rules(files)).toEqual([]);
    });
});

describe('what the fourth review found', () => {
    it('finds a cycle through an index\'s re-export of a part', async () => {
        const cycle: Files = {
            ...valid(),
            'thing/model/a/README.md': readme('a'),
            'thing/model/a/index.ts': "export { inner } from './inner/index.js';\n",
            'thing/model/a/inner/index.ts': "export * from './constant.inner.js';\n",
            'thing/model/a/inner/constant.inner.ts': "import { b } from '../../b/index.js';\n\n/** Inner. */\nexport const inner = b;\n",
            'thing/model/b/README.md': readme('b'),
            'thing/model/b/index.ts': "export * from './constant.b.js';\n",
            'thing/model/b/constant.b.ts': "import { inner } from '../a/index.js';\n\n/** B. */\nexport const b = 1;\nvoid inner;\n",
        };
        expect(await rules(cycle)).toContain('import-cycle');
    });

    it('keeps a static block\'s var to the block', async () => {
        const model = { ...valid(), 'thing/model/component.thing.ts': valid()['thing/model/component.thing.ts'] + 'const read = (): number => { class Local { static { var Date = 0; void Date; } } void Local; return Date.now(); };\nvoid read;\n' };
        expect(await rules(model)).toContain('model-is-headless');
    });
});

describe('what the fifth review found', () => {
    it('takes a type-only name in a mixed import as listing no systems', async () => {
        const tickFile = "import { System } from '@adobe/ecs';\n\n/** Ticks. */\nexport const tick: System = System.create({}, () => {});\n";
        const files: Files = {
            ...valid(),
            'thing/model/constant.systems.ts': systemsOf('tick', "import { tick } from './systems/system.tick.js';"),
            'thing/model/systems/system.tick.ts': tickFile,
            'samples/demo/app.ts': "import { systems as view } from '../../thing/view/index.js';\nimport { thing, type systems as model } from '../../thing/model/index.js';\nexport const frame: typeof model = [...view];\nvoid thing;\n",
        };
        expect(await rules(files)).toContain('app-misses-systems');
    });
});

describe('what the sixth review found', () => {
    it('follows System.create imported under another name', async () => {
        const tickFile = "import { System } from '@adobe/ecs';\n\n/** Ticks. */\nexport const tick: System = System.create({}, () => {});\n";
        const files: Files = {
            ...valid(),
            'thing/model/index.ts': valid()['thing/model/index.ts'] + "export * from './system.tick.js';\n",
            'thing/model/system.tick.ts': tickFile,
            'samples/app.ts': valid()['samples/app.ts'] + "import { System as RuntimeSystem } from '@adobe/ecs';\nimport { tick } from '../thing/model/index.js';\nexport const frame = RuntimeSystem.create([tick]);\n",
        };
        expect(await rules(files)).toEqual([]);
    });
});
