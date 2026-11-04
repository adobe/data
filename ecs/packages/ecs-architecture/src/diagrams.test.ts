// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from 'vitest';
import { diagrams } from './diagrams.js';
import { describedBy, maxDescription, reduce, start, summaryOf } from './implementation/diagram-text.js';

type Files = Readonly<Record<string, string>>;

const readme = (name: string, summary: string, more = ''): string => `# ${name}\n\n${summary}\n${more ? `\n${more}\n` : ''}`;
const layer = (path: string, summary: string, body = '', imports: readonly string[] = []): Files => ({
    [`${path}/README.md`]: readme(path, summary, 'More about it.'),
    [`${path}/index.ts`]: "export * from './constant.thing.js';\n",
    [`${path}/constant.thing.ts`]: `${imports.map(spec => `import { thing } from '${spec}';`).join('\n')}\nexport const thing = ${body || '1'};\n`,
});

/** base is used by mid (which has a model and a view) and by top; an app puts top together. */
const app = (): Files => ({
    ...layer('base/model', 'The base of everything.'),
    ...layer('mid/model', 'Mid data.', '1', ['../../base/model/index.js']),
    ...layer('mid/view', 'Mid drawing.', '1', ['../model/index.js']),
    ...layer('top/model', 'Top level things.', '1', ['../../mid/view/index.js', '../../base/model/index.js']),
    'samples/demo/sample.ts': "import { thing } from '../../top/model/index.js';\nexport const demo = thing;\n",
});
const render = (files: Files) => diagrams(files);
const after = (files: Files, updates: Files): Files => ({ ...files, ...updates });

describe('reading a sentence', () => {
    it('takes the first sentence of the first paragraph under the heading, as plain text', () => {
        expect(summaryOf('# name\n\nThe `keys` held. And more.\n\nAnother paragraph.\n')).toBe('The keys held');
        expect(summaryOf('# name\n\n> a quote\n\nThe thing.\n')).toBe('The thing');
        expect(summaryOf('# name\n')).toBe('');
    });

    it('takes a document\'s own description from its first quote line', () => {
        expect(describedBy('# name\n\n> Select and sculpt.\n\ntext')).toBe('Select and sculpt');
        expect(describedBy('# name\n\ntext')).toBeUndefined();
    });
});

describe('leaving out an arrow a longer path implies', () => {
    it('keeps the direct arrows and drops the implied one', () => {
        expect(reduce([['a', 'b'], ['b', 'c'], ['a', 'c']])).toEqual([['a', 'b'], ['b', 'c']]);
        expect(reduce([['a', 'b'], ['a', 'c']])).toEqual([['a', 'b'], ['a', 'c']]);
    });
});

describe('the top diagram', () => {
    const { updates, problems } = render(app());
    const root = updates['ARCHITECTURE.md'];

    it('has a box for each feature and each app, with arrows from what uses to what is used', () => {
        expect(problems).toEqual([]);
        expect(root).toContain('flowchart TB');
        expect(root).toContain('app_3a_samples_2f_demo["<b>demo</b>"]:::app');
        expect(root).toContain('base["<b>base</b><br/><i>The base of everything</i>"]:::feature');
        expect(root).toContain('app_3a_samples_2f_demo --> top');
        expect(root).toContain('top --> mid');
        expect(root).toContain('mid --> base');
    });

    it('leaves out an arrow another path implies', () => {
        expect(root).not.toContain('top --> base');
    });

    it('holds the features that use nothing on the bottom row, and only them', () => {
        expect(root).toContain('base ~~~ ground');
        expect(root).not.toContain('mid ~~~ ground');
        expect(root).not.toContain('top ~~~ ground');
    });

    it('links a feature with several layers to its document and one with a single layer to that layer\'s README', () => {
        expect(root).toContain('click mid "mid/ARCHITECTURE.md"');
        expect(root).toContain('click base "base/model/README.md"');
        expect(root).toContain('| [mid](mid/ARCHITECTURE.md) |');
    });
});

describe('a feature\'s document', () => {
    const files = app();
    const { updates } = render(files);
    const mid = updates['mid/ARCHITECTURE.md'];

    it('is made for a feature with more than one layer, and not for one with a single layer', () => {
        expect(mid).toContain('# mid');
        expect(mid).toContain('> Mid data.');
        expect(updates['base/ARCHITECTURE.md']).toBeUndefined();
        expect(updates['top/ARCHITECTURE.md']).toBeUndefined();
    });

    it('draws its layers, the arrows between them, and the features it uses', () => {
        expect(mid).toContain('mid_2f_view --> mid_2f_model');
        expect(mid).toContain('mid_2f_model --> uses__base');
        expect(mid).toContain('uses__base["<b>base</b>');
        expect(mid).toContain('click mid_2f_view "view/README.md"');
        expect(mid).toContain('click uses__base "../base/model/README.md"');
    });

    it('keeps what people wrote around the diagram, and is the same when made again', () => {
        const written = '# mid\n\n> A hand-written description.\n\nA note before.\n\n' + `${start}\nold\n<!-- architecture:end -->\n\nA note after.\n`;
        const again = render(after(after(files, updates), { 'mid/ARCHITECTURE.md': written }));
        const text = again.updates['mid/ARCHITECTURE.md'];
        expect(text).toContain('> A hand-written description.');
        expect(text).toContain('A note before.');
        expect(text).toContain('A note after.');
        expect(text).toContain('mid_2f_view --> mid_2f_model');
        const third = render(after(after(files, updates), again.updates));
        expect(third.updates).toEqual({});
    });
});

describe('what a person has to fix', () => {
    it('asks for a description a feature lacks and one that is too long', () => {
        const none = render({ ...app(), 'base/model/README.md': '# base model\n' });
        expect(none.problems.join('\n')).toContain('`base` has no description');
        const long = render({ ...app(), 'base/model/README.md': readme('base model', 'x'.repeat(maxDescription + 1) + '.') });
        expect(long.problems.join('\n')).toContain('`base`\'s description is');
    });
});

describe('the parts of a big layer', () => {
    const parts = (names: readonly string[]): Files => Object.fromEntries(names.flatMap((name, i) => Object.entries(layer(`mid/model/${name}`, `${name}.`, '1', i > 0 ? [`../${names[i - 1]}/index.js`] : []))));

    it('are drawn in the layer\'s README when there are enough of them, with the arrows between them', () => {
        const { updates } = render({ ...app(), ...parts(['one', 'two', 'three']) });
        const text = updates['mid/model/README.md'];
        expect(text).toContain(start);
        expect(text).toContain('mid_2f_model_2f_three --> mid_2f_model_2f_two');
        expect(text).toContain('mid_2f_model_2f_two --> mid_2f_model_2f_one');
        expect(text).toContain('More about it.');
    });

    it('are not drawn when there are few', () => {
        const { updates } = render({ ...app(), ...parts(['one', 'two']) });
        expect(updates['mid/model/README.md']).toBeUndefined();
    });
});

describe('tests', () => {
    it('draw no arrows: what a test imports is no use of the code', () => {
        const { updates } = render({ ...app(), 'base/model/model.test.ts': "import { thing } from '../../top/model/index.js';\nvoid thing;\n" });
        expect(updates['ARCHITECTURE.md']).not.toContain('base --> top');
    });
});

describe('node ids', () => {
    it('are distinct for distinct paths, so two features never share a box', () => {
        const { updates } = render({ ...layer('foo-bar/model', 'One.'), ...layer('foo/bar/model', 'Two.') });
        const root = updates['ARCHITECTURE.md'] ?? '';
        expect(root).toContain('foo_2d_bar["<b>foo-bar</b>');
        expect(root).toContain('foo_2f_bar["<b>foo/bar</b>');
    });
});

describe('a layer with fewer parts', () => {
    it('loses its parts diagram once it has too few, keeping what people wrote', () => {
        const three = Object.fromEntries(['one', 'two', 'three'].flatMap(name => Object.entries(layer(`mid/model/${name}`, `${name}.`))));
        const drawn = render({ ...app(), ...three }).updates['mid/model/README.md'] ?? '';
        expect(drawn).toContain(start);
        const two = Object.fromEntries(Object.entries(three).filter(([path]) => !path.startsWith('mid/model/three/')));
        const text = render({ ...app(), ...two, 'mid/model/README.md': drawn }).updates['mid/model/README.md'];
        expect(text).toBe(app()['mid/model/README.md']);
    });

    it('draws parts beneath a folder that isn\'t a component', () => {
        const parts = Object.fromEntries(['a/one', 'a/two', 'three'].flatMap(name => Object.entries(layer(`mid/model/${name}`, 'A part.'))));
        const text = render({ ...app(), ...parts }).updates['mid/model/README.md'] ?? '';
        expect(text).toContain('<b>one</b>');
        expect(text).toContain('<b>two</b>');
    });
});
