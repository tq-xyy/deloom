import * as t from '@babel/types'
import { defineComponent } from '../base'

export default defineComponent({
    ForStatement(path) {
        const n = path.node
        if (n.init) {
            if (t.isExpression(n.init)) {
                // for (a(), b(); ;) -> a(); for (b();;)
                if (t.isSequenceExpression(n.init)) {
                    const lastone = n.init.expressions.pop()
                    path.insertBefore(t.expressionStatement(n.init))
                    n.init = lastone
                } else if (t.isAssignmentExpression(n.init)) {
                    // for (i = 0; ;) 赋值保留在 for 头
                } else {
                    // for (foo(); ;) -> foo(); for (;;)
                    path.insertBefore(t.expressionStatement(n.init))
                    delete n.init
                }
            } else if (
                t.isBinaryExpression(n.test) &&
                t.isUpdateExpression(n.update) &&
                t.isIdentifier(n.update.argument)
            ) {
                // for (var i = 0, j = 1; i < 10; i++)
                //   -> let j = 1; for (var i = 0; i < 10; i++)
                const variable = n.update.argument.name

                if (n.init.declarations.length !== 1) {
                    const reserve: t.VariableDeclarator[] = []
                    const declarations: t.VariableDeclarator[] = []
                    for (const decl of n.init.declarations) {
                        // 仅保留与循环变量同名的声明
                        if (!t.isIdentifier(decl.id, { name: variable })) {
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
        // for (var k in a, b) -> a; for (var k in b)
        if (t.isSequenceExpression(n.right)) {
            const lastone = n.right.expressions.pop()!
            path.insertBefore(t.expressionStatement(n.right))
            n.right = lastone
        }
    },
})
