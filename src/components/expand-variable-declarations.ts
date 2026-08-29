import type { NodePath } from '@babel/traverse'
import { defineComponent } from '../base'
import * as t from '@babel/types'

// 重复声明（var a; var a）转 let 会变成语法错误，须保留 var
function hasOtherDeclaration(path: NodePath<t.VariableDeclaration>): boolean {
    for (const dec of path.node.declarations) {
        if (!t.isIdentifier(dec.id)) continue
        const binding = path.scope.getBinding(dec.id.name)
        if (!binding) continue
        // 本声明不是唯一声明，或存在重复声明（constantViolations 里的 VariableDeclarator）
        if (binding.path.node !== dec) return true
        if (binding.constantViolations.some(v => v.isVariableDeclarator())) {
            return true
        }
    }
    return false
}

export default defineComponent({
    VariableDeclaration(path) {
        // var a = 1, b = 2, c = 3 -> let a = 1; let b = 2; let c = 3
        const n = path.node
        if (t.isFor(path.parent)) {
            return
        }

        // 重复声明保持 var
        const canLet = n.kind === 'var' && !hasOtherDeclaration(path)
        const kind = canLet ? 'let' : n.kind

        if (
            ['var', 'const', 'let'].includes(n.kind) &&
            n.declarations.length > 1 &&
            n.declarations.filter(dec => !!dec.init).length > 0
        ) {
            const declarations = n.declarations.map(dec =>
                t.variableDeclaration(kind, [dec])
            )
            path.replaceWithMultiple(declarations)
        }

        if (n.declarations.length === 1) {
            if (kind !== n.kind) {
                n.kind = kind
            }
        }
    },
})
