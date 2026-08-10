import generate from '@babel/generator'
import { parse } from '@babel/parser'
import type { NodePath, Scope, Visitor } from '@babel/traverse'
import traverse from '@babel/traverse'
import * as t from '@babel/types'
import prettier from 'prettier'

const prettierConfig: prettier.Config = {
    arrowParens: 'avoid',
    bracketSpacing: true,
    endOfLine: 'crlf',
    htmlWhitespaceSensitivity: 'css',
    insertPragma: false,
    jsxSingleQuote: false,
    printWidth: 79,
    proseWrap: 'preserve',
    quoteProps: 'as-needed',
    requirePragma: false,
    semi: false,
    singleQuote: true,
    tabWidth: 4,
    trailingComma: 'es5',
    useTabs: false,
    vueIndentScriptAndStyle: false,
}
// To support nest structure transformed by `regenerator`
prettierConfig.printWidth = 999
prettierConfig.tabWidth = 2

function identifierIsVaild(value: string) {
    const keywords = (
        'break,extends,this,catch,for,case,finally,throw,try,class,function,typeof,const,if,var,continue,' +
        'import,void,debugger,in,white,default,instanceof,with,delete,net,yield,do,return,else,super,export,switch,' +
        'enum,implements,package,public,interface,private,static,protected,let'
    ).split(',')
    const namedRegex = /^[a-zA-Z_$][0-9a-zA-Z_$]*$/
    return !keywords.includes(value) && namedRegex.test(value)
}

export type Component = Visitor

const rawToReadable: Component = {
    StringLiteral(path) {
        const n = path.node
        if (!n.extra) {
            n.extra = {
                rawValue: n.value,
            }
        }
        if ((n.extra.rawValue as string).includes('\\x')) {
            return
        }
        n.extra.raw = JSON.stringify(n.extra.rawValue)
    },
    NumericLiteral(path) {
        const n = path.node
        if (!n.extra) {
            n.extra = {
                rawValue: n.value,
            }
        }
        n.extra.raw = n.value.toString()
    },
}

function tryConstify(path: NodePath<t.Expression>) {
    function canConstantify(node: t.Node) {
        if (node.type === 'NumericLiteral') {
            return true
        }
        if (node.type === 'StringLiteral') {
            return true
        }

        if (node.type === 'ArrayExpression' && node.elements.length === 0) {
            return true
        }
        if (
            node.type === 'UnaryExpression' &&
            ['void', '!', '+', '-', '~'].includes(node.operator) &&
            canConstantify(node.argument)
        ) {
            return true
        }

        if (
            node.type === 'BinaryExpression' &&
            [
                '+',
                '-',
                '*',
                '/',
                '%',
                '*',
                '**',
                '&',
                '|',
                '>>',
                '>>>',
                '<<',
                '^',
            ].includes(node.operator) &&
            canConstantify(node.left) &&
            canConstantify(node.right)
        ) {
            return true
        }
        return false
    }

    if (!canConstantify(path.node)) {
        return
    }
    try {
        const value = new Function(
            generate(t.returnStatement(path.node)).code
        )()

        // not allow object & function

        if (
            typeof value === 'number' ||
            typeof value === 'boolean' ||
            typeof value === 'string' ||
            typeof value === 'undefined' ||
            (typeof value === 'object' && value === null)
        ) {
            path.replaceWith(t.valueToNode(value))
        }
    } catch {
        // skip constify
    }
}

const constantFold: Component = {
    //  0x1f << 2 | 1 -> 124
    // 'a' + 'b' + 'c' -> 'abc'
    // !!0 -> false
    Binary(path) {
        tryConstify(path)
    },
    UnaryExpression(path) {
        tryConstify(path)
    },
}

const literalKeyToIdentifier: Component = {
    ClassMethod(path) {
        const n = path.node
        if (
            n.computed &&
            t.isStringLiteral(n.key) &&
            identifierIsVaild(n.key.value)
        ) {
            n.computed = false
            n.key = t.identifier(n.key.value)
        }
    },
    MemberExpression(path) {
        const n = path.node
        if (
            t.isStringLiteral(n.property) &&
            identifierIsVaild(n.property.value)
        ) {
            n.property = t.identifier(n.property.value)
            n.computed = false
        }
    },
    ObjectProperty(path) {
        // {['a']: 1} -> {a:1}
        const n = path.node
        if (
            t.isStringLiteral(n.key) &&
            identifierIsVaild(n.key.value) &&
            n.computed
        ) {
            n.key = t.identifier(n.key.value)
            n.computed = false
        }

        // {a: function(){}} -> {a() {}}
        if (
            t.isFunctionExpression(n.value) &&
            !n.value.id &&
            !t.isPrivateName(n.key)
        ) {
            path.replaceWith(
                t.objectMethod(
                    'method',
                    n.key,
                    n.value.params,
                    n.value.body,
                    n.computed,
                    n.value.generator,
                    n.value.async
                )
            )
        }
    },
}

const statementToBlock: Component = {
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
}

const expandVariableDeclarations: Component = {
    VariableDeclaration(path) {
        // var a = 1, b = 2, c = 3 -> let a = 1; let b = 2; let c = 3
        const n = path.node
        if (t.isFor(path.parent)) {
            return
        }

        const kind = n.kind === 'var' ? 'let' : n.kind

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
}

const callbackToArrow: Component = {
    FunctionExpression(path) {
        const n = path.node
        if (
            (t.isCallExpression(path.parent) ||
                t.isReturnStatement(path.parent)) &&
            !n.generator &&
            !n.id
        ) {
            let hasThis = false
            path.traverse({
                ThisExpression() {
                    hasThis = true
                },
                Identifier(path) {
                    if (path.node.name === 'arguments') {
                        hasThis = true
                    }
                },
            })
            if (!hasThis) {
                const arrow = t.arrowFunctionExpression(
                    n.params,
                    n.body,
                    n.async
                )
                path.replaceWith(arrow)
            }
        }
    },
}

const moreReadable: Component = {
    ReturnStatement(path) {
        const n = path.node
        if (t.isUnaryExpression(n.argument, { operator: 'void' })) {
            path.insertBefore(t.expressionStatement(n.argument.argument))
            delete n.argument
        }
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
}

const complexToReference: Component = {
    MemberExpression(path) {
        const n = path.node
        if (
            t.isObjectExpression(n.object) &&
            n.object.properties.length > 10
        ) {
            let id = path.scope.generateUidIdentifier('staticObj')
            path.scope.push({ id, init: n.object })
            n.object = id
        }
    },
}

const removeUnusedConstants: Component = {
    ExpressionStatement(path) {
        const n = path.node
        const isLiteral = [
            'NumericLiteral',
            'BooleanLiteral',
            'NullLiteral',
            'StringLiteral',
            'RegExpLiteral',
        ].includes(n.expression.type)

        const isUndefined = t.isIdentifier(n.expression, {
            name: 'undefined',
        })

        if (isLiteral || isUndefined) {
            path.remove()
        }
    },
}

const swapEquels: Component = {
    BinaryExpression(path) {
        const n = path.node
        if (t.isPrivateName(n.left)) {
            return
        }

        // true === expr -> expr === true
        const leftIsLiteral =
            t.isIdentifier(n.left, { name: 'undefined' }) ||
            t.isLiteral(n.left) ||
            (t.isUnaryExpression(n.left) &&
                ['+', '-', '!', '~', 'void'].includes(n.left.operator) &&
                t.isLiteral(n.left.argument))
        const rightIsExpression =
            t.isIdentifier(n.right) || t.isExpression(n.right)

        const operatorIsEq = ['==', '===', '!==', '!='].includes(n.operator)
        const operatorIsCmp = ['>', '>=', '<', '<='].includes(n.operator)

        if (leftIsLiteral && rightIsExpression) {
            if (operatorIsEq) {
                const left = n.left
                n.left = n.right
                n.right = left
            } else if (operatorIsCmp) {
                const operatorMaps = {
                    '>': '<',
                    '<': '>',
                    '>=': '<=',
                    '<=': '>=',
                } as const

                n.operator =
                    operatorMaps[
                        n.operator as unknown as '<' | '>' | '>=' | '<='
                    ]

                const left = n.left
                n.left = n.right
                n.right = left
            }
        }
    },
}

const forInitVar: Component = {
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
}

const forToWhile: Component = {
    ForStatement(path) {
        const n = path.node
        const hasInit = !!n.init
        const hasTest = !!n.test
        const hasUpdate = !!n.update
        if (hasInit && !hasTest && !hasUpdate) {
            const node = t.isVariableDeclaration(n.init)
                ? n.init
                : t.expressionStatement(n.init!)
            path.insertBefore(node)
            delete n.init
        }
        if (!hasInit && hasTest && !hasUpdate) {
            const node = t.whileStatement(
                n.test || t.booleanLiteral(true),
                n.body
            )
            path.replaceWith(node)
        }
    },
}

const conditionTransformIf: Component = {
    ConditionalExpression(path) {
        const n = path.node

        // cond ? a() : b() -> if (cond) { a() } else { b() }
        if (path.parentPath.isExpressionStatement()) {
            const left = t.blockStatement([
                t.expressionStatement(n.consequent),
            ])
            const right = t.isConditionalExpression(n.alternate)
                ? t.expressionStatement(n.alternate)
                : t.blockStatement([t.expressionStatement(n.alternate)])
            path.parentPath.replaceWith(t.ifStatement(n.test, left, right))
        }
        // return cond ? a : b -> if (cond) { return a } else { return b }
        if (t.isReturnStatement(path.parent)) {
            const left = t.blockStatement([t.returnStatement(n.consequent)])
            const right = t.isConditionalExpression(n.alternate)
                ? t.returnStatement(n.alternate)
                : t.blockStatement([t.returnStatement(n.alternate)])
            path.parentPath.replaceWith(t.ifStatement(n.test, left, right))
        }
    },
    LogicalExpression(path) {
        const n = path.node

        if (
            t.isExpressionStatement(path.parent) &&
            !t.isLogicalExpression(n.right)
        ) {
            // a && b() -> if (a) { b() }
            if (n.operator === '&&') {
                const test = n.left
                const body = t.blockStatement([t.expressionStatement(n.right)])
                path.parentPath.replaceWith(t.ifStatement(test, body))
            }
            // a || b() -> if (!a) { b() }
            if (n.operator === '||') {
                const test = t.unaryExpression('!', n.left)
                const body = t.blockStatement([t.expressionStatement(n.right)])
                path.parentPath.replaceWith(t.ifStatement(test, body))
            }
        }
    },
}

const extractNestExpression: Component = {
    SequenceExpression(path) {
        const n = path.node
        if (path.parentPath.removed) return

        // (0, a)() -> a()
        if (
            n.expressions.length === 2 &&
            t.isNumericLiteral(n.expressions[0], { value: 0 })
        ) {
            path.replaceWith(n.expressions[1])
            return
        }

        // a, b -> a; b
        if (t.isExpressionStatement(path.parent)) {
            const exprs = n.expressions.map(expr =>
                t.expressionStatement(expr)
            )
            path.parentPath.replaceWithMultiple(exprs)
            return
        }

        // return a, b -> a; return b
        if (
            t.isReturnStatement(path.parent) ||
            t.isThrowStatement(path.parent)
        ) {
            const lastone = n.expressions.pop()!
            for (const expr of n.expressions) {
                path.parentPath.insertBefore(t.expressionStatement(expr))
            }
            path.replaceWith(lastone)
            return
        }

        // if (a, b) {...} -> a; if (b) {...}
        if (t.isIfStatement(path.parent) && path.parentKey === 'test') {
            const lastone = n.expressions.pop()!
            for (const expr of n.expressions) {
                path.parentPath.insertBefore(t.expressionStatement(expr))
            }
            path.replaceWith(lastone)
            return
        }

        // var a = (b, c) -> b; var a = c
        if (
            t.isVariableDeclarator(path.parent) &&
            path.parentKey === 'init' &&
            path.parentPath.parentPath?.isVariableDeclaration()
        ) {
            const lastone = n.expressions.pop()!
            for (const expr of n.expressions) {
                path.parentPath.parentPath.insertBefore(
                    t.expressionStatement(expr)
                )
            }
            path.replaceWith(lastone)
            return
        }

        // fn((a, b)) -> a; fn(b)
        if (
            t.isCallExpression(path.parent) &&
            path.parentKey === 'arguments'
        ) {
            const statementBlock = path.parentPath.parentPath

            if (statementBlock?.isStatement()) {
                const lastone = n.expressions.pop()!
                for (const expr of n.expressions) {
                    statementBlock.insertBefore(t.expressionStatement(expr))
                }
                path.replaceWith(lastone)
            }
        }
    },
    AssignmentExpression(path) {
        const n = path.node
        if (t.isPattern(n.left) || t.isPattern(n.right)) {
            return
        }

        if (n.operator === '=') {
            let current: NodePath<t.Node> = path

            while (current.parentPath && !current.parentPath.isStatement()) {
                current = current.parentPath
            }

            if (
                current?.parentPath?.isIfStatement() &&
                current.parentKey === 'test'
            ) {
                current.parentPath.insertBefore(t.expressionStatement(n))
                path.replaceWith(n.left)
            }
            if (
                current?.parentPath?.isReturnStatement({
                    argument: n,
                }) &&
                current.parentKey === 'argument'
            ) {
                current.parentPath.insertBefore(t.expressionStatement(n))
                path.replaceWith(n.left)
            }
            if (current.parentPath?.isVariableDeclaration()) {
                current.parentPath.insertBefore(t.expressionStatement(n))
                path.replaceWith(n.left)
            }
        }
        if (['+=', '-='].includes(n.operator)) {
            let root = path.findParent(path => path.isStatement())

            if (!root) {
                return
            }

            let chains: t.AssignmentExpression[] = [],
                curr = n
            while (
                t.isAssignmentExpression(curr) &&
                t.isAssignmentExpression(curr.right)
            ) {
                if (!t.isExpression(curr.right.left)) {
                    return
                }
                let temp = curr.right
                curr.right = curr.right.left
                curr = temp
                chains.unshift(curr)
            }
            for (const node of chains) {
                root.insertBefore(t.expressionStatement(node))
            }
        }
    },
    LogicalExpression(path) {
        // a && a.b -> a?.b
        if (
            path.node.operator === '&&' &&
            t.isIdentifier(path.node.left) &&
            t.isMemberExpression(path.node.right) &&
            t.isIdentifier(path.node.right.object, {
                name: path.node.left.name,
            }) &&
            t.isIdentifier(path.node.right.property) &&
            path.node.right.computed === false
        ) {
            const obj = path.node.left
            const prop = path.node.right.property
            path.replaceWith(
                t.optionalMemberExpression(obj, prop, false, true)
            )
        }
    },
}

// 将 oldName 重命名为 desiredName；名字被占用时追加数字后缀（name1、name2...）
// 返回实际使用的名字（oldName 已是 desiredName 时原样返回）
function renameToDesired(
    scope: Scope,
    oldName: string,
    desiredName: string,
    reservedNames: string[] = []
): string {
    if (oldName === desiredName) {
        return desiredName
    }
    const binding = scope.getBinding(oldName)
    if (!binding) {
        return desiredName
    }
    const targetScope = binding.scope
    const taken = (name: string) =>
        name !== oldName &&
        (!!targetScope.getBinding(name) || reservedNames.includes(name))
    let name = desiredName
    let suffix = 1
    while (taken(name)) {
        name = `${desiredName}${suffix++}`
    }
    targetScope.rename(oldName, name)
    return name
}

const promiseExecuterArgumentRewrite: Component = {
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
}

const tryCatchArgumentRewrite: Component = {
    CatchClause(path) {
        const subpath = path.get('param')
        if (!subpath.isIdentifier()) return
        renameToDesired(subpath.scope, subpath.node.name, 'caughtError')
    },
}

// 压缩名：1-2 字符短名，或 _ 开头的混淆名（_0x、_$ 等）
function isMinifiedName(name: string): boolean {
    return /^[a-zA-Z0-9_$]{1,2}$/.test(name) || /^_[a-zA-Z0-9$]+/.test(name)
}

// 可读名：非压缩名、长度 >= 3、合法标识符
function isReadableName(name: string): boolean {
    return name.length >= 3 && identifierIsVaild(name) && !isMinifiedName(name)
}

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

function typeToRoleName(calleeName: string): string | null {
    const mapped = TYPE_ROLE_MAP[calleeName]
    if (mapped) return mapped
    if (calleeName.length >= 6) {
        return calleeName[0].toLowerCase() + calleeName.slice(1)
    }
    return null
}

// 锚点传播：把未压缩的语义锚点（对象键、this、类型构造、实参）传播为压缩名的可读名。
// 只动压缩名；冲突由 renameToDesired 解决；被重新赋值的绑定（constant === false）不动。
const anchorPropagation: Component = {
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
}

function combineVistors(visitors: Visitor[]): Visitor {
    return traverse.visitors.merge(visitors)
}

const pluginUncompress = combineVistors([
    rawToReadable,
    constantFold,
    literalKeyToIdentifier,
    statementToBlock,
    expandVariableDeclarations,
    callbackToArrow,
    moreReadable,
    complexToReference,
    removeUnusedConstants,
    swapEquels,
    forInitVar,
    forToWhile,
    conditionTransformIf,
    extractNestExpression,
    promiseExecuterArgumentRewrite,
    tryCatchArgumentRewrite,
    anchorPropagation,
])

interface UncompressOptions {
    usePrettier?: boolean
    pref?: boolean
    throwErrors?: boolean
}

export async function formatSource(
    source: string | t.Program,
    options?: UncompressOptions
): Promise<string> {
    let ast: t.File

    const {
        throwErrors = false,
        pref = false,
        usePrettier = true,
    } = options || {}

    const mark = pref ? performance.mark.bind(performance) : () => {}

    try {
        mark('parse-start')
        if (typeof source === 'string') {
            ast = parse(source)
        } else {
            ast = t.file(source)
        }

        mark('parse-end')

        mark('transform-start')
        traverse(ast, pluginUncompress)
        mark('transform-end')
    } catch (err) {
        if (throwErrors) {
            throw err
        }
        console.error(
            'Some problems occurred during the uncompression process, ' +
                'which may be source code errors. Please check the input. ' +
                'Or you can set --throw-errors to have a look of the error.'
        )
        return (
            '// An error occurred during uncompressing. Roll back.\n' + source
        )
    }

    try {
        mark('generate-start')
        let result: string = generate(ast, {
            minified: false,
            sourceMaps: false,
        }).code
        if (usePrettier) {
            result = await prettier.format(result, {
                ...(prettierConfig as any),
                parser: 'babel',
            })
        }
        mark('generate-end')

        return result
    } catch (err) {
        if (throwErrors) {
            throw err
        }
        console.error(
            'Some problems occurred while formatting the code, which may be the error of the uncompressor.'
        )
        return (
            `// There are some errors in these code so we do not format them.\n// ${err}` +
            generate(ast, {
                minified: false,
                sourceMaps: false,
            }).code
        )
    }
}
