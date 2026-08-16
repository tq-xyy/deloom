import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import swapEquels from '../../src/components/swap-equels'
import { transform } from '../helpers'

describe('swap-equels', () => {
    test('undefined on left -> swapped', () => {
        assert.equal(
            transform(`undefined === a;`, swapEquels),
            `a === undefined;`
        )
    })

    test('literal on left + equality operator -> swapped', () => {
        assert.equal(transform(`1 === a;`, swapEquels), `a === 1;`)
        assert.equal(transform(`'x' == a;`, swapEquels), `a == 'x';`)
        assert.equal(transform(`-1 !== a;`, swapEquels), `a !== -1;`)
        assert.equal(transform(`!0 != a;`, swapEquels), `a != !0;`)
        assert.equal(transform(`null == a;`, swapEquels), `a == null;`)
        assert.equal(transform(`/re/ === a;`, swapEquels), `a === /re/;`)
    })

    test('literal on left + comparison operator -> swapped and flipped', () => {
        assert.equal(transform(`1 < a;`, swapEquels), `a > 1;`)
        assert.equal(transform(`5 >= a;`, swapEquels), `a <= 5;`)
        assert.equal(transform(`2 > a;`, swapEquels), `a < 2;`)
        assert.equal(transform(`2 <= a;`, swapEquels), `a >= 2;`)
    })

    test('non-comparison/equality operators not swapped', () => {
        assert.equal(transform(`1 + a;`, swapEquels), `1 + a;`)
    })

    test('literal on right not swapped', () => {
        assert.equal(transform(`a === 1;`, swapEquels), `a === 1;`)
    })

    test('void 0 on left swapped', () => {
        assert.equal(transform(`void 0 === a;`, swapEquels), `a === void 0;`)
    })

    test('PrivateName on left returns directly (#x in this)', () => {
        assert.equal(
            transform(`class A { #x; m() { return #x in this } }`, swapEquels),
            `class A {\n  #x;\n  m() {\n    return #x in this;\n  }\n}`
        )
    })
})
