import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import statementToBlock from '../../src/components/statement-to-block'
import { transform } from '../helpers'

describe('statement-to-block', () => {
    test('for body not a block -> wrapped', () => {
        assert.equal(
            transform(`for (;;) a();`, statementToBlock),
            `for (;;) {\n  a();\n}`
        )
    })

    test('for-in body not a block -> wrapped', () => {
        assert.equal(
            transform(`for (var k in o) a();`, statementToBlock),
            `for (var k in o) {\n  a();\n}`
        )
    })

    test('for-of body not a block -> wrapped', () => {
        assert.equal(
            transform(`for (var k of o) a();`, statementToBlock),
            `for (var k of o) {\n  a();\n}`
        )
    })

    test('already a block untouched', () => {
        assert.equal(
            transform(`for (;;) { a(); }`, statementToBlock),
            `for (;;) {\n  a();\n}`
        )
    })

    test('if without else: consequent wrapped', () => {
        assert.equal(
            transform(`if (a) b();`, statementToBlock),
            `if (a) {\n  b();\n}`
        )
    })

    test('if-else: both branches wrapped', () => {
        assert.equal(
            transform(`if (a) b(); else c();`, statementToBlock),
            `if (a) {\n  b();\n} else {\n  c();\n}`
        )
    })

    test('else-if chain: IfStatement alternate not wrapped', () => {
        assert.equal(
            transform(`if (a) b(); else if (c) d();`, statementToBlock),
            `if (a) {\n  b();\n} else if (c) {\n  d();\n}`
        )
    })

    test('single if in else block: restored to else-if chain on exit', () => {
        assert.equal(
            transform(`if (a) b(); else { if (c) d(); }`, statementToBlock),
            `if (a) {\n  b();\n} else if (c) {\n  d();\n}`
        )
    })

    test('multiple statements in else block not restored', () => {
        assert.equal(
            transform(`if (a) b(); else { c(); d(); }`, statementToBlock),
            `if (a) {\n  b();\n} else {\n  c();\n  d();\n}`
        )
    })

    test('nested if as consequent untouched', () => {
        assert.equal(
            transform(`if (a) if (b) c();`, statementToBlock),
            `if (a) {\n  if (b) {\n    c();\n  }\n}`
        )
    })
})
