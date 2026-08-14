import * as t from '@babel/types'
import { defineComponent } from '../base'

export default defineComponent({
    ReturnStatement: {
        // 用 exit：return a, void b 需等 SequenceExpression 提取（extract-nest-expression）
        // 完成、argument 变成 UnaryExpression(void) 后才匹配，一轮收敛
        exit(path) {
            const n = path.node
            if (t.isUnaryExpression(n.argument, { operator: 'void' })) {
                path.insertBefore(t.expressionStatement(n.argument.argument))
                delete n.argument
            }
        },
    },
    ObjectProperty(path) {
        const n = path.node
        // eg. { a: a } -> { a }
        if (
            t.isIdentifier(n.key) &&
            t.isIdentifier(n.value) &&
            n.key.name === n.value.name &&
            !n.computed &&
            !n.shorthand
        ) {
            n.shorthand = true
        }
    },
    ArrowFunctionExpression(path) {
        const n = path.node
        // () => { return 1 } -> () => 1
        // () => { return; } -> () => {}
        if (
            t.isBlockStatement(n.body) &&
            n.body.body.length === 1 &&
            t.isReturnStatement(n.body.body[0])
        ) {
            n.body.body[0].argument || t.blockStatement([])
        }
        // special example
        if (t.isSequenceExpression(n.body)) {
            n.body = t.blockStatement([t.returnStatement(n.body)])
        }
    },
})
