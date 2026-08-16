import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import expandVariableDeclarations from '../src/components/expand-variable-declarations'
import { transform } from './helpers'

describe('expand-variable-declarations', () => {
    test('splits var multi-declarations into multiple let statements', () => {
        assert.equal(
            transform(`var a = 1, b = 2;`, expandVariableDeclarations),
            `let a = 1;\nlet b = 2;`
        )
    })

    test('splits const multi-declarations keeping kind', () => {
        assert.equal(
            transform(`const a = 1, b = 2;`, expandVariableDeclarations),
            `const a = 1;\nconst b = 2;`
        )
    })

    test('multi-declarations without init are not split', () => {
        assert.equal(
            transform(`var a, b;`, expandVariableDeclarations),
            `var a, b;`
        )
    })

    test('splits multi-declarations with partial init', () => {
        assert.equal(
            transform(`var a = 1, b;`, expandVariableDeclarations),
            `let a = 1;\nlet b;`
        )
    })

    test('single var declaration -> let', () => {
        assert.equal(
            transform(`var a = 1;`, expandVariableDeclarations),
            `let a = 1;`
        )
        assert.equal(transform(`var a;`, expandVariableDeclarations), `let a;`)
    })

    test('single let/const declarations are untouched', () => {
        assert.equal(
            transform(`let a = 1;`, expandVariableDeclarations),
            `let a = 1;`
        )
        assert.equal(
            transform(`const a = 1;`, expandVariableDeclarations),
            `const a = 1;`
        )
    })

    test('var in for-init is not handled', () => {
        assert.equal(
            transform(
                `for (var i = 0, j = 1; ; ) ;`,
                expandVariableDeclarations
            ),
            `for (var i = 0, j = 1;;);`
        )
        assert.equal(
            transform(`for (var i = 0; ; ) ;`, expandVariableDeclarations),
            `for (var i = 0;;);`
        )
    })
})
