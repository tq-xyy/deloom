import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import conditionTransformIf from '../src/components/condition-transform-if'
import extractNestExpression from '../src/components/extract-nest-expression'
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

describe('condition-transform-if: combined with extract-nest-expression', () => {
    // parentPath.replaceWith 是单节点替换（父 path 的 node 更新为新节点，
    // 父链不断）；这些组合场景验证不会产生 extract-nest-expression 的
    // 残留路径崩溃（回归保护）
    const visitors = [conditionTransformIf, extractNestExpression]

    test('ternary with assignment in test -> assignment hoisted, then if', () => {
        assert.equal(
            transform(`(x = 1) ? a() : b();`, visitors),
            `x = 1;\nif (x) {\n  a();\n} else {\n  b();\n}`
        )
    })

    test('sequence with ternary -> split first, then if', () => {
        assert.equal(
            transform(`x = 1, cond ? a() : b();`, visitors),
            `x = 1;\nif (cond) {\n  a();\n} else {\n  b();\n}`
        )
    })

    test('logical expression with assignment on right -> if', () => {
        assert.equal(
            transform(`a && (b = 1);`, visitors),
            `if (a) {\n  b = 1;\n}`
        )
    })

    test('ternary with sequence in test -> hoisted, then if', () => {
        assert.equal(
            transform(`(a, cond) ? x() : y();`, visitors),
            `a;\nif (cond) {\n  x();\n} else {\n  y();\n}`
        )
    })

    test('return ternary with assignment -> assignment hoisted inside branch', () => {
        assert.equal(
            transform(`function f() { return cond ? (x = 1) : y }`, visitors),
            `function f() {\n  if (cond) {\n    x = 1;\n    return x;\n  } else {\n    return y;\n  }\n}`
        )
    })

    test('deeply nested ternary -> full else-if chain', () => {
        assert.equal(
            transform(`a ? b : (c ? d : (e ? f : g));`, visitors),
            `if (a) {\n  b;\n} else if (c) {\n  d;\n} else if (e) {\n  f;\n} else {\n  g;\n}`
        )
    })
})
