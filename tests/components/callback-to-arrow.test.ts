import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import callbackToArrow from '../../src/components/callback-to-arrow'
import { transform } from '../helpers'

describe('callback-to-arrow', () => {
    test('function expression as call argument -> arrow function', () => {
        assert.equal(
            transform(
                `[1, 2].map(function (x) { return x * 2 });`,
                callbackToArrow
            ),
            `[1, 2].map(x => {\n  return x * 2;\n});`
        )
    })

    test('function expression in return statement -> arrow function', () => {
        assert.equal(
            transform(
                `function g() { return function () { return 1 } }`,
                callbackToArrow
            ),
            `function g() {\n  return () => {\n    return 1;\n  };\n}`
        )
    })

    test('keeps function expression when it uses this', () => {
        assert.equal(
            transform(`setTimeout(function () { this.x });`, callbackToArrow),
            `setTimeout(function () {\n  this.x;\n});`
        )
    })

    test('this inside a nested arrow also blocks conversion (lexical this)', () => {
        assert.equal(
            transform(
                `setTimeout(function () { setTimeout(() => { this.x }) });`,
                callbackToArrow
            ),
            `setTimeout(function () {\n  setTimeout(() => {\n    this.x;\n  });\n});`
        )
    })

    test('keeps function expression when it uses arguments', () => {
        assert.equal(
            transform(
                `setTimeout(function () { arguments[0] });`,
                callbackToArrow
            ),
            `setTimeout(function () {\n  arguments[0];\n});`
        )
    })

    test('no conversion when parent is not a call/return', () => {
        assert.equal(
            transform(`var f = function () {};`, callbackToArrow),
            `var f = function () {};`
        )
    })

    test('keeps generator function expression', () => {
        assert.equal(
            transform(`setTimeout(function* () {});`, callbackToArrow),
            `setTimeout(function* () {});`
        )
    })

    test('keeps named function expression', () => {
        assert.equal(
            transform(`setTimeout(function f() {});`, callbackToArrow),
            `setTimeout(function f() {});`
        )
    })

    test('async function expression -> async arrow', () => {
        assert.equal(
            transform(`setTimeout(async function () {});`, callbackToArrow),
            `setTimeout(async () => {});`
        )
    })
})
