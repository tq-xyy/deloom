import generate from '@babel/generator'
import type { NodePath } from '@babel/traverse'
import traverse from '@babel/traverse'
import * as t from '@babel/types'
import template from '@babel/template'

import { isHelper, WEBPACK_HELPER_ID } from './webpack-helper'
import { detectCjsRoles } from './roles'
import type {
    BundlerStrategy,
    ModuleID,
    ModuleTransformResult,
    Tip,
    TransformContext,
} from './types'

// 定位 webpack 模块表：占文件 95% 以上、属性值全是模块函数的对象字面量
function locateWebpackModules(file: t.File): NodePath<t.ObjectExpression> {
    let modulePath: NodePath<t.ObjectExpression> | null = null
    traverse(file, {
        ObjectExpression: {
            enter(path) {
                if (path.node.loc) {
                    const lengthIsPer95 =
                        ((path.node.end || 0) - (path.node.start || 0)) /
                            (file.end || Infinity) >
                        0.95
                    const isModules = path.node.properties.every(
                        property =>
                            t.isObjectProperty(property, {
                                computed: false,
                            }) &&
                            t.isFunctionExpression(property.value, {
                                async: false,
                                generator: false,
                            })
                    )
                    if (lengthIsPer95 && isModules && !modulePath) {
                        modulePath = path
                    }
                }
            },
        },
    })
    if (!modulePath) {
        throw new Error('Cannot find modules expression')
    }
    return modulePath
}

function transformWebpackModule(
    ctx: TransformContext,
    id: ModuleID,
    property: NodePath<t.ObjectProperty>
): ModuleTransformResult {
    const root = property.get('value') as NodePath<t.FunctionExpression>
    const deps = new Set<ModuleID>()

    const addPatch = (name: string) => {
        ctx.helpers.add(name as never)
        deps.add(WEBPACK_HELPER_ID as ModuleID)
        return `require('./${ctx.rewrite(
            WEBPACK_HELPER_ID as ModuleID
        )}').require${name.toUpperCase()}`
    }

    const processRequire = (path: NodePath<t.Identifier>) => {
        const handleErrors = (type: Tip['type']) => {
            ctx.tips.push({
                module: id,
                type,
                src: generate(path.parentPath.parent).code,
            })
        }
        path.node.name = 'require'
        switch (path.parent.type) {
            case 'CallExpression': {
                const args = path.parent.arguments
                if (
                    args.length == 1 &&
                    (t.isNumericLiteral(args[0]) || t.isStringLiteral(args[0]))
                ) {
                    const depID = args[0].value.toString()
                    deps.add(depID as ModuleID)

                    // TODO: relative import

                    path.parent.arguments = [
                        t.stringLiteral('./' + ctx.rewrite(depID as ModuleID)),
                    ]

                    // replace random single import name with import${moduleId}
                    if (
                        path.parentPath?.parentPath?.isVariableDeclarator() &&
                        t.isIdentifier(path.parentPath.parentPath.node.id) &&
                        path.parentPath.parentPath.node.id.name.length <= 2
                    ) {
                        path.parentPath.parentPath
                            .get('id')
                            .scope.rename(
                                path.parentPath.parentPath.node.id.name,
                                `import_${depID}`
                            )
                    }
                } else {
                    if (
                        path.parent.callee.type === 'MemberExpression' &&
                        t.isIdentifier(path.parent.callee.object, {
                            name: 'require',
                        })
                    ) {
                        // pass
                    } else {
                        handleErrors('require_as_arg')
                    }
                }
                break
            }
            case 'MemberExpression': {
                if (!(
                    !path.parent.computed &&
                    path.parent.property.type === 'Identifier' &&
                    path.parentKey === 'object'
                )) {
                    handleErrors('wrong_member')
                    break
                }

                const helperName = path.parent.property.name
                if (
                    helperName === 'd' &&
                    path.parentPath?.parentPath?.isCallExpression({
                        callee: path.parent,
                    }) &&
                    path.parentPath.parentPath.node.arguments.length === 2 &&
                    t.isIdentifier(
                        path.parentPath.parentPath.node.arguments[0],
                        { name: 'exports' }
                    )
                ) {
                    // replace webpack rename
                    const props = path.parentPath.parentPath.node.arguments[1]
                    t.assertObjectExpression(props)

                    const exports: t.Statement[] = []
                    for (const prop of props.properties) {
                        if (t.isSpreadElement(prop)) continue
                        if (!t.isIdentifier(prop.key)) continue

                        let key: string, fn: t.BlockStatement
                        if (t.isObjectMethod(prop)) {
                            key = prop.key.name
                            fn = prop.body
                        } else if (
                            t.isObjectProperty(prop) &&
                            t.isFunctionExpression(prop.value)
                        ) {
                            key = prop.key.name
                            fn = prop.value.body
                        } else {
                            continue
                        }

                        const rt = fn.body[0]
                        if (t.isReturnStatement(rt) && rt.argument) {
                            const buildExports = template.statement`exports.KEY = VALUE`
                            exports.push(
                                buildExports({
                                    KEY: key,
                                    VALUE: rt.argument,
                                })
                            )
                        }
                    }

                    root.get('body').pushContainer('body', exports)
                    path.parentPath.parentPath.parentPath.remove()
                } else if (helperName === 'r') {
                    const call = path.parentPath?.parentPath
                    if (
                        call?.isCallExpression({
                            callee: path.parent,
                        }) &&
                        call.node.arguments.length === 1 &&
                        t.isIdentifier(call.node.arguments[0], {
                            name: 'exports',
                        })
                    ) {
                        call.remove()
                    } else {
                        // 非 exports 参数（罕见）：走 requireR patch
                        const patch = addPatch(helperName)
                        path.parentPath.replaceWithSourceString(patch)
                    }
                } else if (helperName === 'g') {
                    path.parentPath.replaceWith(t.identifier('globalThis'))
                } else if (helperName === 'amdO') {
                    path.parentPath.replaceWith(t.objectExpression([]))
                } else if (helperName === 'o') {
                    path.parentPath.replaceWithSourceString(
                        'Object.prototype.hasOwnProperty.call'
                    )
                } else if (
                    helperName === 'n' &&
                    path.parentPath.parentPath?.isCallExpression() &&
                    path.parentPath.parentPath.node.arguments.length === 1 &&
                    t.isIdentifier(
                        path.parentPath.parentPath.node.arguments[0]
                    ) &&
                    path.parentPath.parentKey === 'callee' &&
                    path.parentPath.parentPath.parentPath.isVariableDeclarator() &&
                    t.isIdentifier(
                        path.parentPath.parentPath.parentPath.node.id
                    )
                ) {
                    // restore requireN's varname
                    path.parentPath.parentPath.parentPath
                        .get('id')
                        .scope.rename(
                            path.parentPath.parentPath.parentPath.node.id.name,
                            `${path.parentPath.parentPath.node.arguments[0].name}$n`
                        )
                    const call = addPatch(helperName)
                    path.parentPath.replaceWithSourceString(call)
                } else if (
                    helperName === 'bind' &&
                    path.parentPath?.parentPath?.isCallExpression({
                        callee: path.parent,
                    }) &&
                    path.parentPath.parentPath.node.arguments.length === 2 &&
                    // terser 压缩产物是 require.bind(null, id)，
                    // 手写产物可能是 require.bind(this, id)
                    (t.isIdentifier(
                        path.parentPath.parentPath.node.arguments[0]
                    ) ||
                        t.isNullLiteral(
                            path.parentPath.parentPath.node.arguments[0]
                        ))
                ) {
                    const requireCall = path.parentPath.parentPath.node
                    const depID = (
                        requireCall.arguments[1] as
                            t.StringLiteral | t.NumericLiteral
                    ).value
                    // 与 graph() 的模块 id 保持一致（字符串）
                    deps.add(String(depID) as ModuleID)

                    // TODO: relative import

                    path.parentPath.parentPath.replaceWith(
                        t.arrowFunctionExpression(
                            [],
                            t.callExpression(t.identifier('require'), [
                                t.stringLiteral(
                                    './' + ctx.rewrite(depID as ModuleID)
                                ),
                            ])
                        )
                    )
                } else if (isHelper(helperName)) {
                    const call = addPatch(helperName)
                    path.parentPath.replaceWithSourceString(call)
                } else {
                    handleErrors('runtime_helper')
                }
                break
            }

            default:
                handleErrors('require_ref')
        }
    }

    // 非标识符参数（解构/rest 等）记录提示
    root.node.params.forEach((param, index) => {
        if (t.isIdentifier(param)) return
        let paramPath: NodePath<t.FunctionParameter> = root.get(
            'params.' + index
        ) as NodePath<t.FunctionParameter>
        if (Array.isArray(paramPath)) {
            paramPath = paramPath[0]
        }
        ctx.tips.push({
            type: 'wrong_module_fn',
            module: id,
            src: paramPath.getSource(),
        })
    })

    const roles = detectCjsRoles(root.node, root.scope)
    const moduleName = roles.module
    const exportsName = roles.exports
    const requireName = roles.require

    if (moduleName) {
        root.scope.rename(moduleName, 'module')
    }
    if (exportsName) {
        root.scope.rename(exportsName, 'exports')
    }
    if (requireName) {
        root.scope
            .getBinding(requireName)
            ?.referencePaths.forEach(p =>
                processRequire(p as NodePath<t.Identifier>)
            )
    }

    const unwrap = t.program(root.node.body.body)
    return {
        id,
        ast: unwrap,
        dependcies: deps,
    }
}

export const webpackStrategy: BundlerStrategy = {
    type: 'webpack',
    locate: locateWebpackModules,
    transform: transformWebpackModule,
}
