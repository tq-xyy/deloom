import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { Visitor } from '@babel/traverse'
import expandVariableDeclarations from '../src/components/expand-variable-declarations'
import forToWhile from '../src/components/for-to-while'
import { transform, visitAst, transformNode } from './helpers'
import * as t from '@babel/types'

describe('test helpers', () => {
    test('transform accepts a visitor array (merge branch)', () => {
        const out = transform(`var a = 1; for (; a < 2; ) a++;`, [
            expandVariableDeclarations,
            forToWhile,
        ])
        assert.equal(out, `let a = 1;\nwhile (a < 2) a++;`)
    })

    test('visitAst traverses a hand-built AST', () => {
        let visited = false
        const visitor = {
            NumericLiteral() {
                visited = true
            },
        } as Visitor
        visitAst([t.expressionStatement(t.numericLiteral(1))], visitor)
        assert.equal(visited, true)
    })

    test('transformNode traverses builder-constructed nodes', () => {
        const out = transformNode(t.stringLiteral('x'), {
            StringLiteral(path) {
                path.node.value = 'y'
            },
        } as Visitor)
        assert.equal(out, `"y";`)
    })

    test('transformNode with custom statement wrapper', () => {
        const out = transformNode(
            t.numericLiteral(1),
            {
                NumericLiteral(path) {
                    path.node.value = 2
                },
            } as Visitor,
            n =>
                t.variableDeclaration('var', [
                    t.variableDeclarator(t.identifier('x'), n as t.Expression),
                ])
        )
        assert.equal(out, `var x = 2;`)
    })
})
