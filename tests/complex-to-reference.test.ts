import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from '@babel/parser'
import * as t from '@babel/types'
import complexToReference, {
    checkObjectLevelMoreThan,
} from '../src/components/complex-to-reference'
import { transform } from './helpers'

const deepObject = `{a:{b:{c:{d:{e:{f:{g:{h:{i:1}}}}}}}}}`

describe('complex-to-reference', () => {
    test('member object with more than 10 properties -> extract staticObj', () => {
        const out = transform(
            `({a:1,b:2,c:3,d:4,e:5,f:6,g:7,h:8,i:9,j:10,k:11}).x;`,
            complexToReference
        )
        assert.match(out, /var _staticObj = /)
        assert.match(out, /_staticObj\.x;/)
    })

    test('multi-arg call: only deep argument is extracted', () => {
        const out = transform(`fn(1, ${deepObject}, a);`, complexToReference)
        assert.match(out, /const _callArgs = /)
        assert.match(out, /fn\(1, _callArgs, a\);/)
    })

    test('object with <= 10 properties is untouched', () => {
        assert.equal(
            transform(
                `({a:1,b:2,c:3,d:4,e:5,f:6,g:7,h:8,i:9,j:10}).x;`,
                complexToReference
            ),
            `({\n  a: 1,\n  b: 2,\n  c: 3,\n  d: 4,\n  e: 5,\n  f: 6,\n  g: 7,\n  h: 8,\n  i: 9,\n  j: 10\n}).x;`
        )
    })

    test('deeply nested call argument in expression statement -> extract callArgs', () => {
        const out = transform(`fn(${deepObject});`, complexToReference)
        assert.match(out, /const _callArgs = /)
        assert.match(out, /fn\(_callArgs\);/)
    })

    test('shallow arguments are not extracted', () => {
        assert.equal(
            transform(`fn({a:1});`, complexToReference),
            `fn({\n  a: 1\n});`
        )
        assert.equal(transform(`fn(1);`, complexToReference), `fn(1);`)
        assert.equal(transform(`fn(a);`, complexToReference), `fn(a);`)
    })

    test('call in non-expression statement is not extracted', () => {
        assert.equal(
            transform(`var x = fn(${deepObject});`, complexToReference),
            `var x = fn({\n  a: {\n    b: {\n      c: {\n        d: {\n          e: {\n            f: {\n              g: {\n                h: {\n                  i: 1\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n});`
        )
    })

    test('function arguments are not extracted', () => {
        assert.equal(
            transform(`fn(function () {});`, complexToReference),
            `fn(function () {});`
        )
    })

    test('checkObjectLevelMoreThan walks array elements (arrays containing objects)', () => {
        assert.equal(
            checkObjectLevelMoreThan(
                t.arrayExpression([t.numericLiteral(1)]),
                9
            ),
            false
        )
        // 数组元素是对象：深度由元素决定
        const arr = t.arrayExpression([
            t.objectExpression([
                t.objectProperty(t.identifier('a'), t.numericLiteral(1)),
            ]),
        ])
        assert.equal(checkObjectLevelMoreThan(arr, 9), false)
        // 数组 + 2 层内嵌对象元素可命中 depth === 9
        const deepArr = t.arrayExpression([
            t.objectExpression([
                t.objectProperty(
                    t.identifier('a'),
                    t.objectExpression([
                        t.objectProperty(
                            t.identifier('b'),
                            t.objectExpression([
                                t.objectProperty(
                                    t.identifier('c'),
                                    t.numericLiteral(1)
                                ),
                            ])
                        ),
                    ])
                ),
            ]),
        ])
        assert.equal(checkObjectLevelMoreThan(deepArr, 9), true)
    })

    test('SpreadElement arguments are skipped', () => {
        assert.equal(
            transform(`fn(...args);`, complexToReference),
            `fn(...args);`
        )
    })
})

describe('checkObjectLevelMoreThan (direct unit tests)', () => {
    test('primitives/shallow nodes return false', () => {
        assert.equal(checkObjectLevelMoreThan(t.numericLiteral(1), 9), false)
        assert.equal(checkObjectLevelMoreThan(t.identifier('a'), 9), false)
        assert.equal(
            checkObjectLevelMoreThan(t.objectExpression([]), 9),
            false
        )
    })

    test('level 0: any node containing a child object is true', () => {
        // properties 数组本身即子对象
        assert.equal(checkObjectLevelMoreThan(t.objectExpression([]), 0), true)
    })

    test('depth exceeding level returns true', () => {
        // 2 层内嵌（parse 含 File/loc 链）可命中 depth === 9
        assert.equal(checkObjectLevelMoreThan(parse(`{a:{b:{c:1}}}`), 9), true)
        // 1 层内嵌（builder 构造，无 File/loc 包装）不够深
        assert.equal(
            checkObjectLevelMoreThan(
                t.objectExpression([
                    t.objectProperty(
                        t.identifier('a'),
                        t.objectExpression([
                            t.objectProperty(
                                t.identifier('b'),
                                t.numericLiteral(1)
                            ),
                        ])
                    ),
                ]),
                9
            ),
            false
        )
        // builder 构造 10 层内嵌必命中（不依赖 loc 结构）
        let node: t.ObjectExpression = t.objectExpression([
            t.objectProperty(t.identifier('x'), t.numericLiteral(1)),
        ])
        for (let i = 0; i < 10; i++) {
            node = t.objectExpression([
                t.objectProperty(t.identifier('a'), node),
            ])
        }
        assert.equal(checkObjectLevelMoreThan(node, 9), true)
        // parse 的浅对象（File/loc 链深度不足）
        assert.equal(checkObjectLevelMoreThan(parse(`{a:1}`), 9), false)
        assert.equal(checkObjectLevelMoreThan(parse(deepObject), 9), true)
    })

    test('array holes (null child nodes) are skipped', () => {
        assert.equal(
            checkObjectLevelMoreThan(t.arrayExpression([null]), 9),
            false
        )
    })
})
