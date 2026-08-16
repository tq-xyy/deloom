import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import conditionTransformIf from '../src/components/condition-transform-if'
import { transform } from './helpers'

describe('condition-transform-if: ConditionalExpression', () => {
    test('ternary in expression statement -> if/else', () => {
        assert.equal(
            transform(`cond ? a() : b();`, conditionTransformIf),
            `if (cond) {\n  a();\n} else {\n  b();\n}`
        )
    })

    test('nested ternary alternate -> recursive full if chain', () => {
        assert.equal(
            transform(
                `cond ? a() : (cond2 ? c() : d());`,
                conditionTransformIf
            ),
            `if (cond) {\n  a();\n} else if (cond2) {\n  c();\n} else {\n  d();\n}`
        )
    })

    test('ternary in return -> if/return', () => {
        assert.equal(
            transform(
                `function f() { return cond ? a : b }`,
                conditionTransformIf
            ),
            `function f() {\n  if (cond) {\n    return a;\n  } else {\n    return b;\n  }\n}`
        )
    })

    test('nested ternary in return -> recursive full if chain', () => {
        assert.equal(
            transform(
                `function f() { return cond ? a : (cond2 ? c : d) }`,
                conditionTransformIf
            ),
            `function f() {\n  if (cond) {\n    return a;\n  } else if (cond2) {\n    return c;\n  } else {\n    return d;\n  }\n}`
        )
    })

    test('ternary in assignment is untouched', () => {
        assert.equal(
            transform(`var x = cond ? a : b;`, conditionTransformIf),
            `var x = cond ? a : b;`
        )
    })
})

describe('condition-transform-if: LogicalExpression', () => {
    test('a && b() -> if(a) { b() }', () => {
        assert.equal(
            transform(`a && b();`, conditionTransformIf),
            `if (a) {\n  b();\n}`
        )
    })

    test('a || b() -> if(!a) { b() }', () => {
        assert.equal(
            transform(`a || b();`, conditionTransformIf),
            `if (!a) {\n  b();\n}`
        )
    })

    test('LogicalExpression as right operand (explicit parens) is not converted', () => {
        // generate 会去掉括号，但 AST 仍是右结合，不产生 if
        assert.equal(
            transform(`a && (b && c());`, conditionTransformIf),
            `a && b && c();`
        )
    })

    test('left-associative chain a && b && c(): inner converts first, outer stays', () => {
        assert.equal(
            transform(`a && b && c();`, conditionTransformIf),
            `if (a && b) {\n  c();\n}`
        )
    })

    test('logical expression in non-expression statement is untouched', () => {
        assert.equal(
            transform(`var x = a && b;`, conditionTransformIf),
            `var x = a && b;`
        )
    })
})
