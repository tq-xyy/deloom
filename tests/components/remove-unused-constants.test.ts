import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import removeUnusedConstants from '../../src/components/remove-unused-constants'
import { transform } from '../helpers'

describe('remove-unused-constants', () => {
    test('all literal expression statements removed', () => {
        assert.equal(transform(`1;`, removeUnusedConstants), ``)
        assert.equal(transform(`true;`, removeUnusedConstants), ``)
        assert.equal(transform(`null;`, removeUnusedConstants), ``)
        assert.equal(transform(`/x/;`, removeUnusedConstants), ``)
        assert.equal(transform(`undefined;`, removeUnusedConstants), ``)
    })

    test('string literal statement removed (not first, avoids Directive semantics)', () => {
        assert.equal(transform(`b; 'a';`, removeUnusedConstants), `b;`)
    })

    test('first string statement is a Directive, kept', () => {
        assert.equal(
            transform(`'use strict';`, removeUnusedConstants),
            `'use strict';`
        )
    })

    test('foldable unary expression statements removed', () => {
        assert.equal(transform(`!0;`, removeUnusedConstants), ``)
        assert.equal(transform(`void 0;`, removeUnusedConstants), ``)
        assert.equal(transform(`-1;`, removeUnusedConstants), ``)
        assert.equal(transform(`~1;`, removeUnusedConstants), ``)
        assert.equal(transform(`+1;`, removeUnusedConstants), ``)
    })

    test('mixed: only literals removed, others kept', () => {
        assert.equal(transform(`a; 1; b;`, removeUnusedConstants), `a;\nb;`)
    })

    test('identifier/non-foldable expressions kept', () => {
        assert.equal(transform(`a;`, removeUnusedConstants), `a;`)
        assert.equal(transform(`!a;`, removeUnusedConstants), `!a;`)
        assert.equal(
            transform(`typeof a;`, removeUnusedConstants),
            `typeof a;`
        )
        assert.equal(transform(`1 + 1;`, removeUnusedConstants), `1 + 1;`)
    })

    test('call expressions kept', () => {
        assert.equal(transform(`foo();`, removeUnusedConstants), `foo();`)
    })
})
