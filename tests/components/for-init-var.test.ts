import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import forInitVar from '../../src/components/for-init-var'
import { transform } from '../helpers'

describe('for-init-var: expression init', () => {
    test('SequenceExpression init: leading statements hoisted, last kept', () => {
        assert.equal(
            transform(`for (a(), b(); ; ) ;`, forInitVar),
            `a();\nfor (b();;);`
        )
    })

    test('AssignmentExpression init untouched', () => {
        assert.equal(
            transform(`for (i = 0; ; ) ;`, forInitVar),
            `for (i = 0;;);`
        )
    })

    test('other expression init hoisted as statement', () => {
        assert.equal(
            transform(`for (foo(); ; ) ;`, forInitVar),
            `foo();\nfor (;;);`
        )
    })

    test('no init untouched', () => {
        assert.equal(transform(`for (;;) ;`, forInitVar), `for (;;);`)
    })
})

describe('for-init-var: var declaration init', () => {
    test('loop variable matched: only that declaration kept, rest hoisted', () => {
        assert.equal(
            transform(`for (var i = 0, j = 1; i < 10; i++) ;`, forInitVar),
            `let j = 1;\nfor (var i = 0; i < 10; i++);`
        )
    })

    test('loop variable matches no declaration: whole init removed', () => {
        assert.equal(
            transform(`for (var i = 0, j = 1; k < 10; k++) ;`, forInitVar),
            `let i = 0;\nlet j = 1;\nfor (; k < 10; k++);`
        )
    })

    test('single declaration untouched', () => {
        assert.equal(
            transform(`for (var i = 0; i < 10; i++) ;`, forInitVar),
            `for (var i = 0; i < 10; i++);`
        )
    })

    test('non-binary test untouched', () => {
        assert.equal(
            transform(`for (var i = 0, j = 1; i; i++) ;`, forInitVar),
            `for (var i = 0, j = 1; i; i++);`
        )
    })

    test('non-UpdateExpression update untouched', () => {
        assert.equal(
            transform(`for (var i = 0, j = 1; i < 10; foo()) ;`, forInitVar),
            `for (var i = 0, j = 1; i < 10; foo());`
        )
    })

    test('update arg not identifier: init not split', () => {
        const out = transform(
            `for (var i = 0, j = 1; i < 10; (a.b)++) ;`,
            forInitVar
        )
        // init 保持两条声明（未提前为 let j）
        assert.match(out, /var i = 0, j = 1/)
    })
})

describe('for-init-var: ForInStatement', () => {
    test('right is SequenceExpression: leading part hoisted', () => {
        assert.equal(
            transform(`for (var k in a, b) ;`, forInitVar),
            `a;\nfor (var k in b);`
        )
    })

    test('right not SequenceExpression untouched', () => {
        assert.equal(
            transform(`for (var k in a) ;`, forInitVar),
            `for (var k in a);`
        )
    })
})
