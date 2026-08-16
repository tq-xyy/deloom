import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import * as t from '@babel/types'
import extractNestExpression from '../src/components/extract-nest-expression'
import { transform, visitAst } from './helpers'

describe('extract-nest-expression: SequenceExpression', () => {
    test('(0, a)() -> a()', () => {
        assert.equal(transform(`(0, a)();`, extractNestExpression), `a();`)
    })

    test('(0, a, b)() length 3 bypasses the 0 special case; callee position is not an argument', () => {
        assert.equal(
            transform(`(0, a, b)();`, extractNestExpression),
            `(0, a, b)();`
        )
    })

    test('sequence in expression statement -> multiple statements', () => {
        assert.equal(transform(`a, b;`, extractNestExpression), `a;\nb;`)
    })

    test('sequence in return -> leading statements + return last', () => {
        assert.equal(
            transform(`function f() { return a, b }`, extractNestExpression),
            `function f() {\n  a;\n  return b;\n}`
        )
    })

    test('sequence in throw -> leading statements + throw last', () => {
        assert.equal(
            transform(`function f() { throw a, b }`, extractNestExpression),
            `function f() {\n  a;\n  throw b;\n}`
        )
    })

    test('sequence in if condition -> extracted', () => {
        assert.equal(
            transform(`if (a, b) { c() }`, extractNestExpression),
            `a;\nif (b) {\n  c();\n}`
        )
    })

    test('sequence in variable init -> extracted', () => {
        assert.equal(
            transform(`var x = (a, b);`, extractNestExpression),
            `a;\nvar x = b;`
        )
    })

    test('sequence as call argument -> extracted when parent is a statement', () => {
        assert.equal(
            transform(`fn((a, b));`, extractNestExpression),
            `a;\nfn(b);`
        )
    })

    test('sequence as call argument: untouched when parent is not a statement', () => {
        assert.equal(
            transform(`var x = fn((a, b));`, extractNestExpression),
            `var x = fn((a, b));`
        )
        assert.equal(
            transform(`var f = () => fn((a, b));`, extractNestExpression),
            `var f = () => fn((a, b));`
        )
    })
})

describe('extract-nest-expression: AssignmentExpression', () => {
    test('assignment in if condition -> extracted', () => {
        assert.equal(
            transform(`if (x = foo()) { }`, extractNestExpression),
            `x = foo();\nif (x) {}`
        )
    })

    test('assignment in return -> extracted', () => {
        assert.equal(
            transform(
                `function f() { return x = foo() }`,
                extractNestExpression
            ),
            `function f() {\n  x = foo();\n  return x;\n}`
        )
    })

    test('assignment in variable declaration chain -> extracted', () => {
        assert.equal(
            transform(`var y = (x = foo());`, extractNestExpression),
            `x = foo();\nvar y = x;`
        )
    })

    test('assignment in while condition is untouched', () => {
        assert.equal(
            transform(`while (x = foo()) { }`, extractNestExpression),
            `while (x = foo()) {}`
        )
    })

    test('destructuring assignment (Pattern) is untouched', () => {
        assert.equal(transform(`[a] = b;`, extractNestExpression), `[a] = b;`)
        assert.equal(
            transform(`({ a } = b);`, extractNestExpression),
            `({\n  a\n} = b);`
        )
    })

    test('chained += extraction', () => {
        assert.equal(
            transform(`a += b += c;`, extractNestExpression),
            `b += c;\na += b;`
        )
        assert.equal(
            transform(`a -= b -= c;`, extractNestExpression),
            `b -= c;\na -= b;`
        )
    })

    test('simple += is untouched', () => {
        assert.equal(transform(`a += b;`, extractNestExpression), `a += b;`)
    })

    test('+= with plain assignment chain on the right is also extracted', () => {
        assert.equal(
            transform(`a += (b = c);`, extractNestExpression),
            `b = c;\na += b;`
        )
    })

    test('chain with Pattern left is untouched', () => {
        assert.equal(
            transform(`a += ([b] = c);`, extractNestExpression),
            `a += [b] = c;`
        )
    })
})

describe('extract-nest-expression: LogicalExpression -> optional', () => {
    test('a && a.b -> a?.b', () => {
        assert.equal(transform(`a && a.b;`, extractNestExpression), `a?.b;`)
    })

    test('a && a.b.c with object not same-named identifier is untouched', () => {
        assert.equal(
            transform(`a && b.c;`, extractNestExpression),
            `a && b.c;`
        )
    })

    test('computed property is untouched', () => {
        assert.equal(
            transform(`a && a[b];`, extractNestExpression),
            `a && a[b];`
        )
    })

    test('non-identifier left is untouched', () => {
        assert.equal(
            transform(`a.b && a.b;`, extractNestExpression),
            `a.b && a.b;`
        )
    })

    test('chained member access on right is untouched', () => {
        assert.equal(
            transform(`a && a.b.c;`, extractNestExpression),
            `a && a.b.c;`
        )
    })
})
