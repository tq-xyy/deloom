import generate from '@babel/generator'
import { parse } from '@babel/parser'
import type { NodePath } from '@babel/traverse'
import traverse from '@babel/traverse'
import * as t from '@babel/types'
import template from '@babel/template'
import * as fs from 'fs/promises'
import path from 'path'

import { concatHelper, Helper, isHelper, WEBPACK_HELPER_ID } from './helper'
import { formatSource } from './uncompress'

type ModuleID = string & { __identifier_unused: null }

export interface Bundle {
    name: string
    filename: string
    graph: Record<ModuleID, BundlePart>
}

export interface BundlePart {
    id: ModuleID
    path: NodePath<t.FunctionExpression>
    filename: string
}

type ModuleGraph = Record<ModuleID, ModuleInfo>

export interface ModuleInfo {
    id: ModuleID
    /** Name that rewrited */
    name: string
    /** Original bundle filename */
    filename: string
    ast: t.Program
    dependcies: Set<ModuleID>
    referredBy?: Set<ModuleID>
}

export interface Tip {
    type:
        | 'require_ref'
        | 'require_as_arg'
        | 'wrong_member'
        | 'runtime_helper'
        | 'wrong_module_fn'
        | 'unexcepted_situation'
    module: ModuleID
    src: string
}

export class Extractor {
    tips: Tip[]
    helpers: Set<Helper>

    constructor() {
        this.tips = []
        this.helpers = new Set()
    }

    resolve(entry: string): string {
        return path.resolve(entry)
    }

    async load(filename: string): Promise<string> {
        return await fs.readFile(filename, 'utf-8')
    }

    locateModules(file: t.File): NodePath<t.ObjectExpression> {
        let modulePath: NodePath<t.ObjectExpression> | null = null
        traverse(file, {
            ObjectExpression: {
                enter(path) {
                    if (path.node.loc) {
                        const lengthIsPer95 =
                            (path.node.end || 0 - (path.node.start || 0)) /
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

    async graph(entry_or_entries: string | string[]): Promise<ModuleGraph> {
        if (!Array.isArray(entry_or_entries)) {
            entry_or_entries = [entry_or_entries]
        }

        const graph: ModuleGraph = {}

        for (const entry of entry_or_entries) {
            const filename = this.resolve(entry)
            const code = await this.load(entry)

            const ast = parse(code)
            const path = this.locateModules(ast)

            path.node.properties.forEach((property, index) => {
                if (t.isObjectProperty(property)) {
                    let key: string
                    if (t.isNumericLiteral(property.key)) {
                        key = property.key.value.toString()
                    } else if (t.isIdentifier(property.key)) {
                        key = property.key.name
                    } else if (t.isStringLiteral(property.key)) {
                        key = property.key.value
                    } else {
                        return
                    }
                    const root = path.get(`properties.${index}.value`)
                    const moduleInfo = this.transform(
                        key as ModuleID,
                        root as NodePath<t.FunctionExpression>
                    )

                    graph[key as ModuleID] = {
                        ...moduleInfo,
                        filename,
                        name: this.rewrite(key as ModuleID),
                    }
                }
            })
        }
        return graph
    }

    /**
     * The function recvives the original id and returns the filename of code file.
     * If your want to change the filename, this will help.
     * @param id module ID
     * @returns Rewrited ID
     */
    rewrite(id: ModuleID): string {
        if (id === WEBPACK_HELPER_ID) {
            return WEBPACK_HELPER_ID + '.cjs'
        }
        return id + '.cjs'
    }

    transform(
        id: ModuleID,
        root: NodePath<t.FunctionExpression>
    ): {
        id: ModuleID
        ast: t.Program
        dependcies: Set<ModuleID>
    } {
        const deps = new Set<ModuleID>()

        const addPatch = (name: Helper) => {
            this.helpers.add(name)
            deps.add(WEBPACK_HELPER_ID as ModuleID)
            return `require('./${this.rewrite(
                WEBPACK_HELPER_ID as ModuleID
            )}').require${name.toUpperCase()}`
        }

        const processRequire = (path: NodePath<t.Identifier>) => {
            const handleErrors = (type: Tip['type']) => {
                this.tips.push({
                    module: id,
                    type,
                    src: generate(path.parent).code,
                })
                // Don't add a comment because the node may be something that can't add a comment.
                // path.parentPath.addComment('leading', 'unresolved', false)
            }
            path.node.name = 'require'
            switch (path.parent.type) {
                case 'CallExpression':
                    const args = path.parent.arguments
                    if (
                        args.length == 1 &&
                        (t.isNumericLiteral(args[0]) ||
                            t.isStringLiteral(args[0]))
                    ) {
                        const depID = args[0].value.toString()
                        deps.add(depID as ModuleID)

                        // TODO: relative import

                        path.parent.arguments = [
                            t.stringLiteral(
                                './' + this.rewrite(depID as ModuleID)
                            ),
                        ]

                        // replace random single import name with import${moduleId}
                        if (
                            path.parentPath?.parentPath?.isVariableDeclarator() &&
                            t.isIdentifier(
                                path.parentPath.parentPath.node.id
                            ) &&
                            path.parentPath.parentPath.node.id.name.length <=
                                2
                        ) {
                            path.parentPath.parentPath
                                .get('id')
                                .scope.rename(
                                    path.parentPath.parentPath.node.id.name,
                                    `import_${depID}`
                                )
                        }
                    } else {
                        handleErrors('require_as_arg')
                    }
                    break
                case 'MemberExpression':
                    if (
                        !(
                            !path.parent.computed &&
                            path.parent.property.type === 'Identifier' &&
                            path.parentKey === 'object'
                        )
                    ) {
                        handleErrors('wrong_member')
                        break
                    }

                    const helperName = path.parent.property.name
                    if (
                        helperName === 'd' &&
                        path.parentPath?.parentPath?.isCallExpression({
                            callee: path.parent,
                        }) &&
                        path.parentPath.parentPath.node.arguments.length ===
                            2 &&
                        t.isIdentifier(
                            path.parentPath.parentPath.node.arguments[0],
                            { name: 'exports' }
                        )
                    ) {
                        // replace webpack rename
                        const props =
                            path.parentPath.parentPath.node.arguments[1]
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
                                // exports.somethingToExport = ...
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
                        path.parentPath.parentPath.node.arguments.length ===
                            1 &&
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
                                path.parentPath.parentPath.parentPath.node.id
                                    .name,
                                `${path.parentPath.parentPath.node.arguments[0].name}$n`
                            )
                        const call = addPatch(helperName)
                        path.parentPath.replaceWithSourceString(call)
                    } else if (isHelper(helperName)) {
                        // `d`, `r`, `hmd`, `nmd` and `n` (be used elsewhere)
                        const call = addPatch(helperName)
                        path.parentPath.replaceWithSourceString(call)
                    } else {
                        handleErrors('runtime_helper')
                    }
                    break

                default:
                    handleErrors('require_ref')
            }
        }

        const params = root.node.params.filter((param, index) => {
            if (!t.isIdentifier(param)) {
                let paramPath = root.get('params.' + index)
                if (Array.isArray(paramPath)) {
                    paramPath = paramPath[0]
                }
                this.tips.push({
                    type: 'wrong_module_fn',
                    module: id,
                    src: paramPath.getSource(),
                })
                return false
            }
            return true
        }) as t.Identifier[]

        const moduleName = params[0]?.name
        const exportsName = params[1]?.name
        const requireName = params[2]?.name

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

    async emitHelper(output: string) {
        let code = concatHelper(this.helpers)
        if (!code) {
            return
        }
        await fs.writeFile(
            output + '/' + this.rewrite(WEBPACK_HELPER_ID as ModuleID),
            code,
            'utf-8'
        )
    }

    analyze(modules: ModuleGraph) {
        const refmap: Record<ModuleID, Set<ModuleID>> = {}
        for (const [id, info] of Object.entries(modules)) {
            for (const dep of info.dependcies) {
                if (!refmap[dep]) {
                    refmap[dep] = new Set()
                }
                refmap[dep].add(id as ModuleID)
            }
        }
        for (const id of Object.keys(modules) as ModuleID[]) {
            modules[id].referredBy = refmap[id] || new Set()
        }
    }

    async emit(module: ModuleInfo, outputdir: string) {
        const problems = this.tips
            .filter(tip => tip.module === module.id)
            .map(({ type, src }) => {
                src = src.replaceAll(/\/\*(.*?)\*\//g, '')
                return `${type} -> ${src}`
            })
        const deps = [...module.dependcies].map(dep => this.rewrite(dep))
        const referredBy = module.referredBy
            ? [...module.referredBy].map(mod => this.rewrite(mod))
            : null

        const banner = `/**
 * Filename: ${this.rewrite(module.id)}
 * Bundle Name: ${module.filename}
 *
 * This file is a part of bundle ${path.basename(
     module.filename
 )} and is automatically 
 * generated by the decompile tool for reference only.
 * 
 * The author of the tool is not responsible for any consequences 
 * caused by the use of the tool, and the copyright belongs to 
 * the author of the original source code. Do not distribute.
 * 
 * Depends: ${deps.length ? deps.join(', ') : 'None'}
 * 
 * Referred by: ${
     referredBy === null
         ? 'Data missing'
         : referredBy.length
           ? referredBy.join(', ')
           : 'None'
 }
 * 
 * ${
     problems.length
         ? 'Problems:' + problems.map(p => '\n * ' + p).join('')
         : 'No problem found in this file :)'
 }
 */
`

        let source = await formatSource(module.ast)

        let filepath = path.join(outputdir, this.rewrite(module.id))
        let dirname = path.dirname(filepath)
        try {
            await fs.mkdir(dirname, { recursive: true })
        } catch (err) {
            /* Do nothing */
        }
        await fs.writeFile(filepath, banner + source, 'utf-8')
    }

    formatTips() {
        let strings: string[] = []
        for (const tip of this.tips) {
            const { module, type, src } = tip
            strings.push(`${type} from ${this.rewrite(module)}: ${src}`)
        }
        return strings.join('\n')
    }
}

export interface Options {
    entries: string[]
    output: string
    log?: boolean
}

export async function unbundle(options: Options) {
    const extractor = new Extractor()

    const log = options.log ? console.log : () => {}

    log('[1/3] Graph and Transform The Modules')
    const graph = await extractor.graph(options.entries)

    const nums_of_modules = Object.keys(graph).length
    log(
        `Found ${nums_of_modules} modules in ${options.entries.length} file(s).`
    )

    log('[2/3] Analyze The Modules')

    extractor.analyze(graph)

    log('[3/3] Emit The Modules and The Helper')

    await Promise.all(
        Object.values(graph).map(module =>
            extractor.emit(module, options.output)
        )
    )

    await extractor.emitHelper(options.output)

    log('Tips:\n' + extractor.formatTips())
}

if (module === require.main) {
    ;(async () => {
        await fs.rm('./test/test-unbundle.out', {
            recursive: true,
            force: true,
        })
        await unbundle({
            entries: (await fs.readdir('./test/test-unbundle'))
                .filter(p => p.endsWith('.js'))
                .map(p => path.join('./test/test-unbundle', p)),
            output: './test/test-unbundle.out',
            log: true,
        })
    })()
}
