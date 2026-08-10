import type { NodePath } from '@babel/traverse'
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
