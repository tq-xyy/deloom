import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import moreReadable from '../../src/components/more-readable'
import { transform } from '../helpers'

describe('more-readable', () => {
    test('return void x -> x; return (void wrapper stripped)', () => {
        assert.equal(
            transform(`function f() { return void a }`, moreReadable),
            `function f() {\n  a;\n  return;\n}`
        )
    })

    test('return void literal: no side effects, no statement inserted', () => {
        assert.equal(
            transform(`function f() { return void 0 }`, moreReadable),
            `function f() {\n  return;\n}`
        )
        assert.equal(
            transform(`function f() { return void "s" }`, moreReadable),
            `function f() {\n  return;\n}`
        )
        assert.equal(
            transform(`function f() { return void undefined }`, moreReadable),
            `function f() {\n  return;\n}`
        )
    })

    test('plain return untouched', () => {
        assert.equal(
            transform(`function f() { return a }`, moreReadable),
            `function f() {\n  return a;\n}`
        )
    })

    test('{a: a} -> {a}', () => {
        assert.equal(
            transform(`var a = { b: b };`, moreReadable),
            `var a = {\n  b\n};`
        )
    })

    test('{a: b} with different names untouched', () => {
        assert.equal(
            transform(`var a = { b: c };`, moreReadable),
            `var a = {\n  b: c\n};`
        )
    })

    test('computed key {[a]: a} untouched', () => {
        assert.equal(
            transform(`var a = { ['b']: b };`, moreReadable),
            `var a = {\n  ['b']: b\n};`
        )
    })

    test('already shorthand untouched', () => {
        assert.equal(
            transform(`var a = { b };`, moreReadable),
            `var a = {\n  b\n};`
        )
    })

    test('() => { return 1 } -> () => 1 (fixes no-op dead code)', () => {
        assert.equal(
            transform(`var f = () => { return 1 };`, moreReadable),
            `var f = () => 1;`
        )
    })

    test('() => { return; } -> () => {}', () => {
        assert.equal(
            transform(`var f = () => { return; };`, moreReadable),
            `var f = () => {};`
        )
    })

    test('multiple statements in block untouched', () => {
        assert.equal(
            transform(`var f = () => { a(); return 1 };`, moreReadable),
            `var f = () => {\n  a();\n  return 1;\n};`
        )
    })

    test('non-block body untouched', () => {
        assert.equal(
            transform(`var f = () => a;`, moreReadable),
            `var f = () => a;`
        )
    })

    test('SequenceExpression body -> block + return', () => {
        assert.equal(
            transform(`var f = () => (a, b);`, moreReadable),
            `var f = () => {\n  return a, b;\n};`
        )
    })
})
