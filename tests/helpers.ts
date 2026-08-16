import { parse } from '@babel/parser'
import generate from '@babel/generator'
import traverse, { type Scope, type Visitor } from '@babel/traverse'
import * as t from '@babel/types'

// 单组件测试管线：parse -> traverse(visitor) -> generate
export function transform(code: string, visitor: Visitor | Visitor[]): string {
    const ast = parse(code)
    traverse(
        ast,
        Array.isArray(visitor) ? traverse.visitors.merge(visitor) : visitor
    )
    return generate(ast, { minified: false }).code
}

// 只遍历不生成：用于手工构造的边界 AST（generate 可能不支持）
export function visitAst(body: t.Node[], visitor: Visitor): void {
    const ast = t.file(t.program(body as t.Statement[]))
    traverse(ast, visitor)
}

// 在 Program 作用域内执行回调（用于 renameToDesired 等依赖 scope 的测试）
export function withScope(code: string, fn: (scope: Scope) => void): string {
    const ast = parse(code)
    traverse(ast, {
        Program(path) {
            fn(path.scope)
        },
    })
    return generate(ast, { minified: false }).code
}

// 用 builder 构造节点并跑完整变换管线（覆盖 parse 无法产生的 AST 形态）
export function transformNode(
    node: t.Node,
    visitor: Visitor,
    stmtWrap: (node: t.Node) => t.Statement = n =>
        t.expressionStatement(n as t.Expression)
): string {
    const ast = t.file(t.program([stmtWrap(node)]))
    traverse(ast, visitor)
    return generate(ast, { minified: false }).code
}
