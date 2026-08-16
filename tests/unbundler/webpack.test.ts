import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from '@babel/parser'
import traverse, { type NodePath } from '@babel/traverse'
import generate from '@babel/generator'
import * as t from '@babel/types'

import { webpackStrategy } from '../../src/unbundler/webpack'
import { detectBundle, unbundle } from '../../src/unbundler/index'
import type { TransformContext } from '../../src/unbundler/types'
import { WEBPACK_HELPER_ID } from '../../src/unbundler/webpack-helper'
import {
    buildWebpackBundle,
    buildBrowserifyBundle,
    genChainModules,
    genBrowserifyModules,
    minify,
} from './fixtures'

// ---- transform 层辅助：绕过 95% 占比门槛，直接对模块属性调用 strategy.transform ----
async function transformModule(
    source: string,
    id = '1',
    options: { minify?: boolean; params?: string[] } = {}
): Promise<{
    ast: t.Program
    deps: Set<string>
    tips: TransformContext['tips']
    helpers: Set<string>
}> {
    const {
        minify: useMinify = true,
        params = ['module', 'exports', 'require'],
    } = options
    const body = useMinify ? await minify(source) : source
    const code = `var x = ({ ${id}: function (${params.join(', ')}) { ${body} } });`
    const ast = parse(code)
    let propPath: NodePath<t.ObjectProperty> | null = null
    traverse(ast, {
        ObjectProperty(path) {
            if (
                path.node.key.type === 'NumericLiteral' ||
                path.node.key.type === 'StringLiteral'
            ) {
                if (String(path.node.key.value) === id) propPath = path
            }
        },
    })
    assert.ok(propPath, 'module property not found')
    const ctx: TransformContext = {
        tips: [],
        helpers: new Set(),
        rewrite: id => id + '.cjs',
    }
    const result = webpackStrategy.transform(ctx, id as never, propPath)
    return {
        ast: result.ast,
        deps: result.dependcies as Set<string>,
        tips: ctx.tips,
        helpers: ctx.helpers,
    }
}

describe('detectBundle', () => {
    test('webpack bundle detected', async () => {
        const bundle = await buildWebpackBundle(genChainModules(100))
        assert.equal(detectBundle(bundle), 'webpack')
    })

    test('browserify bundle is not misdetected as webpack', async () => {
        const bundle = await buildBrowserifyBundle(genBrowserifyModules(100))
        assert.equal(detectBundle(bundle), 'browserify')
    })

    test('plain JS file -> unknown', () => {
        assert.equal(detectBundle(`var a = 1; console.log(a);`), 'unknown')
    })

    test('unparseable file -> unknown (no crash)', () => {
        assert.equal(detectBundle(`function {`), 'unknown')
    })

    test('small modules table (<95%) -> unknown', async () => {
        const bundle = await buildWebpackBundle({ '1': `exports.x = 1;` })
        assert.equal(detectBundle(bundle), 'unknown')
    })
})

describe('webpack transform: require rewriting', () => {
    test('numeric id -> ./id.cjs, dependency recorded', async () => {
        const { ast, deps } = await transformModule(
            `var a = require(2); exports.x = a;`
        )
        assert.match(generate(ast).code, /require\("\.\/2\.cjs"\)/)
        assert.deepEqual([...deps], ['2'])
    })

    test('string id -> ./id.cjs', async () => {
        const { ast, deps } = await transformModule(
            `var a = require("7"); exports.x = a;`
        )
        assert.match(generate(ast).code, /require\("\.\/7\.cjs"\)/)
        assert.deepEqual([...deps], ['7'])
    })

    test('short import name renamed to import_{id}', async () => {
        const { ast } = await transformModule(
            `var a = require(3); exports.x = a.foo;`
        )
        assert.match(generate(ast).code, /import_3\.foo/)
    })

    test('require as call argument -> tip require_as_arg', async () => {
        const { tips } = await transformModule(
            `var d = require(9); fn(require);`
        )
        assert.ok(tips.some(tip => tip.type === 'require_as_arg'))
    })

    test('require(2) as nested call argument is still rewritten (callee role)', async () => {
        const { ast, deps } = await transformModule(`fn(require(2));`)
        assert.deepEqual([...deps], ['2'])
        assert.match(generate(ast).code, /require\("\.\/2\.cjs"\)/)
    })

    test('require as bare identifier -> tip require_ref', async () => {
        const { tips } = await transformModule(
            `var d = require(9); var x = require;`
        )
        assert.ok(tips.some(tip => tip.type === 'require_ref'))
    })

    test('require.something() with multi-arg -> pass (callee is member of require)', async () => {
        // require 形参作为成员调用的 object（如 require.resolve(2, 3)）不报 tip
        const { tips } = await transformModule(
            `var d = require(9); require.resolve(2, 3);`
        )
        assert.equal(
            tips.some(tip => tip.type === 'require_as_arg'),
            false
        )
    })

    test('computed member on require -> tip wrong_member', async () => {
        const { tips } = await transformModule(
            `var d = require(9); var k = 'r'; var x = require[k];`
        )
        assert.ok(tips.some(tip => tip.type === 'wrong_member'))
    })
})

describe('webpack transform: helpers', () => {
    // 注：detectCjsRoles 只在 require 被直接调用（require(id)）时才识别角色，
    // helper 成员访问（require.r 等）本身不足以建立角色。
    // 真实 webpack 产物中模块几乎都含直接 require 调用，样本需模拟这一形态。
    const withRequireCall = (body: string) => `var dep = require(2); ${body}`

    test('helper r with exports -> removed (harmony marker is meaningless in a single file)', async () => {
        const { ast, helpers } = await transformModule(
            withRequireCall(`require.r(exports); exports.x = 1;`)
        )
        assert.equal(helpers.has('r'), false)
        assert.doesNotMatch(generate(ast).code, /require\.r|requireR/)
    })

    test('helper r with non-exports arg -> requireR patch', async () => {
        const { ast, helpers } = await transformModule(
            withRequireCall(`require.r(other); exports.x = 1;`)
        )
        assert.ok(helpers.has('r'))
        assert.match(generate(ast).code, /requireR\(other\)/)
    })

    test('helper o -> Object.prototype.hasOwnProperty.call', async () => {
        const { ast } = await transformModule(
            withRequireCall(`if (require.o(obj, "k")) { exports.x = 1; }`)
        )
        assert.match(
            generate(ast).code,
            /Object\.prototype\.hasOwnProperty\.call/
        )
    })

    test('helper g -> globalThis', async () => {
        const { ast } = await transformModule(
            withRequireCall(`exports.g = require.g;`)
        )
        assert.match(generate(ast).code, /globalThis/)
    })

    test('helper amdO -> empty object', async () => {
        const { ast } = await transformModule(
            withRequireCall(`var x = require.amdO;`)
        )
        assert.match(generate(ast).code, /x = \{\}/)
    })

    test('helper n -> requireN patch, variable renamed', async () => {
        const { ast, helpers } = await transformModule(
            withRequireCall(`var x = require.n(require(4)); exports.y = x();`)
        )
        assert.ok(helpers.has('n'))
        assert.match(generate(ast).code, /requireN/)
    })

    test('helper bind -> arrow function wrapping require', async () => {
        const { ast, deps } = await transformModule(
            withRequireCall(`var x = require.bind(null, 4); exports.y = x();`)
        )
        assert.ok(deps.has('4'))
        assert.match(generate(ast).code, /=> require\("\.\/4\.cjs"\)/)
    })

    test('unknown helper -> tip runtime_helper', async () => {
        const { tips } = await transformModule(
            withRequireCall(`var x = require.zzz;`)
        )
        assert.ok(tips.some(tip => tip.type === 'runtime_helper'))
    })

    test('helper d with exports -> expanded to exports.KEY = VALUE', async () => {
        const { ast } = await transformModule(
            withRequireCall(
                `require.d(exports, { foo: function () { return 1; } });`
            )
        )
        const code = generate(ast).code
        assert.match(code, /exports\.foo = /)
        assert.doesNotMatch(code, /requireD|require\.d/)
    })

    test('helper d with non-exports first arg -> requireD patch', async () => {
        const { ast, helpers } = await transformModule(
            withRequireCall(
                `require.d(other, { foo: function () { return 1; } });`
            )
        )
        assert.ok(helpers.has('d'))
        assert.match(generate(ast).code, /requireD\(other/)
    })

    test('helper d with spread/irregular props is skipped', async () => {
        const { ast, helpers } = await transformModule(
            withRequireCall(`require.d(exports, { ...extra });`)
        )
        assert.equal(helpers.has('d'), false)
    })
})

describe('webpack transform: CJS roles', () => {
    // raw 模式（不 minify）：esbuild 会按 CJS 语义改写 module/exports 引用，
    // 角色检测本身与压缩形态无关
    test('short param names renamed to module/exports/require', async () => {
        const { ast } = await transformModule(
            `m.exports = e; e.foo = n(2);`,
            '1',
            { minify: false, params: ['m', 'e', 'n'] }
        )
        const code = generate(ast).code
        assert.match(code, /module\.exports = exports/)
        assert.match(code, /exports\.foo = require/)
    })

    test('destructured param -> tip wrong_module_fn', async () => {
        const { tips } = await transformModule(`exports.x = 1;`, '1', {
            minify: false,
            params: ['module', 'exports', '{ a }'],
        })
        assert.ok(tips.some(tip => tip.type === 'wrong_module_fn'))
    })
})

describe('unbundle integration (webpack)', () => {
    test('full pipeline: 100 modules -> 100 files with banners', async () => {
        const bundle = await buildWebpackBundle(genChainModules(100))
        const result = await unbundle({
            sources: [{ filename: 'mini.js', content: bundle }],
        })
        assert.equal(result.type, 'webpack')
        const names = Object.keys(result.files)
        assert.equal(names.length, 100)
        assert.ok(names.includes('1.cjs'))
        // banner: 依赖与反向引用
        const mod2 = result.files['2.cjs']
        assert.match(mod2, /Depends: 1\.cjs/)
        assert.match(mod2, /Referred by: 3\.cjs/)
        assert.match(mod2, /No problem found/)
    })

    test('module content is uncompressed (var -> let, readable)', async () => {
        const bundle = await buildWebpackBundle(genChainModules(100))
        const result = await unbundle({
            sources: [{ filename: 'mini.js', content: bundle }],
        })
        assert.match(result.files['1.cjs'], /let value = 2/)
    })

    test('helper patch emitted as WebpackHelper.cjs', async () => {
        const bundle = await buildWebpackBundle({
            '1': `var dep = require(2); require.d(other, { foo: function () { return 1; } });`,
            ...genChainModules(99, 2),
        })
        const result = await unbundle({
            sources: [{ filename: 'mini.js', content: bundle }],
        })
        assert.ok(WEBPACK_HELPER_ID + '.cjs' in result.files)
        assert.match(result.files[WEBPACK_HELPER_ID + '.cjs'], /requireD/)
    })

    test('mixed sources: skips non-bundle files', async () => {
        const bundle = await buildWebpackBundle(genChainModules(100))
        const result = await unbundle({
            sources: [
                { filename: 'README.txt', content: `not a bundle` },
                { filename: 'mini.js', content: bundle },
            ],
        })
        assert.equal(result.type, 'webpack')
        assert.equal(Object.keys(result.files).length, 100)
    })

    test('no sources -> error', async () => {
        await assert.rejects(unbundle({ sources: [] }), /No sources provided/)
    })

    test('no detectable bundle -> error', async () => {
        await assert.rejects(
            unbundle({
                sources: [{ filename: 'a.js', content: `var x = 1;` }],
            }),
            /Cannot detect the bundle type/
        )
    })

    test('unparseable bundle file is skipped, not fatal', async () => {
        const bundle = await buildWebpackBundle(genChainModules(100))
        const result = await unbundle({
            sources: [
                { filename: 'broken.js', content: `function {` },
                { filename: 'mini.js', content: bundle },
            ],
        })
        assert.equal(Object.keys(result.files).length, 100)
    })
})
