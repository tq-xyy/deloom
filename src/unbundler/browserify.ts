import generate from '@babel/generator'
import type { NodePath } from '@babel/traverse'
import traverse from '@babel/traverse'
import * as t from '@babel/types'

import { detectCjsRoles } from './roles'
import type {
    BundlerStrategy,
    ModuleID,
    ModuleTransformResult,
    Tip,
    TransformContext,
} from './types'

// 定位 browserify 模块表：占文件 95% 以上、属性值全是 [模块函数, 依赖表] 的对象字面量
function locateBrowserifyModules(file: t.File): NodePath<t.ObjectExpression> {
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
                            t.isArrayExpression(property.value) &&
                            property.value.elements.length >= 1 &&
                            t.isFunctionExpression(
                                property.value.elements[0],
                                { async: false, generator: false }
                            )
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

function transformBrowserifyModule(
    ctx: TransformContext,
    id: ModuleID,
    property: NodePath<t.ObjectProperty>
): ModuleTransformResult {
    const arr = property.get('value') as NodePath<t.ArrayExpression>
    const root = arr.get('elements.0') as NodePath<t.FunctionExpression>
    const deps = new Set<ModuleID>()

    // 依赖表：[1] 是 { 局部require名: '模块名' }，模块名可能含相对路径
    const depMap = new Map<string, string>()
    const depObj = arr.node.elements[1]
    if (t.isObjectExpression(depObj)) {
        for (const prop of depObj.properties) {
            if (!t.isObjectProperty(prop)) continue
            let key: string | null = null
            if (t.isIdentifier(prop.key)) {
                key = prop.key.name
            } else if (t.isStringLiteral(prop.key)) {
                key = prop.key.value
            }
            if (key == null || !t.isStringLiteral(prop.value)) continue
            depMap.set(key, prop.value.value)
        }
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
        if (path.parent.type !== 'CallExpression') {
            handleErrors('require_ref')
            return
        }
        const args = path.parent.arguments
        if (args.length !== 1 || !t.isStringLiteral(args[0])) {
            handleErrors('require_as_arg')
            return
        }
        const depKey = args[0].value
        const depID = depMap.get(depKey) || depKey
        deps.add(depID as ModuleID)
        path.parent.arguments = [
            t.stringLiteral('./' + ctx.rewrite(depID as ModuleID)),
        ]
        // 单字母导入名 -> import_<模块名>（模块名可能含路径，做 sanitize）
        if (
            path.parentPath?.parentPath?.isVariableDeclarator() &&
            t.isIdentifier(path.parentPath.parentPath.node.id) &&
            path.parentPath.parentPath.node.id.name.length <= 2
        ) {
            path.parentPath.parentPath
                .get('id')
                .scope.rename(
                    path.parentPath.parentPath.node.id.name,
                    `import_${depID.replace(/[^a-zA-Z0-9_$]/g, '_')}`
                )
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
    if (roles.module) {
        root.scope.rename(roles.module, 'module')
    }
    if (roles.exports) {
        root.scope.rename(roles.exports, 'exports')
    }
    if (roles.require) {
        root.scope
            .getBinding(roles.require)
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

export const browserifyStrategy: BundlerStrategy = {
    type: 'browserify',
    locate: locateBrowserifyModules,
    transform: transformBrowserifyModule,
}
