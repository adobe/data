// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from 'vitest';
import { check } from './check.js';

type Files = Readonly<Record<string, string>>;

const readme = (name: string): string => `# ${name}\n\nA summary.\n`;
/** Uses what `source`, written with paths from the source root, imports: an entry of the main feature. */
const use = (source: string): Files => ({ 'features/main/view/entry.use.ts': source.replaceAll("from './features/", "from '../../").replaceAll("import('./features/", "import('../../").replaceAll('export const', 'const') });
/** Runs `source`, written with paths from the source root, as it loads: an entry of the main feature. */
const start = (source: string): Files => ({ 'features/main/view/entry.start.ts': source.replaceAll("from './features/", "from '../../").replaceAll("import('./features/", "import('../../") });

/** A small app that follows every rule: a feature with a model, a view and elements, and a main feature composing it. */
const valid = () => ({
    'CLAUDE.md': '# src\n',
    'features/thing/model/README.md': readme('model'),
    'features/thing/model/index.ts': "export * from './component.thing.js';\n",
    'features/thing/model/component.thing.ts':
        "/** A thing. */\nexport const thing = Symbol();\n\ndeclare module '@adobe/ecs' {\n    interface Components {\n        [thing]: { type: true };\n    }\n}\n",
    'features/thing/elements/README.md': readme('elements'),
    'features/thing/elements/index.ts': "export * from './element.thing-card.js';\n",
    'features/thing/elements/element.thing-card.ts': '/** The card. */\nexport const thingCard = (): string => "card";\n',
    'features/thing/view/README.md': readme('view'),
    'features/thing/view/index.ts': "export * from './function.show-thing.js';\n",
    'features/thing/view/function.show-thing.ts':
        "import { thing } from '../model/index.js';\nimport { thingCard } from '../elements/index.js';\n\n/** Shows a thing. */\nexport const showThing = (): unknown => [thing, thingCard()];\n",
    'features/main/view/README.md': readme('view'),
    'features/main/view/index.ts': 'export {};\n',
    'features/main/view/entry.page.ts':
        "import { showThing } from '../../thing/view/index.js';\nimport { thingCard } from '../../thing/elements/index.js';\n\ndocument.body.append(String(showThing()), thingCard());\n",
});

const rules = async (files: Files): Promise<string[]> => (await check(files)).map(violation => violation.rule);
const without = (files: Files, ...paths: string[]): Files => Object.fromEntries(Object.entries(files).filter(([p]) => !paths.includes(p)));
/** A part component of thing/model, with the given root file. */
const part = (name: string, rootFile: string, source: string, extraIndex = ''): Files => ({
    [`features/thing/model/${name}/README.md`]: readme(name),
    [`features/thing/model/${name}/index.ts`]: `export * from './${rootFile}.js';\n${extraIndex}`,
    [`features/thing/model/${name}/${rootFile}.ts`]: source,
});

describe('test files', () => {
    it('export nothing, and are no helpers', async () => {
        expect(await rules({ ...valid(), 'features/thing/model/index.test.ts': "export const shared = 1;\n" })).toEqual(['test-exports']);
        expect(await rules({ ...valid(), 'features/thing/model/thing.test-helper.ts': "export const a = 1;\nexport const b = 2;\n" })).toEqual(['test-helper']);
        expect(await rules({ ...valid(), 'features/thing/model/index.test.ts': "const local = 1;\nvoid local;\n" })).toEqual([]);
    });
});

describe('length', () => {
    it('holds a source file to maxLines, 400 by default, but not a test', async () => {
        const shown = valid()['features/thing/view/function.show-thing.ts'];
        const long = (lines: number): string => `${shown}${'// more\n'.repeat(lines - shown.split('\n').length + 1)}`;
        expect(await rules({ ...valid(), 'features/thing/view/function.show-thing.ts': long(400) })).toEqual([]);
        expect(await rules({ ...valid(), 'features/thing/view/function.show-thing.ts': long(401) })).toContain('file-too-long');
        expect(await check({ ...valid(), 'features/thing/view/function.show-thing.ts': long(401) }, { maxLines: 500 })).toEqual([]);
        expect(await rules({ ...valid(), 'features/thing/view/function.show-thing.test.ts': long(600) })).not.toContain('file-too-long');
    });
});

describe('entries', () => {
    it('export nothing', async () => {
        expect(await rules({ ...valid(), 'features/main/view/entry.page.ts': valid()['features/main/view/entry.page.ts'] + 'export const leaked = 1;\n' })).toContain('entry-exports');
    });
});

describe('the standard, followed', () => {
    it('a feature with a model, elements and a view has no violations', async () => {
        expect(await check(valid())).toEqual([]);
    });

    it('a view and a port may import the model, a view the elements, and a layer its own parts', async () => {
        const files = {
            ...valid(),
            ...part('inside', 'component.inside', "/** Inside. */\nexport const inside = Symbol();\n"),
            'features/thing/model/component.thing.ts': valid()['features/thing/model/component.thing.ts'].replace('Symbol();', "Symbol(); void inside;").replace('/** A thing. */', "import { inside } from './inside/index.js';\n/** A thing. */"),
            'features/thing/ports/README.md': readme('ports'),
            'features/thing/ports/index.ts': "export * from './function.connect-thing.js';\n",
            'features/thing/ports/function.connect-thing.ts': "import { thing } from '../model/index.js';\n\n/** Connects. */\nexport const connectThing = (): unknown => thing;\n",
            'features/main/ports/README.md': readme('ports'),
            'features/main/ports/index.ts': 'export {};\n',
            'features/main/ports/entry.connect.ts': "import { connectThing } from '../../thing/ports/index.js';\n\nconnectThing();\n",
        };
        expect(await rules(files)).toEqual([]);
    });
});

describe('nested features', () => {
    const layer = (path: string, file: string, source: string, index = `export * from './${file.replace(/\.ts$/, '.js')}';\n`): Files => ({
        [`${path}/README.md`]: readme(path.split('/').pop() ?? ''),
        [`${path}/index.ts`]: index,
        [`${path}/${file}`]: source,
    });
    const filter = (source = '/** A filter. */\nexport const filter = 1;\n'): Files =>
        layer('features/thing/features/filter/model', 'constant.filter.ts', source);
    const page = (name: string): string =>
        `import { ${name} } from '../../thing/model/index.js';\n` + valid()['features/main/view/entry.page.ts'] + `void [${name}];\n`;

    it('allows the source root\'s own layers', async () => {
        const files: Files = {
            ...valid(),
            ...layer('model', 'constant.app-name.ts', "/** The app's name. */\nexport const appName = 'app';\n"),
            'features/main/view/entry.page.ts': "import { appName } from '../../../model/index.js';\n" + valid()['features/main/view/entry.page.ts'] + 'void appName;\n',
        };
        expect(await rules(files)).toEqual([]);
    });

    it('rejects a feature but the root with no layer of its own', async () => {
        const files: Files = { ...valid(), ...layer('features/group/features/inner/model', 'constant.inner.ts', '/** Inner. */\nexport const inner = 1;\n// component-check: unused-export-ok test\n') };
        expect(await rules(files)).toEqual(['feature-without-layers']);
    });

    it('lets a child import its parent, and a parent its child only in its plugin or index', async () => {
        const viaIndex: Files = {
            ...valid(), ...filter(),
            'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + "export { filter } from '../features/filter/model/index.js';\n",
            'features/main/view/entry.page.ts': page('filter'),
        };
        expect(await rules(viaIndex)).toEqual([]);
        const viaPlugin: Files = {
            ...valid(), ...filter(),
            'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + "export * from './plugin.thing-model.js';\n",
            'features/thing/model/plugin.thing-model.ts': "import { filter } from '../features/filter/model/index.js';\n\n/** The thing's model. */\nexport const thingModel = { systems: [], filter };\n",
            'features/main/view/entry.page.ts': page('thingModel'),
        };
        expect(await rules(viaPlugin)).toEqual([]);
        const elsewhere: Files = {
            ...viaPlugin,
            'features/thing/model/component.thing.ts': "import { filter } from '../features/filter/model/index.js';\n" + valid()['features/thing/model/component.thing.ts'] + 'void filter;\n',
        };
        expect(await rules(elsewhere)).toContain('parent-imports-sub-feature');
    });

    it('lets a sub-feature import its parent\'s layers', async () => {
        const files: Files = {
            ...valid(),
            ...filter("import { thing } from '../../../model/index.js';\n\n/** A filter. */\nexport const filter = thing;\n"),
            'features/main/view/entry.page.ts': "import { filter } from '../../thing/features/filter/model/index.js';\n" + valid()['features/main/view/entry.page.ts'] + 'void filter;\n',
        };
        expect(await rules(files)).toEqual([]);
    });

    it('names a nested feature\'s plugin for it, and the root\'s for the app', async () => {
        const plugin = (path: string, name: string, exported: string): Files => layer(path, `plugin.${name}.ts`, `/** The plugin. */\nexport const ${exported} = { systems: [] };\n// component-check: unused-export-ok test\n`);
        expect(await rules({ ...valid(), ...plugin('features/thing/features/filter/model', 'filter-model', 'filterModel') })).toEqual([]);
        expect(await rules({ ...valid(), ...plugin('features/thing/features/filter/model', 'thing-model', 'thingModel') })).toEqual(['plugin-name']);
        expect(await rules({ ...valid(), ...plugin('view', 'app-view', 'appView') })).toEqual([]);
    });

    it('lets a nested test feature be imported only inside its owner', async () => {
        const helper = layer('features/thing/test/sample/model', 'function.sample.ts', "import { thing } from '../../../model/index.js';\n\n/** A sample. */\nexport const sample = (): symbol => thing;\n");
        const inside: Files = { ...valid(), ...helper, 'features/thing/model/index.test.ts': "import { sample } from '../test/sample/model/index.js';\nvoid sample;\n" };
        expect(await rules(inside)).toEqual([]);
        const outside: Files = { ...inside, 'features/main/view/entry.page.test.ts': "import { sample } from '../../thing/test/sample/model/index.js';\nvoid sample;\n" };
        expect(await rules(outside)).toEqual(['test-feature-import']);
    });
});

describe('layout', () => {
    it('rejects a stray file in the root of src', async () => {
        expect(await rules({ ...valid(), 'stray.ts': 'export {};\n' })).toContain('src-root-files');
    });

    it('rejects src/index.ts that is more than re-exports', async () => {
        expect(await rules({ ...valid(), 'index.ts': "export * from './main/view/index.js';\nconsole.log('start');\n" })).toContain('index-is-only-re-exports');
        expect(await rules({ ...valid(), 'index.ts': "export * from './main/view/index.js';\n" })).toEqual([]);
    });

    it('rejects a top-level component that is not a layer', async () => {
        expect((await rules({ ...valid(), 'camera/README.md': readme('camera'), 'camera/index.ts': 'export {};\n' })).filter(r => r === 'layer-name')).toHaveLength(1);
    });

    it('allows an ARCHITECTURE.md beside a feature\'s layers and in the root of src', async () => {
        expect(await rules({ ...valid(), 'ARCHITECTURE.md': '# Architecture\n', 'features/thing/ARCHITECTURE.md': '# thing\n' })).toEqual([]);
    });

    it('rejects a file in a feature, and a folder at the source root that isn\'t a layer, features/ or test/', async () => {
        expect(await rules({ ...valid(), 'features/thing/stray.ts': 'export {};\n' })).toContain('folder-holds-only-folders');
        expect(await rules({ ...valid(), 'samples/app.ts': "export const app = 1;\n" })).toEqual(['feature-contents']);
        expect(await rules({ ...valid(), 'features/app.ts': "export const app = 1;\n" })).toEqual(['folder-holds-only-folders']);
    });

    it('takes an entry\'s imports as uses, asks no re-export of it, and allows `export {}` only beside an entry', async () => {
        const unused = {
            ...valid(),
            'features/thing/view/index.ts': valid()['features/thing/view/index.ts'] + "export * from './function.hide-thing.js';\n",
            'features/thing/view/function.hide-thing.ts': '/** Hides a thing. */\nexport const hideThing = (): void => {};\n',
        };
        expect(await rules(unused)).toEqual(['unused-export']);
        expect(await rules({ ...unused, 'features/main/view/entry.page.ts': "import { hideThing } from '../../thing/view/index.js';\n" + valid()['features/main/view/entry.page.ts'] + 'hideThing();\n' })).toEqual([]);
        expect(await rules({ ...valid(), 'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + 'export {};\n' })).toContain('index-is-only-re-exports');
    });

    it('takes a root declaration an entry beside it imports as used', async () => {
        const files: Files = {
            ...valid(),
            'features/main/view/index.ts': "export * from './function.create-app.js';\n",
            'features/main/view/function.create-app.ts': '/** Creates the app. */\nexport const createApp = (): number => 1;\n',
        };
        expect(await rules(files)).toEqual(['unused-export']);
        expect(await rules({ ...files, 'features/main/view/entry.page.ts': "import { createApp } from './function.create-app.js';\n" + valid()['features/main/view/entry.page.ts'] + 'createApp();\n' })).toEqual([]);
    });

    it('counts a re-export in src/index.ts, the package\'s interface, as a use', async () => {
        const files = {
            ...valid(),
            'features/thing/view/index.ts': valid()['features/thing/view/index.ts'] + "export * from './function.hide-thing.js';\n",
            'features/thing/view/function.hide-thing.ts': '/** Hides a thing. */\nexport const hideThing = (): void => {};\n',
        };
        expect(await rules(files)).toEqual(['unused-export']);
        expect(await rules({ ...files, 'index.ts': "export { hideThing } from './features/thing/view/index.js';\n" })).toEqual([]);
        expect(await rules({ ...files, 'index.ts': "export * from './features/thing/view/index.js';\n" })).toEqual([]);
    });

    it('lets only an entry run code as it loads, and a derivation register', async () => {
        const model = (source: string): Files => ({ ...valid(), 'features/thing/model/component.thing.ts': valid()['features/thing/model/component.thing.ts'] + source });
        expect(await rules(model('console.log(thing);\n'))).toEqual(['runs-on-load']);
        expect(await rules(model('void Promise.resolve(thing);\n'))).toEqual(['runs-on-load']);
        expect(await rules(model('new Set([thing]);\n'))).toEqual(['runs-on-load']);
        const view = { ...valid(), 'features/thing/elements/element.thing-card.ts': valid()['features/thing/elements/element.thing-card.ts'] + "const template = { innerHTML: '' };\ntemplate.innerHTML = '<p></p>';\n" };
        expect(await rules(view)).toEqual([]);
        expect(await rules(valid())).toEqual([]);
    });

    it('rejects a layer folder with no index.ts', async () => {
        expect(await rules({ ...valid(), 'features/other/view/function.show.ts': 'export {};\n' })).toContain('layer-needs-index');
    });

    it('rejects a root file named wrongly or exporting something else', async () => {
        expect(await rules({ ...valid(), 'features/thing/model/helper.ts': 'export const x = 1;\n' })).toContain('file-name');
        expect(await rules({ ...valid(), 'features/thing/model/component.thing.ts': valid()['features/thing/model/component.thing.ts'].replace('const thing', 'const other') })).toContain('file-exports-its-name');
    });

    it('rejects an index that skips a root file or exports anything else', async () => {
        expect(await rules({ ...valid(), 'features/thing/model/index.ts': '' })).toContain('index-exports-root-files');
        expect(await rules({ ...valid(), 'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + 'export const x = 1;\n' })).toContain('index-is-only-re-exports');
    });

    it('rejects a layer with no README, or a README with no summary, but does not ask a part for one', async () => {
        expect(await rules(without(valid(), 'features/thing/model/README.md'))).toContain('readme');
        const inside = part('inside', 'component.inside', '/** Inside. */\nexport const inside = Symbol();\n');
        const files = {
            ...valid(), ...without(inside, 'features/thing/model/inside/README.md'),
            'features/thing/model/component.thing.ts': "import { inside } from './inside/index.js';\n" + valid()['features/thing/model/component.thing.ts'].replace('Symbol();', 'Symbol(); void inside;'),
        };
        expect(await rules(files)).toEqual([]);
        expect(await rules({ ...valid(), 'features/thing/model/README.md': '# model\nno blank line\n' })).toContain('readme');
    });
});

describe('root files: the export first, in any size', () => {
    const body = (lines: number): string => Array.from({ length: lines }, (_, i) => `    run(${i});`).join('\n');
    const withFunction = (source: string, extra: Files = {}): Files => ({
        ...valid(),
        'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + "export * from './function.do-it.js';\n",
        'features/thing/model/function.do-it.ts': source,
        ...use("import { doIt } from './features/thing/model/index.js';\nexport const used = doIt;\n"),
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
            { 'features/thing/model/function.do-it/function.do-it.ts': 'const first = 1;\nexport const doIt = (): number => first;\n' },
        );
        expect(await rules(files)).toEqual([]);
    });
});

describe('one export per file, and tests named for what they test', () => {
    const withShared = (path: string, source: string): Files => ({
        ...valid(),
        'features/thing/view/function.show-thing.ts': `import { shown } from './function.show-thing/${path.replace(/\.ts$/, '.js')}';\n${valid()['features/thing/view/function.show-thing.ts'].replace('thingCard()]', 'thingCard(), shown]')}`,
        [`features/thing/view/function.show-thing/${path}`]: source,
    });

    it('holds a file in a private folder to one export, first, the file named for it', async () => {
        expect(await rules(withShared('constant.shown.ts', '/** Shown. */\nexport const shown = 1;\n'))).toEqual([]);
        expect(await rules(withShared('shown.ts', '/** Shown. */\nexport const shown = 1;\n'))).toContain('file-name');
        expect(await rules(withShared('constant.shown.ts', '/** Shown. */\nexport const shown = 1;\nexport type Shown = number;\n'))).toContain('file-exports-its-name');
        expect(await rules(withShared('constant.shown.ts', 'const unrelated = 2;\n\n/** Shown. */\nexport const shown = 1;\n'))).toContain('export-first');
    });

    it('lets a private file that exports nothing be named for what it does', async () => {
        expect(await rules({ ...valid(), 'features/thing/view/function.show-thing/setup.ts': 'void 0;\n' })).toEqual([]);
    });

    it('wants a test beside the file it tests, named for it, and lets a test at the source root test the whole', async () => {
        const withTest = (path: string): Files => ({ ...valid(), [path]: "import { it } from 'vitest';\nit('works', () => {});\n" });
        expect(await rules(withTest('features/thing/view/function.show-thing.test.ts'))).toEqual([]);
        expect(await rules(withTest('features/thing/elements/element.thing-card.browser.test.ts'))).toEqual([]);
        expect(await rules(withTest('features/thing/model/index.test.ts'))).toEqual([]);
        expect(await rules(withTest('whole.test.ts'))).toEqual([]);
        expect(await rules(withTest('features/thing/view/show-thing.test.ts'))).toContain('test-name');
        expect(await rules(withTest('features/thing/model/model.test.ts'))).toContain('test-name');
    });
});

describe('imports', () => {
    it('rejects a deep import into another component', async () => {
        const files = { ...valid(), 'features/thing/view/function.show-thing.ts': valid()['features/thing/view/function.show-thing.ts'].replace("'../model/index.js'", "'../model/component.thing.js'") };
        expect(await rules(files)).toContain('deep-import');
    });

    it('rejects an import of a part from outside its layer, and accepts it through the layer', async () => {
        const withPart = part('inside', 'component.inside', '/** Inside. */\nexport const inside = Symbol();\n');
        const view = (spec: string, from: string): Files => ({
            ...valid(), ...withPart,
            'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + from,
            'features/thing/view/function.show-thing.ts': `import { inside } from '${spec}';\nimport { thing } from '../model/index.js';\n/** Shows. */\nexport const showThing = (): unknown => [inside, thing];\n`,
        });
        expect(await rules(view('../model/inside/index.js', ''))).toContain('nested-import');
        expect(await rules(view('../model/index.js', "export { inside } from './inside/index.js';\n"))).toEqual([]);
    });

    it('rejects a part importing its parent', async () => {
        const files = { ...valid(), ...part('inside', 'component.inside', "import { thing } from '../index.js';\n/** Inside. */\nexport const inside = thing;\n") };
        expect(await rules(files)).toContain('part-imports-parent');
    });

    it('rejects a model importing a view, a port importing elements, and an element importing the model', async () => {
        const model = { ...valid(), 'features/thing/model/component.thing.ts': "import { showThing } from '../view/index.js';\n" + valid()['features/thing/model/component.thing.ts'].replace('Symbol();', 'Symbol(); void showThing;') };
        expect(await rules(model)).toContain('layer-rank');
        const port = {
            ...valid(),
            'features/thing/ports/README.md': readme('ports'),
            'features/thing/ports/index.ts': "export * from './function.connect.js';\n",
            'features/thing/ports/function.connect.ts': "import { thingCard } from '../elements/index.js';\n/** Connects. */\nexport const connect = (): unknown => thingCard;\n",
        };
        expect(await rules(port)).toContain('layer-rank');
        const element = { ...valid(), 'features/thing/elements/element.thing-card.ts': "import { thing } from '../model/index.js';\n/** The card. */\nexport const thingCard = (): unknown => thing;\n" };
        expect(await rules(element)).toContain('layer-rank');
    });

    it('rejects an import cycle between components, also of different features', async () => {
        const pair = (a: string, b: string): Files => ({
            ...valid(),
            [`${a}/model/README.md`]: readme('model'), [`${a}/model/index.ts`]: "export * from './component.a.js';\n",
            [`${a}/model/component.a.ts`]: `import { b } from '${b}';\n/** A. */\nexport const a = b;\n`,
        });
        const cycle = {
            ...pair('features/one', '../../two/model/index.js'), ...without(pair('features/two', '../../one/model/index.js'), 'CLAUDE.md', 'features/thing/model/README.md'),
            'features/two/model/component.a.ts': "import { a as b } from '../../one/model/index.js';\n/** B. */\nexport const a = b;\n",
        };
        expect(await rules(cycle)).toContain('import-cycle');
    });

    it('allows a type-only import to close a cycle', async () => {
        const files = {
            ...valid(),
            'features/thing/model/component.thing.ts': "import type { Shown } from '../view/index.js';\n" + valid()['features/thing/model/component.thing.ts'],
        };
        expect(await rules(files)).not.toContain('import-cycle');
    });
});

describe('purity', () => {
    it('rejects the ECS in an element', async () => {
        const files = { ...valid(), 'features/thing/elements/element.thing-card.ts': "import { Entity } from '@adobe/ecs';\n/** The card. */\nexport const thingCard = (): unknown => Entity.none;\n" };
        expect(await rules(files)).toContain('elements-know-nothing-of-the-ecs');
    });

    it('rejects the GPU, a UI library or the DOM in a model, and allows a comment to mention them', async () => {
        const model = (source: string): Files => ({ ...valid(), 'features/thing/model/component.thing.ts': source + valid()['features/thing/model/component.thing.ts'] });
        expect(await rules(model("import { View } from '@adobe/ecs-gpu';\nvoid View;\n"))).toContain('model-is-headless');
        expect(await rules(model("import { html } from 'lit';\nvoid html;\n"))).toContain('model-is-headless');
        expect(await rules(model('void document.body;\n'))).toContain('model-is-headless');
        expect(await rules(model('// the document is not read here\n'))).toEqual([]);
    });
});

describe('systems', () => {
    const withTick = (extra: Files = {}): Files => ({
        ...valid(),
        'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + "export * from './system.tick.js';\n",
        'features/thing/model/system.tick.ts': "import { System } from '@adobe/ecs';\n\n/** Ticks. */\nexport const tick: System = System.create({}, () => {});\n",
        ...use("import { tick } from './features/thing/model/index.js';\nexport const ticked = tick;\n"),
        ...extra,
    });

    it('requires a system to be listed, run by name or part of a composite', async () => {
        expect(await rules(withTick())).toContain('unlisted-system');
        expect(await rules(withTick({ ...start("import { tick } from './features/thing/model/index.js';\nworld.run(tick);\n") }))).toEqual([]);
        expect(await rules(withTick({ 'app.test.ts': "import { tick } from './features/thing/model/index.js';\nworld.run(tick);\n" }))).toContain('unlisted-system');
        expect(await rules(withTick({ ...start("import { tick } from './features/thing/model/index.js';\nconst composite = { systems: [tick] };\n") }))).toEqual([]);
    });

    const shared = (name: string): string => `import { System } from '@adobe/ecs';\n\n/** ${name}. */\nexport const ${name}: System = System.create({}, () => {});\n`;
    const withPlugin = (name: string, systems = '[]'): Files => {
        const exported = name.replace(/-(.)/g, (_, c: string) => c.toUpperCase());
        return {
            ...valid(),
            [`features/thing/model/plugin.${name}/system.grow.ts`]: shared('grow'),
            [`features/thing/model/plugin.${name}/system.shrink.ts`]: shared('shrink'),
            'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + `export * from './plugin.${name}.js';\n`,
            [`features/thing/model/plugin.${name}.ts`]: `import { grow } from './plugin.${name}/system.grow.js';\nimport { shrink } from './plugin.${name}/system.shrink.js';\n\n/** The thing's model. */\nexport const ${exported} = { systems: ${systems} };\nvoid [grow, shrink];\n`,
            ...start(`import { ${exported} } from './features/thing/model/index.js';\nworld.add(${exported});\n`),
        };
    };

    it('takes the systems a plugin lists as running them', async () => {
        expect(await rules(withPlugin('thing-model', '[grow, shrink]'))).toEqual([]);
        expect(await rules(withPlugin('thing-model', '[grow]'))).toEqual(['unlisted-system']);
    });

    it('names a layer\'s one plugin for its feature and layer', async () => {
        expect(await rules(withPlugin('thing-plugin', '[grow, shrink]'))).toEqual(['plugin-name']);
        const two = withPlugin('thing-model', '[grow, shrink]');
        expect(await rules({
            ...two,
            'features/thing/model/index.ts': two['features/thing/model/index.ts'] + "export * from './plugin.thing-extra.js';\n",
            'features/thing/model/plugin.thing-extra.ts': '/** Another. */\nexport const thingExtra = { systems: [] };\n',
            'features/main/view/entry.start.ts': two['features/main/view/entry.start.ts'] + "import { thingExtra } from '../../thing/model/index.js';\nworld.add(thingExtra);\n",
        })).toContain('plugin-name');
    });
});

describe('internal', () => {
    const constant = "/** Shown. */\nexport const shown = 1;\n";
    const withHide = (hide: string): Files => ({
        ...valid(),
        'features/thing/view/internal/constant.shown.ts': constant,
        'features/thing/view/function.show-thing.ts': "import { shown } from './internal/constant.shown.js';\n" + valid()['features/thing/view/function.show-thing.ts'].replace('thingCard()]', 'thingCard(), shown]'),
        'features/thing/view/index.ts': valid()['features/thing/view/index.ts'] + "export * from './function.hide-thing.js';\n",
        'features/thing/view/function.hide-thing.ts': `${hide}/** Hides a thing. */\nexport const hideThing = (): unknown => ${hide === '' ? '0' : 'shown'};\n`,
        'features/main/view/entry.page.ts': "import { hideThing } from '../../thing/view/index.js';\n" + valid()['features/main/view/entry.page.ts'] + 'hideThing();\n',
    });

    it('holds what several of a component\'s files use, and rejects what one uses', async () => {
        expect(await rules(withHide("import { shown } from './internal/constant.shown.js';\n"))).toEqual([]);
        expect(await rules(withHide(''))).toEqual(['internal-single-use']);
    });

    it('counts the declarations using it, through their parts and other internal files', async () => {
        const twoParts: Files = {
            ...valid(),
            'features/thing/view/internal/constant.shown.ts': constant,
            'features/thing/view/function.show-thing/constant.a.ts': "import { shown } from '../internal/constant.shown.js';\n\n/** A. */\nexport const a = shown;\n",
            'features/thing/view/function.show-thing/constant.b.ts': "import { shown } from '../internal/constant.shown.js';\n\n/** B. */\nexport const b = shown;\n",
            'features/thing/view/function.show-thing.ts': "import { a } from './function.show-thing/constant.a.js';\nimport { b } from './function.show-thing/constant.b.js';\n" + valid()['features/thing/view/function.show-thing.ts'].replace('thingCard()]', 'thingCard(), a, b]'),
        };
        const violations = await check(twoParts);
        expect(violations.map(violation => [violation.rule, violation.problem])).toEqual([['internal-single-use', expect.stringContaining('used only by')]]);
        const relay = "import { relay as shown } from './internal/constant.relay.js';\n";
        const through = {
            ...withHide(relay),
            'features/thing/view/function.show-thing.ts': relay + valid()['features/thing/view/function.show-thing.ts'].replace('thingCard()]', 'thingCard(), shown]'),
            'features/thing/view/internal/constant.relay.ts': "import { shown } from './constant.shown.js';\n\n/** Shown, relayed. */\nexport const relay = shown;\n",
        };
        expect(await rules(through)).toEqual([]);
    });

    it('checks only a file directly in internal/, not the parts of a declaration there', async () => {
        const files = {
            ...withHide("import { shown } from './internal/constant.shown.js';\n"),
            'features/thing/view/internal/constant.shown.ts': "import { base } from './constant.shown/constant.base.js';\n\n/** Shown. */\nexport const shown = base;\n",
            'features/thing/view/internal/constant.shown/constant.base.ts': '/** The base. */\nexport const base = 1;\n',
        };
        expect(await rules(files)).toEqual([]);
    });

    it('lets only its declaration, its other parts and tests import a part', async () => {
        const files: Files = {
            ...valid(),
            'features/thing/view/function.show-thing/constant.size.ts': '/** The size. */\nexport const size = 1;\n',
            'features/thing/view/function.show-thing/constant.shown.ts': "import { size } from './constant.size.js';\n\n/** Shown. */\nexport const shown = size;\n",
            'features/thing/view/function.show-thing.ts': "import { shown } from './function.show-thing/constant.shown.js';\n" + valid()['features/thing/view/function.show-thing.ts'].replace('thingCard()]', 'thingCard(), shown]'),
            'features/thing/view/function.show-thing.test.ts': "import { size } from './function.show-thing/constant.size.js';\nvoid size;\n",
        };
        expect(await rules(files)).toEqual([]);
        const reached = {
            ...files,
            'features/thing/view/index.ts': valid()['features/thing/view/index.ts'] + "export * from './function.hide-thing.js';\n",
            'features/thing/view/function.hide-thing.ts': "import { size } from './function.show-thing/constant.size.js';\n\n/** Hides a thing. */\nexport const hideThing = (): number => size;\n",
            'features/main/view/entry.page.ts': "import { hideThing } from '../../thing/view/index.js';\n" + valid()['features/main/view/entry.page.ts'] + 'hideThing();\n',
        };
        expect(await rules(reached)).toEqual(['parts-reach']);
    });

    it('takes a composite\'s parts in a folder beside it, with no index, as run through it', async () => {
        const part = (name: string): string => `import { System } from '@adobe/ecs';\n\n/** ${name}. */\nexport const ${name}: System = System.create({}, () => {});\n`;
        const files: Files = {
            ...valid(),
            'features/thing/view/system.show-things/system.grow.ts': part('grow'),
            'features/thing/view/system.show-things/system.shrink.ts': part('shrink'),
            'features/thing/view/system.show-things.ts': "import { System } from '@adobe/ecs';\nimport { grow } from './system.show-things/system.grow.js';\nimport { shrink } from './system.show-things/system.shrink.js';\n\n/** Shows things. */\nexport const showThings: System = System.create([grow, shrink]);\n",
            'features/thing/view/index.ts': valid()['features/thing/view/index.ts'] + "export * from './system.show-things.js';\n",
            ...start("import { showThings } from './features/thing/view/index.js';\nworld.run(showThings);\n"),
        };
        expect(await rules(files)).toEqual([]);
        expect(await rules({ ...files, 'features/thing/view/system.show-things.ts': (files['features/thing/view/system.show-things.ts'] ?? '').replace('[grow, shrink]', '[grow]') })).toEqual(['unlisted-system']);
    });
});

describe('exports', () => {
    const withExtra = (extra = ''): Files => ({
        ...valid(),
        'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + "export * from './constant.unused.js';\n",
        'features/thing/model/constant.unused.ts': `${extra}/** Nobody reads it. */\nexport const unused = 1;\n`,
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
            'features/thing/model/index.ts': valid()['features/thing/model/index.ts'],
            ...part('inside', 'constant.shared', '/** Shared. */\nexport const shared = 1;\n', ''),
        };
        // `shared` is exported by `inside`, which nothing outside it uses (the model's index doesn't pass it up)
        expect(await rules(files)).toContain('unused-export');
    });
});

describe('what the first version of the check let through', () => {
    const modelWith = (source: string): Files => ({ ...valid(), 'features/thing/model/component.thing.ts': source + valid()['features/thing/model/component.thing.ts'] });

    it('rejects a model that reaches a view by a dynamic import, or a port that imports the GPU', async () => {
        expect(await rules(modelWith("void import('../view/index.js');\n"))).toContain('layer-rank');
        const port = {
            ...valid(),
            'features/thing/ports/README.md': readme('ports'),
            'features/thing/ports/index.ts': "export * from './function.connect.js';\n",
            'features/thing/ports/function.connect.ts': "import { Frame } from '@adobe/ecs-gpu';\n/** Connects. */\nexport const connect = (): unknown => Frame;\n",
        };
        expect(await rules(port)).toContain('ports-no-gpu');
    });

    it('rejects a model that fetches, sets timers or reads the clock, and allows names it declares itself', async () => {
        for (const source of ['void fetch("x");\n', 'setTimeout(() => {}, 1);\n', 'void Date.now();\n', 'void globalThis;\n']) {
            expect(await rules(modelWith(source)), source).toContain('model-is-headless');
        }
        const after = (source: string): Files => ({ ...valid(), 'features/thing/model/component.thing.ts': valid()['features/thing/model/component.thing.ts'] + source });
        expect(await rules(after('const window = { size: 1 };\nvoid window;\n'))).toEqual([]);
        expect(await rules(after('const view = { navigator: 1 };\nvoid view.navigator;\n'))).toEqual([]);
    });

    it('rejects an index that re-exports from outside the component', async () => {
        const files = { ...valid(), 'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + "export * from '../view/function.show-thing.js';\n" };
        expect(await rules(files)).toContain('index-is-only-re-exports');
    });

    it('rejects a root file that exports a second name of any kind', async () => {
        for (const extra of ['export interface Extra { readonly a: number }\n', 'export enum Mode { A }\n', 'export const other = 1, more = 2;\n']) {
            const files = { ...valid(), 'features/thing/model/component.thing.ts': valid()['features/thing/model/component.thing.ts'] + extra };
            expect(await rules(files), extra).toContain('file-exports-its-name');
        }
    });

    it('requires a system to be typed as its interface, with void for no input', async () => {
        const tick = (type: string): Files => ({
            ...valid(),
            'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + "export * from './system.tick.js';\n",
            'features/thing/model/system.tick.ts': `import { System } from '@adobe/ecs';\n\n/** Ticks. */\nexport const tick${type} = System.create({}, () => {});\n`,
            ...start("import { tick } from './features/thing/model/index.js';\nworld.run(tick);\n"),
        });
        expect(await rules(tick(': System'))).toEqual([]);
        expect(await rules(tick(': System<{ readonly n: number }>'))).toEqual([]);
        expect(await rules(tick(''))).toContain('system-typed');
        expect(await rules(tick(': System<undefined>'))).toContain('system-typed');
    });

    it('finds a system nobody runs in a private systems folder', async () => {
        const dead = {
            ...valid(),
            'features/thing/model/systems/system.dead.ts': "import { System } from '@adobe/ecs';\n\n/** Dead. */\nexport const dead: System = System.create({}, () => {});\n",
        };
        expect(await rules(dead)).toContain('unlisted-system');
        const listed = {
            ...dead,
            'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + "export * from './system.all.js';\n",
            'features/thing/model/system.all.ts': "import { System } from '@adobe/ecs';\nimport { dead } from './systems/system.dead.js';\n\n/** All. */\nexport const all: System = System.create([dead]);\n",
            ...start("import { all } from './features/thing/model/index.js';\nworld.run(all);\n"),
        };
        expect(await rules(listed)).toEqual([]);
    });

    it('does not take a same-named local variable for a use of an export', async () => {
        const files = {
            ...valid(),
            'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + "export * from './constant.unused.js';\n",
            'features/thing/model/constant.unused.ts': '/** Nobody imports it. */\nexport const unused = 1;\n',
            ...use('const unused = 2;\nexport const other = unused;\n'),
        };
        expect(await rules(files)).toContain('unused-export');
    });

    it('rejects a feature that holds other folders beside its layers', async () => {
        expect(await rules({ ...valid(), 'features/thing/scratch/function.x.ts': 'export {};\n' })).toContain('feature-contents');
    });

    it('reads a README with Windows line endings', async () => {
        expect(await rules({ ...valid(), 'features/thing/model/README.md': '# model\r\n\r\nA summary.\r\n' })).toEqual([]);
    });
});

describe('systems, found through imports', () => {
    const tickFile = "import { System } from '@adobe/ecs';\n\n/** Ticks. */\nexport const tick: System = System.create({}, () => {});\n";
    const withTick = (extra: Files): Files => ({
        ...valid(),
        'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + "export * from './system.tick.js';\n",
        'features/thing/model/system.tick.ts': tickFile,
        ...use("import { tick } from './features/thing/model/index.js';\nexport const ticked = tick;\n"),
        ...extra,
    });

    it('follows an import renamed and re-exported through an index to the system it names', async () => {
        expect(await rules(withTick({ ...start("import { tick as step } from './features/thing/model/index.js';\ndeclare const world: { run(system: unknown): void };\nworld.run(step);\n") }))).toEqual([]);
    });

    it('takes a world.add of the system as running it', async () => {
        expect(await rules(withTick({ ...start("import { tick } from './features/thing/model/index.js';\ndeclare const world: { add(system: unknown): void };\nworld.add(tick);\n") }))).toEqual([]);
    });

    it('doesn\'t take a run of another binding of the same name for a run of the system', async () => {
        expect(await rules(withTick({ ...start("const tick = 1;\ndeclare const world: { run(system: unknown): void };\nworld.run(tick);\n") }))).toContain('unlisted-system');
    });
});

describe('configuration', () => {
    it('takes the layers and kinds it\'s given', async () => {
        const files: Files = {
            'features/thing/core/README.md': readme('core'),
            'features/thing/core/index.ts': "export * from './shader.thing.js';\n",
            'features/thing/core/shader.thing.ts': '/** A shader. */\nexport const thing = "";\n',
            'features/main/core/README.md': readme('core'),
            'features/main/core/index.ts': 'export {};\n',
            'features/main/core/entry.demo.ts': "import { thing } from '../../thing/core/index.js';\n\nconsole.log(thing);\n",
        };
        expect(await rules(files)).toContain('layer-name');
        expect(await check(files, { layers: { core: ['core'] }, kinds: ['shader'] })).toEqual([]);
    });

    it('takes any modifiers before a kind, and still rejects an unknown kind', async () => {
        const named = (name: string): Files => ({
            ...without(valid(), 'features/thing/model/component.thing.ts'),
            'features/thing/model/index.ts': `export * from './${name.replace(/\.ts$/, '.js')}';\n`,
            [`features/thing/model/${name}`]: valid()['features/thing/model/component.thing.ts'],
        });
        expect(await rules(named('persistent.component.thing.ts'))).toEqual([]);
        expect(await rules(named('ui.input.component.thing.ts'))).toEqual([]);
        expect(await rules(named('persistent.widget.thing.ts'))).toContain('file-name');
    });

    it('lets only tests and test features import a test feature', async () => {
        const helper: Files = {
            'test/thing/model/README.md': readme('model'),
            'test/thing/model/index.ts': "export * from './function.thing-of.js';\n",
            'test/thing/model/function.thing-of.ts': "import { thing } from '../../../features/thing/model/index.js';\n/** The thing. */\nexport const thingOf = (): symbol => thing;\n",
        };
        const tested: Files = { ...valid(), ...helper, 'features/thing/model/index.test.ts': "import { thingOf } from '../../../test/thing/model/index.js';\nvoid thingOf;\n" };
        expect(await rules(tested)).toEqual([]);
        const used: Files = { ...tested, 'features/main/view/entry.page.ts': "import { thingOf } from '../../../test/thing/model/index.js';\n" + valid()['features/main/view/entry.page.ts'] + 'thingOf();\n' };
        expect(await rules(used)).toEqual(['test-feature-import']);
    });

    it('checks the imports a layer may make by the layers it\'s given', async () => {
        const files: Files = {
            ...valid(),
            'features/thing/elements/element.thing-card.ts': "import { thing } from '../model/index.js';\n/** The card. */\nexport const thingCard = (): unknown => thing;\n",
        };
        expect(await rules(files)).toContain('layer-rank');
        const layers = { elements: ['elements', 'model'], model: ['model'], view: ['model', 'elements', 'view'] };
        expect((await check(files, { layers })).map(violation => violation.rule)).toEqual([]);
    });
});

describe('tests', () => {
    it('may import any file by its path, and never make an export used, but a test feature\'s', async () => {
        const files: Files = {
            ...valid(),
            'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + "export * from './constant.unused.js';\n",
            'features/thing/model/constant.unused.ts': '/** Only a test reads it. */\nexport const unused = 1;\n',
            'features/thing/elements/index.test.ts': "import { unused } from '../model/index.js';\nvoid unused;\n",
        };
        expect(await rules(files)).toEqual(['unused-export']);
        const byPath = { ...valid(), 'features/thing/elements/index.test.ts': "import { thing } from '../model/component.thing.js';\nimport { size } from '../view/function.show-thing/constant.size.js';\nvoid [thing, size];\n", 'features/thing/view/function.show-thing/constant.size.ts': '/** Its size. */\nexport const size = 1;\n' };
        expect(await rules(byPath)).toEqual([]);
        const testFeature: Files = {
            ...valid(),
            'test/thing/model/README.md': readme('model'),
            'test/thing/model/index.ts': "export * from './function.thing-of.js';\n",
            'test/thing/model/function.thing-of.ts': "import { thing } from '../../../features/thing/model/index.js';\n/** The thing. */\nexport const thingOf = (): symbol => thing;\n",
            'features/thing/model/index.test.ts': "import { thingOf } from '../../../test/thing/model/index.js';\nvoid thingOf;\n",
        };
        expect(await rules(testFeature)).toEqual([]);
    });
});

describe('what review found', () => {
    const tickFile = "import { System } from '@adobe/ecs';\n\n/** Ticks. */\nexport const tick: System = System.create({}, () => {});\n";
    const withTick = (extra: Files): Files => ({
        ...valid(),
        'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + "export * from './system.tick.js';\n",
        'features/thing/model/system.tick.ts': tickFile,
        ...use("import { tick } from './features/thing/model/index.js';\nexport const ticked = tick;\n"),
        ...extra,
    });
    const modelWith = (source: string): Files => ({ ...valid(), 'features/thing/model/component.thing.ts': valid()['features/thing/model/component.thing.ts'] + source });

    it('counts a run through a namespace import, and not one of a parameter shadowing the import', async () => {
        expect(await rules(withTick({ ...start("import * as model from './features/thing/model/index.js';\ndeclare const world: { run(system: unknown): void };\nworld.run(model.tick);\n") }))).toEqual([]);
        const shadowed = "import { tick } from './features/thing/model/index.js';\ndeclare const world: { run(system: unknown): void };\nconst execute = (tick: unknown): void => world.run(tick);\nvoid [execute, tick];\n";
        expect(await rules(withTick({ ...start(shadowed) }))).toContain('unlisted-system');
    });

    it('reads no global from an imported name, a local Date, or a name declared only in another function', async () => {
        expect((await rules(modelWith("import { fetch as load } from './component.thing.js';\nvoid load;\n"))).filter(rule => rule === 'model-is-headless')).toEqual([]);
        expect(await rules(modelWith('const clock = (): number => { const Date = { now: () => 1 }; return Date.now(); };\nvoid clock;\n'))).toEqual([]);
        expect(await rules(modelWith('const one = (fetch: () => void): void => fetch();\nconst two = (): void => { void fetch; };\nvoid [one, two];\n'))).toContain('model-is-headless');
    });

    it('rejects a root file that re-exports beside its export', async () => {
        expect(await rules({ ...valid(), 'features/thing/model/component.thing.ts': valid()['features/thing/model/component.thing.ts'] + "export { showThing } from '../view/index.js';\n" })).toContain('file-exports-its-name');
    });

    it('allows a chain of declarations above the export that the export needs as it loads', async () => {
        const files: Files = {
            ...valid(),
            'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + "export * from './constant.value.js';\n",
            'features/thing/model/constant.value.ts': 'const first = 1;\nconst second = first + 1;\n\n/** A value. */\nexport const value = second;\n',
            ...use("import { value } from './features/thing/model/index.js';\nexport const read = value;\n"),
        };
        expect(await rules(files)).toEqual([]);
    });

    it('counts a part\'s export the parent passes on under another name as used', async () => {
        const files: Files = {
            ...valid(),
            ...part('inside', 'constant.shared', '/** Shared. */\nexport const shared = 1;\n'),
            'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + "export { shared as common } from './inside/index.js';\n",
            ...use("import { common } from './features/thing/model/index.js';\nexport const read = common;\n"),
        };
        expect(await rules(files)).toEqual([]);
    });

    it('takes a type-only named re-export as no runtime dependency, and a dynamic import as a use of every export', async () => {
        const typeOnly = { ...valid(), 'features/thing/model/component.thing.ts': "export { type Shown } from '../view/index.js';\n" + valid()['features/thing/model/component.thing.ts'] };
        expect(await rules(typeOnly)).not.toContain('import-cycle');
        const dynamic: Files = {
            ...valid(),
            'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + "export * from './constant.lazy.js';\n",
            'features/thing/model/constant.lazy.ts': '/** Loaded later. */\nexport const lazy = 1;\n',
            ...use("export const later = async (): Promise<number> => (await import('./features/thing/model/index.js')).lazy;\n"),
        };
        expect(await rules(dynamic)).toEqual([]);
    });
});

describe('derived components', () => {
    const glow = "import { Component } from '@adobe/ecs';\nimport { thing } from './component.thing.js';\n\n/** A glow. */\nexport const glow = Symbol();\n\ndeclare module '@adobe/ecs' {\n    interface Components {\n        [glow]: { type: true; derived: true };\n    }\n}\n\nComponent.derive(glow, { from: [thing] });\n";
    const withGlow = (files: Files): Files => ({ ...files, 'features/thing/model/component.glow.ts': glow, 'features/thing/model/index.ts': files['features/thing/model/index.ts'] + "export * from './component.glow.js';\n", ...use("import { glow } from './features/thing/model/index.js';\nexport const glowing = glow;\n") });
    it('are derived in the file that declares them', async () => {
        expect(await rules(withGlow(valid()))).toEqual([]);
    });
    it('rejects Component.derive anywhere else, saying where it belongs', async () => {
        const files = withGlow(valid());
        const moved = {
            ...files,
            'features/thing/model/component.glow.ts': glow.replace("import { Component } from '@adobe/ecs';\nimport { thing } from './component.thing.js';\n\n", '').replace('\nComponent.derive(glow, { from: [thing] });\n', ''),
            'features/thing/model/component.thing.ts': "import { Component } from '@adobe/ecs';\nimport { glow } from './component.glow.js';\n\n" + files['features/thing/model/component.thing.ts'] + '\nComponent.derive(glow, { from: [thing] });\n',
        };
        const violations = await check(moved);
        expect(violations.map(violation => [violation.file, violation.rule, violation.problem, violation.fix])).toEqual([[
            'features/thing/model/component.thing.ts', 'derive-beside-component',
            '`Component.derive(glow, ...)` derives a component declared in features/thing/model/component.glow.ts, not this file.',
            "Move it into features/thing/model/component.glow.ts, below `export const glow = Symbol()` and its declare module entry: a derived component is defined where it's declared, so whoever imports it gets its derivations.",
        ]]);
    });
});

describe('what the second review found', () => {
    const modelWith = (source: string): Files => ({ ...valid(), 'features/thing/model/component.thing.ts': valid()['features/thing/model/component.thing.ts'] + source });

    it('reads a global in a destructuring default, and not in a var a nested block declares for its function', async () => {
        expect(await rules(modelWith('export const read = (options: { value?: unknown }): unknown => { const { value = document } = options; return value; };\n'))).toContain('model-is-headless');
        expect(await rules(modelWith('const clock = (): number => { if (Math.random() > 2) { var Date = { now: () => 1 }; } return Date.now(); };\nvoid clock;\n'))).toEqual([]);
    });
});

describe('what the third review found', () => {
    it('counts a type named through an import type as a use of its export', async () => {
        const files: Files = {
            ...valid(),
            'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + "export * from './type.shape.js';\n",
            'features/thing/model/type.shape.ts': '/** A shape. */\nexport type Shape = { readonly size: number };\n',
            ...use("export const size = (shape: import('./features/thing/model/index.js').Shape): number => shape.size;\n"),
        };
        expect(await rules(files)).toEqual([]);
    });
});

describe('what the fourth review found', () => {
    it('finds a cycle through an index\'s re-export of a part', async () => {
        const cycle: Files = {
            ...valid(),
            'features/thing/model/a/README.md': readme('a'),
            'features/thing/model/a/index.ts': "export { inner } from './inner/index.js';\n",
            'features/thing/model/a/inner/index.ts': "export * from './constant.inner.js';\n",
            'features/thing/model/a/inner/constant.inner.ts': "import { b } from '../../b/index.js';\n\n/** Inner. */\nexport const inner = b;\n",
            'features/thing/model/b/README.md': readme('b'),
            'features/thing/model/b/index.ts': "export * from './constant.b.js';\n",
            'features/thing/model/b/constant.b.ts': "import { inner } from '../a/index.js';\n\n/** B. */\nexport const b = 1;\nvoid inner;\n",
        };
        expect(await rules(cycle)).toContain('import-cycle');
    });

    it('keeps a static block\'s var to the block', async () => {
        const model = { ...valid(), 'features/thing/model/component.thing.ts': valid()['features/thing/model/component.thing.ts'] + 'const read = (): number => { class Local { static { var Date = 0; void Date; } } void Local; return Date.now(); };\nvoid read;\n' };
        expect(await rules(model)).toContain('model-is-headless');
    });
});

describe('what the sixth review found', () => {
    it('follows System.create imported under another name', async () => {
        const tickFile = "import { System } from '@adobe/ecs';\n\n/** Ticks. */\nexport const tick: System = System.create({}, () => {});\n";
        const files: Files = {
            ...valid(),
            'features/thing/model/index.ts': valid()['features/thing/model/index.ts'] + "export * from './system.tick.js';\n",
            'features/thing/model/system.tick.ts': tickFile,
            ...start("import { System as RuntimeSystem } from '@adobe/ecs';\nimport { tick } from './features/thing/model/index.js';\nvoid RuntimeSystem.create([tick]);\n"),
        };
        expect(await rules(files)).toEqual([]);
    });
});
