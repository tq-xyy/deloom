import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import forToWhile from '../../src/components/for-to-while'
import { transform } from '../helpers'

describe('for-to-while', () => {
    test('for(init;;) -> init; for(;;)', () => {
        assert.equal(
            transform(`for (var i = 0; ; ) ;`, forToWhile),
            `var i = 0;\nfor (;;);`
        )
        assert.equal(
            transform(`for (i = 0; ; ) ;`, forToWhile),
            `i = 0;\nfor (;;);`
        )
    })

    test('for(;test;) -> while(test)', () => {
        assert.equal(
            transform(`for (; i < 10; ) a();`, forToWhile),
            `while (i < 10) a();`
        )
    })

    test('for (;;)', () => {
        assert.equal(transform(`for (;;) ;`, forToWhile), `while (true);`)
    })

    test('with init+test is untouched', () => {
        assert.equal(
            transform(`for (var i = 0; i < 10; i++) ;`, forToWhile),
            `for (var i = 0; i < 10; i++);`
        )
    })

    test('with test+update is untouched', () => {
        assert.equal(
            transform(`for (; i < 10; i++) ;`, forToWhile),
            `for (; i < 10; i++);`
        )
    })

    test('with init+update is untouched', () => {
        assert.equal(
            transform(`for (var i = 0; ; i++) ;`, forToWhile),
            `for (var i = 0;; i++);`
        )
    })
})
