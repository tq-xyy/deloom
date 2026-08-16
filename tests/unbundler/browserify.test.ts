import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from '@babel/parser'
import traverse, { type NodePath } from '@babel/traverse'
import generate from '@babel/generator'
import * as t from '@babel/types'

import { browserifyStrategy } from '../../src/unbundler/browserify'
import { detectBundle, unbundle } from '../../src/unbundler/index'
import type { TransformContext } from '../../src/unbundler/types'
import {
    buildBrowserifyBundle,
    genBrowserifyModules,
    minify,
} from './fixtures'

// ---- transform 层辅助：绕过 95% 占比门槛 ----
async function transformModule(
    source: string,
    depMap: Record<string, string> = {},
    id = '1',
    params: string[] = ['require', 'module', 'exports']
): Promise<{
    ast: t.Program
    deps: Set<string>
    tips: TransformContext['tips']
}> {
    const body = await minify(source)
    const depsJson = Object.keys(depMap).length
        ? `, ${JSON.stringify(depMap)}`
        : ''
    const code = `var x = ({ ${id}: [function (${params.join(', ')}) { ${body} }${depsJson}] });`
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
    const result = browserifyStrategy.transform(ctx, id as never, propPath)
    return {
        ast: result.ast,
        deps: result.dependcies as Set<string>,
        tips: ctx.tips,
    }
}

describe('detectBundle (browserify)', () => {
    test('browserify bundle detected', async () => {
        const bundle = await buildBrowserifyBundle(genBrowserifyModules(100))
        assert.equal(detectBundle(bundle), 'browserify')
    })

    test('webpack bundle is not misdetected as browserify', async () => {
        // 用 webpack 测试的同款生成器验证互斥（经 buildWebpackBundle 输出）
        const { buildWebpackBundle, genChainModules } =
            await import('./fixtures')
        const bundle = await buildWebpackBundle(genChainModules(100))
        assert.equal(detectBundle(bundle), 'webpack')
    })

    test('plain JS -> unknown', () => {
        assert.equal(detectBundle(`var x = 1;`), 'unknown')
    })
})

describe('browserify transform', () => {
    test('local require name rewritten via dep map', async () => {
        const { ast, deps } = await transformModule(
            `var a = require("./dep1"); exports.x = a.y;`,
            { './dep1': '42' }
        )
        const code = generate(ast).code
        assert.match(code, /require\("\.\/42\.cjs"\)/)
        assert.deepEqual([...deps], ['42'])
    })

    test('dep id fallback: unknown key without ./ prefix', async () => {
        const { ast, deps } = await transformModule(
            `var a = require("./missing"); exports.x = a;`
        )
        // fallback 保留模块名但去掉 ./，避免 ././missing.cjs 双重前缀
        assert.match(generate(ast).code, /require\("\.\/missing\.cjs"\)/)
        assert.deepEqual([...deps], ['missing'])
    })

    test('short import name renamed to import_{dep}', async () => {
        const { ast } = await transformModule(
            `var a = require("./dep1"); exports.x = a.foo;`,
            { './dep1': '42' }
        )
        assert.match(generate(ast).code, /import_42\.foo/)
    })

    test('require with non-string arg -> tip require_as_arg', async () => {
        const { tips } = await transformModule(
            `var d = require("./dep1"); fn(require);`,
            { './dep1': '42' }
        )
        assert.ok(tips.some(tip => tip.type === 'require_as_arg'))
    })

    test('require as bare value -> tip require_ref', async () => {
        const { tips } = await transformModule(
            `var d = require("./dep1"); var x = require;`,
            { './dep1': '42' }
        )
        assert.ok(tips.some(tip => tip.type === 'require_ref'))
    })

    test('params renamed to require/module/exports', async () => {
        const { ast } = await transformModule(
            `var d = r("./dep1"); m.exports = d; e.x = 1;`,
            { './dep1': '42' },
            '1',
            ['r', 'm', 'e']
        )
        const code = generate(ast).code
        assert.match(code, /require\("\.\/42\.cjs"\)/)
        assert.match(code, /module\.exports = import_42/)
    })

    test('destructured param -> tip wrong_module_fn', async () => {
        const { ast } = await transformModule(`exports.x = 1;`, {}, '1')
        // 形参解构在 browserify 中同样记录 wrong_module_fn
        const code = `var x = ({ 1: [function ({ a }, module, exports) { exports.x = 1; }] });`
        const ast2 = parse(code)
        let propPath: NodePath<t.ObjectProperty> | null = null
        traverse(ast2, {
            ObjectProperty(path) {
                if (
                    path.node.key.type === 'NumericLiteral' ||
                    path.node.key.type === 'StringLiteral'
                ) {
                    if (String(path.node.key.value) === '1') propPath = path
                }
            },
        })
        const ctx: TransformContext = {
            tips: [],
            helpers: new Set(),
            rewrite: id => id + '.cjs',
        }
        browserifyStrategy.transform(ctx, '1' as never, propPath!)
        assert.ok(ctx.tips.some(tip => tip.type === 'wrong_module_fn'))
    })
})

describe('unbundle integration (browserify)', () => {
    test('full pipeline: modules extracted with dep chain', async () => {
        const bundle = await buildBrowserifyBundle(genBrowserifyModules(100))
        const result = await unbundle({
            sources: [{ filename: 'mini.js', content: bundle }],
        })
        assert.equal(result.type, 'browserify')
        assert.equal(Object.keys(result.files).length, 100)
        const mod2 = result.files['2.cjs']
        assert.match(mod2, /Depends: 1\.cjs/)
        assert.match(mod2, /Referred by: 3\.cjs/)
    })

    test('module code uncompressed', async () => {
        const bundle = await buildBrowserifyBundle(genBrowserifyModules(100))
        const result = await unbundle({
            sources: [{ filename: 'mini.js', content: bundle }],
        })
        assert.match(result.files['1.cjs'], /let value = 2/)
    })
})
