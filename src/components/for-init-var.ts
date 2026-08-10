import * as t from '@babel/types'
import { defineComponent } from '../base'

export default defineComponent({
    ForStatement(path) {
        const n = path.node
        if (n.init) {
            if (t.isExpression(n.init)) {
                if (t.isSequenceExpression(n.init)) {
                    const lastone = n.init.expressions.pop()
                    path.insertBefore(t.expressionStatement(n.init))
                    n.init = lastone
                } else if (t.isAssignmentExpression(n.init)) {
                    // pass
                } else {
                    path.insertBefore(t.expressionStatement(n.init))
                    delete n.init
                }
            } else if (
                t.isBinaryExpression(n.test) &&
                t.isUpdateExpression(n.update) &&
                t.isIdentifier(n.update.argument)
            ) {
                const variable = n.update.argument.name

                if (n.init.declarations.length !== 1) {
                    const reserve: t.VariableDeclarator[] = []
                    const declarations: t.VariableDeclarator[] = []
                    for (const decl of n.init.declarations) {
                        if (
                            !t.isIdentifier(decl.id, { name: variable }) ||
                            decl.id.name !== variable
                        ) {
                            declarations.push(decl)
                        } else {
                            reserve.push(decl)
                        }
                    }

                    if (reserve.length === 0) {
                        delete n.init
                    } else {
                        n.init.declarations = reserve
                    }
                    declarations.forEach(decl => {
                        path.insertBefore(t.variableDeclaration('let', [decl]))
                    })
                }
            }
        }
    },
    ForInStatement(path) {
        const n = path.node
        if (
            t.isSequenceExpression(n.right) &&
            n.right.expressions.length >= 1
        ) {
            const lastone = n.right.expressions.pop()!
            path.insertBefore(t.expressionStatement(n.right))
            n.right = lastone
        }
    },
})
