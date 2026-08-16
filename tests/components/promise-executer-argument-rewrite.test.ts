import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import promiseExecuterArgumentRewrite from '../../src/components/promise-executer-argument-rewrite'
import { transform } from '../helpers'

describe('promise-executer-argument-rewrite', () => {
    test('two-param arrow -> resolve/reject', () => {
        assert.equal(
            transform(
                `new Promise((a, b) => {});`,
                promiseExecuterArgumentRewrite
            ),
            `new Promise((resolve, reject) => {});`
        )
    })

    test('single-param arrow -> resolve', () => {
        assert.equal(
            transform(`new Promise(a => {});`, promiseExecuterArgumentRewrite),
            `new Promise(resolve => {});`
        )
    })

    test('function expressions are handled the same', () => {
        assert.equal(
            transform(
                `new Promise(function (a, b) {});`,
                promiseExecuterArgumentRewrite
            ),
            `new Promise(function (resolve, reject) {});`
        )
        assert.equal(
            transform(
                `new Promise(function (a) {});`,
                promiseExecuterArgumentRewrite
            ),
            `new Promise(function (resolve) {});`
        )
    })

    test('0 params untouched', () => {
        assert.equal(
            transform(
                `new Promise(() => {});`,
                promiseExecuterArgumentRewrite
            ),
            `new Promise(() => {});`
        )
    })

    test('3 or more params untouched', () => {
        assert.equal(
            transform(
                `new Promise((a, b, c) => {});`,
                promiseExecuterArgumentRewrite
            ),
            `new Promise((a, b, c) => {});`
        )
    })

    test('destructured params untouched', () => {
        assert.equal(
            transform(
                `new Promise(({ a }, b) => {});`,
                promiseExecuterArgumentRewrite
            ),
            `new Promise(({\n  a\n}, b) => {});`
        )
        assert.equal(
            transform(
                `new Promise((a, { b }) => {});`,
                promiseExecuterArgumentRewrite
            ),
            `new Promise((a, {\n  b\n}) => {});`
        )
    })

    test('non-function argument untouched', () => {
        assert.equal(
            transform(`new Promise(foo);`, promiseExecuterArgumentRewrite),
            `new Promise(foo);`
        )
    })

    test('extra arguments untouched', () => {
        assert.equal(
            transform(
                `new Promise((a, b) => {}, extra);`,
                promiseExecuterArgumentRewrite
            ),
            `new Promise((a, b) => {}, extra);`
        )
    })

    test('non-Promise constructor untouched', () => {
        assert.equal(
            transform(
                `new Foo((a, b) => {});`,
                promiseExecuterArgumentRewrite
            ),
            `new Foo((a, b) => {});`
        )
    })

    test('name already taken -> numeric suffix appended', () => {
        assert.equal(
            transform(
                `var resolve; new Promise((a, b) => {});`,
                promiseExecuterArgumentRewrite
            ),
            `var resolve;\nnew Promise((resolve1, reject) => {});`
        )
    })

    test('same-name variable inside the body also counts as taken', () => {
        assert.equal(
            transform(
                `new Promise((a, b) => { var resolve; });`,
                promiseExecuterArgumentRewrite
            ),
            `new Promise((resolve1, reject) => {\n  var resolve;\n});`
        )
    })

    test('reject taken -> suffix appended (resolve free)', () => {
        assert.equal(
            transform(
                `new Promise((a, b) => { var reject; });`,
                promiseExecuterArgumentRewrite
            ),
            `new Promise((resolve, reject1) => {\n  var reject;\n});`
        )
    })

    test('already resolve/reject untouched', () => {
        assert.equal(
            transform(
                `new Promise((resolve, reject) => {});`,
                promiseExecuterArgumentRewrite
            ),
            `new Promise((resolve, reject) => {});`
        )
    })
})
