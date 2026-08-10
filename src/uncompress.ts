import generate from '@babel/generator'
import { parse } from '@babel/parser'
import type { Visitor } from '@babel/traverse'
import traverse from '@babel/traverse'
import * as t from '@babel/types'
import prettier from 'prettier'

import anchorPropagation from './components/anchor-propagation'
import callbackToArrow from './components/callback-to-arrow'
import complexToReference from './components/complex-to-reference'
import conditionTransformIf from './components/condition-transform-if'
import constantFold from './components/constant-fold'
import expandVariableDeclarations from './components/expand-variable-declarations'
import extractNestExpression from './components/extract-nest-expression'
import forInitVar from './components/for-init-var'
import forToWhile from './components/for-to-while'
import literalKeyToIdentifier from './components/literal-key-to-identifer'
import moreReadable from './components/more-readable'
import promiseExecuterArgumentRewrite from './components/promise-executer-argument-rewrite'
import rawToReadable from './components/raw-to-readable'
import removeUnusedConstants from './components/remove-unused-constants'
import statementToBlock from './components/statement-to-block'
import swapEquels from './components/swap-equels'
import tryCatchArgumentRewrite from './components/try-catch-argument-rewrite'

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
