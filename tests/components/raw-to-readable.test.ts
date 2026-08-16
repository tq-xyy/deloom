import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import * as t from '@babel/types'
import rawToReadable from '../../src/components/raw-to-readable'
import { transform, transformNode } from '../helpers'

describe('raw-to-readable', () => {
    test('plain string: raw reset to standard JSON form', () => {
        assert.equal(
            transform(`var a = "abc";`, rawToReadable),
            `var a = "abc";`
        )
    })

    test('decoded escape string: rawValue without \\x, normalized to readable form', () => {
        assert.equal(
            transform(`var a = "\\x41";`, rawToReadable),
            `var a = "A";`
        )
    })

    test('string with literal \\x in rawValue: kept as-is', () => {
        assert.equal(
            transform(`var a = "\\\\x41";`, rawToReadable),
            `var a = "\\\\x41";`
        )
    })

    test('builder-constructed string without extra: rawValue/raw added', () => {
        assert.equal(
            transformNode(t.stringLiteral('a'), rawToReadable),
            `"a";`
        )
    })

    test('number: raw reset to decimal string', () => {
        assert.equal(transform(`var a = 42;`, rawToReadable), `var a = 42;`)
        assert.equal(transform(`var a = 0x1f;`, rawToReadable), `var a = 31;`)
    })

    test('builder-constructed number without extra: rawValue/raw added', () => {
        assert.equal(transformNode(t.numericLiteral(7), rawToReadable), `7;`)
    })

    test('negative/special numbers do not crash', () => {
        assert.equal(
            transform(`var a = -1.5;`, rawToReadable),
            `var a = -1.5;`
        )
    })
})
