import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
    identifierIsVaild,
    isMinifiedName,
    isReadableName,
    renameToDesired,
} from '../src/components/shared'
import { withScope } from './helpers'

describe('identifierIsVaild', () => {
    test('valid identifiers', () => {
        assert.equal(identifierIsVaild('foo'), true)
        assert.equal(identifierIsVaild('fooBar1'), true)
        assert.equal(identifierIsVaild('_foo'), true)
        assert.equal(identifierIsVaild('$foo'), true)
    })

    test('invalid formats', () => {
        assert.equal(identifierIsVaild('1foo'), false)
        assert.equal(identifierIsVaild('foo-bar'), false)
        assert.equal(identifierIsVaild(''), false)
    })

    test('keywords rejected', () => {
        for (const kw of [
            'break',
            'class',
            'const',
            'continue',
            'debugger',
            'default',
            'delete',
            'do',
            'else',
            'enum',
            'export',
            'extends',
            'finally',
            'for',
            'function',
            'if',
            'implements',
            'import',
            'in',
            'instanceof',
            'interface',
            'let',
            'new',
            'package',
            'private',
            'protected',
            'public',
            'return',
            'static',
            'super',
            'switch',
            'this',
            'throw',
            'try',
            'typeof',
            'var',
            'void',
            'while',
            'with',
            'yield',
        ]) {
            assert.equal(
                identifierIsVaild(kw),
                false,
                `keyword ${kw} should be rejected`
            )
        }
    })

    test('false/null/true literal reserved words rejected (prevents invalid var false)', () => {
        assert.equal(identifierIsVaild('false'), false)
        assert.equal(identifierIsVaild('null'), false)
        assert.equal(identifierIsVaild('true'), false)
    })

    test('strict-mode reserved names rejected', () => {
        assert.equal(identifierIsVaild('arguments'), false)
        assert.equal(identifierIsVaild('eval'), false)
    })
})

describe('isMinifiedName', () => {
    test('1-2 char short names', () => {
        assert.equal(isMinifiedName('a'), true)
        assert.equal(isMinifiedName('ab'), true)
        assert.equal(isMinifiedName('a1'), true)
        assert.equal(isMinifiedName('_'), true)
        assert.equal(isMinifiedName('$'), true)
    })

    test('names with 3+ chars are not minified', () => {
        assert.equal(isMinifiedName('abc'), false)
        assert.equal(isMinifiedName('ab1'), false)
    })

    test('underscore obfuscated names', () => {
        assert.equal(isMinifiedName('_0x123'), true)
        assert.equal(isMinifiedName('_$ab'), true)
        assert.equal(isMinifiedName('_abc'), true)
        assert.equal(isMinifiedName('_'), true)
    })

    test('long names not starting with underscore are not minified', () => {
        assert.equal(isMinifiedName('a0x123'), false)
    })
})

describe('isReadableName', () => {
    test('readable names', () => {
        assert.equal(isReadableName('foo'), true)
        assert.equal(isReadableName('options'), true)
    })

    test('minified names not readable', () => {
        assert.equal(isReadableName('a'), false)
        assert.equal(isReadableName('ab'), false)
        assert.equal(isReadableName('_0x123'), false)
    })

    test('invalid identifiers not readable', () => {
        assert.equal(isReadableName('foo-bar'), false)
    })

    test('keywords not readable', () => {
        assert.equal(isReadableName('while'), false)
    })
})

describe('renameToDesired', () => {
    test('oldName already desiredName: returned as-is', () => {
        const out = withScope(`var a = 1;`, scope => {
            const r = renameToDesired(scope, 'a', 'a')
            assert.equal(r, 'a')
        })
        assert.equal(out, `var a = 1;`)
    })

    test('binding missing: desiredName returned directly', () => {
        const out = withScope(`var a = 1;`, scope => {
            const r = renameToDesired(scope, 'nonexistent', 'b')
            assert.equal(r, 'b')
        })
        assert.equal(out, `var a = 1;`)
    })

    test('normal rename', () => {
        const out = withScope(`var a = 1;`, scope => {
            const r = renameToDesired(scope, 'a', 'b')
            assert.equal(r, 'b')
        })
        assert.equal(out, `var b = 1;`)
    })

    test('name taken: numeric suffix appended', () => {
        const out = withScope(`var a = 1, b = 2;`, scope => {
            const r = renameToDesired(scope, 'a', 'b')
            assert.equal(r, 'b1')
        })
        assert.equal(out, `var b1 = 1,\n  b = 2;`)
    })

    test('suffix also taken: keeps incrementing', () => {
        const out = withScope(`var a = 1, b = 2, b1 = 3;`, scope => {
            const r = renameToDesired(scope, 'a', 'b')
            assert.equal(r, 'b2')
        })
        assert.equal(out, `var b2 = 1,\n  b = 2,\n  b1 = 3;`)
    })

    test('reservedNames treated as taken', () => {
        const out = withScope(`var a = 1;`, scope => {
            const r = renameToDesired(scope, 'a', 'b', ['b'])
            assert.equal(r, 'b1')
        })
        assert.equal(out, `var b1 = 1;`)
    })

    test('non-conflicting reservedNames rename normally', () => {
        const out = withScope(`var a = 1;`, scope => {
            const r = renameToDesired(scope, 'a', 'b', ['c'])
            assert.equal(r, 'b')
        })
        assert.equal(out, `var b = 1;`)
    })

    test('consecutive reservedNames increment', () => {
        const out = withScope(`var a = 1;`, scope => {
            const r = renameToDesired(scope, 'a', 'b', ['b', 'b1'])
            assert.equal(r, 'b2')
        })
        assert.equal(out, `var b2 = 1;`)
    })

    test('child-scope binding not treated as taken (no shadowing conflict)', () => {
        const out = withScope(
            `function f() { var b = 1 } var a = 1;`,
            scope => {
                const r = renameToDesired(scope, 'a', 'b')
                assert.equal(r, 'b')
            }
        )
        assert.equal(out, `function f() {\n  var b = 1;\n}\nvar b = 1;`)
    })
})
