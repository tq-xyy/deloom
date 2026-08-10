import { defineComponent } from '../base'
import * as t from '@babel/types'

export default defineComponent({
    ForStatement(path) {
        const n = path.node
        if (!t.isBlockStatement(n.body)) {
            n.body = t.blockStatement([n.body])
        }
    },
    ForInStatement(path) {
        const n = path.node
        if (!t.isBlockStatement(n.body)) {
            n.body = t.blockStatement([n.body])
        }
    },
    ForOfStatement(path) {
        const n = path.node
        if (!t.isBlockStatement(n.body)) {
            n.body = t.blockStatement([n.body])
        }
    },
    IfStatement: {
        enter(path) {
            const n = path.node
            if (!t.isBlockStatement(n.consequent)) {
                n.consequent = t.blockStatement([n.consequent])
            }
            if (
                n.alternate &&
                !t.isBlockStatement(n.alternate) &&
                !t.isIfStatement(n.alternate)
            ) {
                n.alternate = t.blockStatement([n.alternate])
            }
        },
        exit(path) {
            const n = path.node
            // restore the fault block
            if (
                n.alternate &&
                t.isBlockStatement(n.alternate) &&
                n.alternate.body.length === 1 &&
                t.isIfStatement(n.alternate.body[0])
            ) {
                n.alternate = n.alternate.body[0]
            }
        },
    },
})
