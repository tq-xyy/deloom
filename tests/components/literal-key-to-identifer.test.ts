import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import * as t from '@babel/types'
import literalKeyToIdentifier from '../../src/components/literal-key-to-identifer'
import { transform, transformNode } from '../helpers'

describe('literal-key-to-identifer', () => {
    test('object computed key -> identifier key', () => {
        assert.equal(
            transform(`var a = {['x']: 1};`, literalKeyToIdentifier),
            `var a = {\n  x: 1\n};`
        )
    })

    test('computed key that is not a valid identifier not converted', () => {
        assert.equal(
            transform(`var a = {['x-y']: 1};`, literalKeyToIdentifier),
            `var a = {\n  ['x-y']: 1\n};`
        )
        assert.equal(
            transform(`var a = {['1x']: 1};`, literalKeyToIdentifier),
            `var a = {\n  ['1x']: 1\n};`
        )
    })

    test('member computed key -> dot access', () => {
        assert.equal(
            transform(`var o = {['a']: 1}; o['b'];`, literalKeyToIdentifier),
            `var o = {\n  a: 1\n};\no.b;`
        )
        assert.equal(
            transform(`o['x-y'];`, literalKeyToIdentifier),
            `o['x-y'];`
        )
    })

    test('method shorthand: {a: function(){}} -> {a(){}}', () => {
        assert.equal(
            transform(`var a = {a: function(){}};`, literalKeyToIdentifier),
            `var a = {\n  a() {}\n};`
        )
    })

    test('computed key + function value: converges to {x(){}} (prevents re-replacement of stale node)', () => {
        assert.equal(
            transform(
                `var a = {['x']: function(){}};`,
                literalKeyToIdentifier
            ),
            `var a = {\n  x() {}\n};`
        )
    })

    test('named function expression not converted to method shorthand', () => {
        assert.equal(
            transform(`var a = {a: function b(){}};`, literalKeyToIdentifier),
            `var a = {\n  a: function b() {}\n};`
        )
    })

    test('dynamic computed key kept computed in method shorthand', () => {
        assert.equal(
            transform(
                `var a = {[foo]: function(){}};`,
                literalKeyToIdentifier
            ),
            `var a = {\n  [foo]() {}\n};`
        )
    })

    test('class computed-key method -> identifier method', () => {
        assert.equal(
            transform(`class A { ['m']() {} }`, literalKeyToIdentifier),
            `class A {\n  m() {}\n}`
        )
        assert.equal(
            transform(`class A { ['m-n']() {} }`, literalKeyToIdentifier),
            `class A {\n  ['m-n']() {}\n}`
        )
    })

    test('PrivateName key not converted to method shorthand (builder-constructed)', () => {
        const out = transformNode(
            t.objectProperty(
                t.privateName(t.identifier('x')),
                t.functionExpression(null, [], t.blockStatement([]))
            ),
            literalKeyToIdentifier,
            n =>
                t.expressionStatement(
                    t.objectExpression([n as t.ObjectProperty])
                )
        )
        // 保留 private 键，且函数值未被转成方法
        assert.match(out, /#x/)
        assert.match(out, /function/)
    })

    test('keyword key not converted to identifier', () => {
        assert.equal(
            transform(`var a = {['break']: 1};`, literalKeyToIdentifier),
            `var a = {\n  ['break']: 1\n};`
        )
    })
})
