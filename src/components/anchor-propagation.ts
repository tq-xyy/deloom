import type { Binding, NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import { defineComponent } from '../base'
import { isMinifiedName, isReadableName, renameToDesired } from './shared'

// 类型 -> 角色名映射（特例优先），其余走 camelCase 兜底
const TYPE_ROLE_MAP: Record<string, string> = {
    XMLHttpRequest: 'xhr',
    WebSocket: 'ws',
    Worker: 'worker',
    AbortController: 'abortController',
    URLSearchParams: 'params',
    FormData: 'formData',
    FileReader: 'reader',
    Blob: 'blob',
    Image: 'image',
    Audio: 'audio',
}

export function typeToRoleName(calleeName: string): string | null {
    const mapped = TYPE_ROLE_MAP[calleeName]
    if (mapped) return mapped
    if (calleeName.length >= 6) {
        return calleeName[0].toLowerCase() + calleeName.slice(1)
    }
    return null
}

// 绑定是否指向一个函数
function isFunctionBinding(binding: Binding): boolean {
    const n = binding.path.node
    return (
        t.isFunctionDeclaration(n) ||
        t.isFunctionExpression(n) ||
        t.isArrowFunctionExpression(n) ||
        (t.isVariableDeclarator(n) &&
            !!n.init &&
            (t.isFunctionExpression(n.init) ||
                t.isArrowFunctionExpression(n.init)))
    )
}

// 锚点传播：把未压缩的语义锚点（对象键、this、类型构造、实参）传播为压缩名的可读名。
// 只动压缩名；冲突由 renameToDesired 解决；被重新赋值的绑定（constant === false）不动。
export default defineComponent({
    ObjectProperty(path) {
        // { options: e, success: t, fail: n } -> e/t/n 更名为 options/success/fail
        const n = path.node
        if (
            n.computed ||
            !t.isIdentifier(n.key) ||
            !t.isIdentifier(n.value) ||
            !isMinifiedName(n.value.name)
        ) {
            return
        }
        const key = n.key.name
        if (key.length < 4 || !isReadableName(key)) {
            return
        }
        renameToDesired(path.scope, n.value.name, key)
        // { options: options } -> { options }（避免需要第二轮才收敛）
        if (n.key.name === n.value.name) {
            n.shorthand = true
        }
    },
    VariableDeclarator(path) {
        const n = path.node
        if (!t.isIdentifier(n.id) || !isMinifiedName(n.id.name)) return
        const idName = n.id.name
        const binding = path.scope.getBinding(idName)
        if (!binding || !binding.constant) return
        let desired: string | null = null
        // var o = this -> self
        if (t.isThisExpression(n.init)) {
            desired = 'self'
        } else if (
            t.isNewExpression(n.init) &&
            t.isIdentifier(n.init.callee)
        ) {
            // var s = new XMLHttpRequest() -> xhr
            desired = typeToRoleName(n.init.callee.name)
        }
        // 不做 var a = data 具名别名传播：改名会遮蔽外层源名，使 init 变自引用
        if (!desired) return
        renameToDesired(path.scope, idName, desired)
    },
    AssignmentExpression(path) {
        // self.playNoteAtNumber = n -> 函数 n 更名为 playNoteAtNumber
        const n = path.node
        if (!t.isMemberExpression(n.left)) return
        const obj = n.left.object
        if (!(
            t.isThisExpression(obj) ||
            (t.isIdentifier(obj) && isReadableName(obj.name))
        )) {
            return
        }
        const prop = n.left.property
        let propName: string | null = null
        if (t.isIdentifier(prop) && !n.left.computed) {
            if (isReadableName(prop.name)) propName = prop.name
        } else if (n.left.computed && t.isStringLiteral(prop)) {
            if (isReadableName(prop.value)) propName = prop.value
        }
        if (!propName) return
        if (!t.isIdentifier(n.right) || !isMinifiedName(n.right.name)) return
        const binding = path.scope.getBinding(n.right.name)
        if (!binding || !isFunctionBinding(binding)) return
        renameToDesired(path.scope, n.right.name, propName)
    },
    'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression'(path) {
        // 参数在函数体内被调用（含 call/apply）-> callback（兜底命名）
        const fnNode = path.node as t.Function
        // 函数名绑定，用于找调用点：调用点实参可读时，实参锚点传播负责命名，本规则让位
        let fnBinding: Binding | null = null
        if (
            (t.isFunctionDeclaration(fnNode) ||
                t.isFunctionExpression(fnNode)) &&
            fnNode.id
        ) {
            fnBinding = path.scope.getBinding(fnNode.id.name) ?? null
        } else if (
            path.parentPath &&
            path.parentPath.isVariableDeclarator() &&
            t.isIdentifier(path.parentPath.node.id)
        ) {
            fnBinding =
                path.parentPath.scope.getBinding(
                    path.parentPath.node.id.name
                ) ?? null
        }
        const callSites: NodePath<t.CallExpression>[] = []
        if (fnBinding) {
            for (const ref of fnBinding.referencePaths) {
                if (
                    ref.parentPath &&
                    ref.parentPath.isCallExpression() &&
                    ref.parentPath.node.callee === ref.node
                ) {
                    callSites.push(ref.parentPath)
                }
            }
        }
        for (let i = 0; i < fnNode.params.length; i++) {
            const param = fnNode.params[i]
            if (!t.isIdentifier(param) || !isMinifiedName(param.name)) continue
            const binding = path.scope.getBinding(param.name)
            if (!binding) continue
            // 调用点实参可读 -> 交给 CallExpression 锚点传播（success/fail 这类更具体语义）
            if (
                callSites.some(cs => {
                    const arg = cs.node.arguments[i]
                    return t.isIdentifier(arg) && isReadableName(arg.name)
                })
            ) {
                continue
            }
            // 作为可读键对象属性值 -> 交给 ObjectProperty 锚点传播
            if (
                binding.referencePaths.some(ref => {
                    const parent = ref.parentPath
                    if (
                        !parent ||
                        !parent.isObjectProperty() ||
                        parent.node.value !== ref.node ||
                        parent.node.computed
                    ) {
                        return false
                    }
                    return (
                        t.isIdentifier(parent.node.key) &&
                        isReadableName(parent.node.key.name)
                    )
                })
            ) {
                continue
            }
            const called = binding.referencePaths.some(ref => {
                const parent = ref.parentPath
                if (!parent || !parent.isCallExpression()) return false
                if (parent.node.callee === ref.node) return true
                // e.call(...) / e.apply(...)
                const callee = parent.node.callee
                return (
                    t.isMemberExpression(callee) &&
                    !callee.computed &&
                    callee.object === ref.node &&
                    t.isIdentifier(callee.property) &&
                    (callee.property.name === 'call' ||
                        callee.property.name === 'apply')
                )
            })
            if (called) {
                renameToDesired(path.scope, param.name, 'callback')
            }
        }
    },
    CallExpression(path) {
        // foo(userList) -> 形参（压缩名）更名为 userList
        const n = path.node
        if (!t.isIdentifier(n.callee)) return
        const binding = path.scope.getBinding(n.callee.name)
        if (!binding) return
        let fnPath: NodePath<t.Function> | null = null
        if (
            t.isFunctionDeclaration(binding.path.node) ||
            t.isFunctionExpression(binding.path.node) ||
            t.isArrowFunctionExpression(binding.path.node)
        ) {
            fnPath = binding.path as NodePath<t.Function>
        } else if (
            t.isVariableDeclarator(binding.path.node) &&
            binding.path.node.init &&
            (t.isFunctionExpression(binding.path.node.init) ||
                t.isArrowFunctionExpression(binding.path.node.init))
        ) {
            fnPath = binding.path.get('init') as NodePath<t.Function>
        }
        if (!fnPath) return
        // 形参注册在函数作用域，而非调用点作用域
        for (
            let i = 0;
            i < n.arguments.length && i < fnPath.node.params.length;
            i++
        ) {
            const arg = n.arguments[i]
            const param = fnPath.node.params[i]
            if (!t.isIdentifier(arg) || !t.isIdentifier(param)) continue
            if (!isMinifiedName(param.name) || !isReadableName(arg.name)) {
                continue
            }
            renameToDesired(fnPath.scope, param.name, arg.name)
        }
    },
})
