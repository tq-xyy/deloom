import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import constantFold from '../../src/components/constant-fold'
import { transform } from '../helpers'

describe('constant-fold', () => {
    test('folds string concatenation', () => {
        assert.equal(
            transform(`var a = 'a' + 'b';`, constantFold),
            `var a = "ab";`
        )
    })

    test('folds numeric operations', () => {
        assert.equal(transform(`var a = 1 + 2;`, constantFold), `var a = 3;`)
        assert.equal(
            transform(`var a = 0x1f << 2 | 1;`, constantFold),
            `var a = 125;`
        )
    })

    test('folds unary operators', () => {
        assert.equal(transform(`var a = !0;`, constantFold), `var a = true;`)
        assert.equal(transform(`var a = !!0;`, constantFold), `var a = false;`)
        assert.equal(transform(`var a = ~1;`, constantFold), `var a = -2;`)
        assert.equal(transform(`var a = !1;`, constantFold), `var a = false;`)
    })

    test('negative numeric literal: new node equivalent to old, skipped (prevents requeue loop)', () => {
        assert.equal(transform(`var a = -1;`, constantFold), `var a = -1;`)
    })

    test('empty array folds to object: not in whitelist, not replaced', () => {
        assert.equal(transform(`var a = [];`, constantFold), `var a = [];`)
    })

    test('void 0 folds to undefined', () => {
        assert.equal(
            transform(`var a = void 0;`, constantFold),
            `var a = undefined;`
        )
    })

    test('BigInt not in whitelist: no fold, no crash', () => {
        assert.equal(transform(`var a = 1n;`, constantFold), `var a = 1n;`)
        assert.equal(
            transform(`var a = 1n + 2n;`, constantFold),
            `var a = 1n + 2n;`
        )
    })

    test('expressions with identifiers are not folded', () => {
        assert.equal(
            transform(`var a = a + 1;`, constantFold),
            `var a = a + 1;`
        )
        assert.equal(
            transform(`var a = 'a' + b;`, constantFold),
            `var a = 'a' + b;`
        )
    })

    test('empty arrays in binary op: `[] + []` folds to empty string', () => {
        assert.equal(
            transform(`var a = [] + [];`, constantFold),
            `var a = "";`
        )
    })

    test('folds mixed string/number', () => {
        assert.equal(
            transform(`var a = 'a' + 1;`, constantFold),
            `var a = "a1";`
        )
    })

    test('NaN/Infinity results are not folded (prevents 0/0, 1/0 degenerate output)', () => {
        assert.equal(
            transform(`var a = 0 / 0;`, constantFold),
            `var a = 0 / 0;`
        )
        assert.equal(
            transform(`var a = 1 / 0;`, constantFold),
            `var a = 1 / 0;`
        )
        assert.equal(
            transform(`var a = 1e999;`, constantFold),
            `var a = 1e999;`
        )
        assert.equal(
            transform(`var a = 'a' * 1;`, constantFold),
            `var a = 'a' * 1;`
        )
    })

    test('folds all binary operators', () => {
        assert.equal(transform(`var a = 2 ** 3;`, constantFold), `var a = 8;`)
        assert.equal(transform(`var a = 10 % 3;`, constantFold), `var a = 1;`)
        assert.equal(transform(`var a = 1 << 2;`, constantFold), `var a = 4;`)
        assert.equal(transform(`var a = 8 >> 1;`, constantFold), `var a = 4;`)
        assert.equal(transform(`var a = 8 >>> 1;`, constantFold), `var a = 4;`)
        assert.equal(transform(`var a = 1 & 3;`, constantFold), `var a = 1;`)
        assert.equal(transform(`var a = 1 | 2;`, constantFold), `var a = 3;`)
        assert.equal(transform(`var a = 1 ^ 3;`, constantFold), `var a = 2;`)
        assert.equal(transform(`var a = 5 - 2;`, constantFold), `var a = 3;`)
        assert.equal(transform(`var a = 6 / 2;`, constantFold), `var a = 3;`)
    })

    test('folds unary +/void', () => {
        assert.equal(transform(`var a = +1;`, constantFold), `var a = 1;`)
        assert.equal(
            transform(`var a = void 1;`, constantFold),
            `var a = undefined;`
        )
    })

    test('fold skipped when new Function throws (catch branch)', () => {
        const orig = globalThis.Function
        Object.defineProperty(globalThis, 'Function', {
            value: function () {
                throw new Error('boom')
            },
            configurable: true,
            writable: true,
        })
        try {
            const out = transform(`var a = 1 + 2;`, constantFold)
            assert.equal(out, `var a = 1 + 2;`)
        } finally {
            Object.defineProperty(globalThis, 'Function', {
                value: orig,
                configurable: true,
                writable: true,
            })
        }
        // 恢复后正常折叠
        assert.equal(transform(`var a = 1 + 2;`, constantFold), `var a = 3;`)
    })
})
