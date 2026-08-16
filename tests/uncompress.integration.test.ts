import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from '@babel/parser'
import * as t from '@babel/types'
import { formatSource } from '../src/uncompress'

// 全管线回归：验证重构后组件组合行为正确（兜底单组件测试的盲区）
// 输出经 prettier 格式化（endOfLine: crlf、无分号、printWidth 999）；
// 断言前统一归一化换行，避免依赖平台/配置
const norm = (s: string) => s.replace(/\r\n/g, '\n')

describe('formatSource full pipeline', () => {
    test('computed key + function value converges to method shorthand', async () => {
        const out = await formatSource(`var a = {['x']: function(){}};`)
        assert.equal(norm(out), `let a = {\n  x() {},\n}\n`)
    })

    test('return a, void b extraction', async () => {
        const out = await formatSource(`function f() { return a, void b }`)
        assert.equal(norm(out), `function f() {\n  a\n  b\n  return\n}\n`)
    })

    test('string concat folding + var to let', async () => {
        const out = await formatSource(`var a = 'a' + 'b';`)
        assert.equal(norm(out), `let a = 'ab'\n`)
    })

    test('idempotency: second pass output unchanged', async () => {
        const first = await formatSource(
            `var o = {options: a}; function f(a){a()} f(success);`
        )
        const second = await formatSource(first)
        assert.equal(second, first)
    })

    test('modern syntax does not crash: import()/BigInt/#private/generator', async () => {
        const out = await formatSource(
            `var x = import('a'); var y = 1n; class A { #p = 1; } function* g() { yield 1 }`
        )
        assert.match(out, /import\('a'\)/)
        assert.match(out, /1n/)
        assert.match(out, /#p = 1/)
        assert.match(out, /yield 1/)
    })

    test('invalid input rolls back and returns comment', async () => {
        const out = await formatSource(`return 1`)
        assert.match(out, /An error occurred during uncompressing/)
    })

    test('throwErrors mode throws the original error', async () => {
        await assert.rejects(
            formatSource(`return 1`, { throwErrors: true }),
            /return/
        )
    })

    test('Program node input', async () => {
        const ast = parse(`var a = 1;`)
        const out = await formatSource(ast.program)
        assert.equal(norm(out), `let a = 1\n`)
    })

    test('File node input (direct parse return value)', async () => {
        const ast = parse(`var a = 1;`)
        const out = await formatSource(ast)
        assert.equal(norm(out), `let a = 1\n`)
    })

    test('usePrettier: false skips prettier (pure generate output)', async () => {
        const out = await formatSource(`var a = 1;`, {
            usePrettier: false,
        })
        assert.equal(out, `let a = 1;`)
    })

    test('pref: true uses performance.mark instrumentation', async () => {
        const out = await formatSource(`var a = 1;`, { pref: true })
        assert.equal(norm(out), `let a = 1\n`)
    })

    test('TS node output rejected by prettier babel parser -> rollback', async () => {
        const file = t.file(
            t.program([
                t.expressionStatement(
                    t.tsNonNullExpression(t.identifier('a'))
                ),
            ])
        )
        const out = await formatSource(file)
        assert.match(
            out,
            /There are some syntax errors in these code so we do not format/
        )
    })

    test('TS node + throwErrors -> prettier SyntaxError thrown', async () => {
        const file = t.file(
            t.program([
                t.expressionStatement(
                    t.tsNonNullExpression(t.identifier('a'))
                ),
            ])
        )
        await assert.rejects(
            formatSource(file, { throwErrors: true }),
            err => err instanceof SyntaxError
        )
    })
})
