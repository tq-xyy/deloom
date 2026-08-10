import type { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import { defineComponent } from '../base'
import { renameToDesired } from './shared'

export default defineComponent({
    // new Promise((a, b) => {}) -> new Promise((resolve, reject) => {})
    NewExpression(path) {
        if (
            t.isIdentifier(path.node.callee, { name: 'Promise' }) &&
            path.node.arguments.length === 1 &&
            (t.isArrowFunctionExpression(path.node.arguments[0]) ||
                t.isFunctionExpression(path.node.arguments[0]))
        ) {
            const fn = path.node.arguments[0]
            if (fn.params.length >= 3 || fn.params.length === 0) {
                return
            }
            const resolveFn = fn.params[0]
            const rejectFn = fn.params[1]
            if (!t.isIdentifier(resolveFn) || !t.isIdentifier(rejectFn)) {
                return
            }
            const subpath = path.get('arguments.0') as NodePath<
                t.FunctionExpression | t.ArrowFunctionExpression
            >
            // resolve/reject 互相保留对方名字，避免撞名
            const resolveName = renameToDesired(
                subpath.scope,
                resolveFn.name,
                'resolve',
                ['reject']
            )
            renameToDesired(subpath.scope, rejectFn.name, 'reject', [
                resolveName,
            ])
        }
    },
})
