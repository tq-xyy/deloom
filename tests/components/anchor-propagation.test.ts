import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import anchorPropagation, {
    typeToRoleName,
} from '../../src/components/anchor-propagation'
import { transform } from '../helpers'

describe('anchor-propagation: ObjectProperty anchor', () => {
    test('readable key + minified value -> rename value and use shorthand', () => {
        assert.equal(
            transform(
                `var a = 1, b = 2; var o = { options: a, success: b };`,
                anchorPropagation
            ),
            `var options = 1,\n  success = 2;\nvar o = {\n  options,\n  success\n};`
        )
    })

    test('key length < 4 untouched', () => {
        assert.equal(
            transform(`var o = { ab: a };`, anchorPropagation),
            `var o = {\n  ab: a\n};`
        )
    })

    test('non-minified value untouched', () => {
        assert.equal(
            transform(`var o = { options: abc };`, anchorPropagation),
            `var o = {\n  options: abc\n};`
        )
    })

    test('computed key untouched', () => {
        assert.equal(
            transform(`var o = { ['options']: a };`, anchorPropagation),
            `var o = {\n  ['options']: a\n};`
        )
    })

    test('numeric key untouched', () => {
        assert.equal(
            transform(`var o = { 1: a };`, anchorPropagation),
            `var o = {\n  1: a\n};`
        )
    })

    test('non-identifier value untouched', () => {
        assert.equal(
            transform(`var o = { options: f() };`, anchorPropagation),
            `var o = {\n  options: f()\n};`
        )
    })

    test('invalid identifier key untouched', () => {
        assert.equal(
            transform(`var o = { 'foo-bar': a };`, anchorPropagation),
            `var o = {\n  'foo-bar': a\n};`
        )
    })
})

describe('anchor-propagation: VariableDeclarator anchor', () => {
    test('var o = this -> var self = this', () => {
        assert.equal(
            transform(`var o = this;`, anchorPropagation),
            `var self = this;`
        )
    })

    test('reassigned binding untouched', () => {
        assert.equal(
            transform(`var o = this; o = 1;`, anchorPropagation),
            `var o = this;\no = 1;`
        )
    })

    test('new XMLHttpRequest -> xhr', () => {
        assert.equal(
            transform(`var x = new XMLHttpRequest();`, anchorPropagation),
            `var xhr = new XMLHttpRequest();`
        )
    })

    test('new FooBar -> fooBar (camelCase fallback)', () => {
        assert.equal(
            transform(`var x = new FooBar();`, anchorPropagation),
            `var fooBar = new FooBar();`
        )
    })

    test('short class name without role name untouched', () => {
        assert.equal(
            transform(`var x = new Foo();`, anchorPropagation),
            `var x = new Foo();`
        )
    })

    test('non-identifier callee untouched', () => {
        assert.equal(
            transform(`var x = new (foo())();`, anchorPropagation),
            `var x = new (foo())();`
        )
    })

    test('plain init untouched', () => {
        assert.equal(transform(`var x = 1;`, anchorPropagation), `var x = 1;`)
    })

    test('named alias not propagated: var a = data unchanged (avoids shadowing outer source name)', () => {
        assert.equal(
            transform(`var a = data;`, anchorPropagation),
            `var a = data;`
        )
        assert.equal(
            transform(`var a = someReadableName;`, anchorPropagation),
            `var a = someReadableName;`
        )
    })

    test('literal reserved-word key not propagated (prevents invalid var false)', () => {
        assert.equal(
            transform(`var a = 1; var o = { false: a };`, anchorPropagation),
            `var a = 1;\nvar o = {\n  false: a\n};`
        )
        assert.equal(
            transform(`var a = 1; var o = { true: a };`, anchorPropagation),
            `var a = 1;\nvar o = {\n  true: a\n};`
        )
        assert.equal(
            transform(`var a = 1; var o = { null: a };`, anchorPropagation),
            `var a = 1;\nvar o = {\n  null: a\n};`
        )
    })

    test('non-minified id untouched', () => {
        assert.equal(
            transform(`var abc = this;`, anchorPropagation),
            `var abc = this;`
        )
    })

    test('destructured id untouched', () => {
        assert.equal(
            transform(`var { a } = this;`, anchorPropagation),
            `var {\n  a\n} = this;`
        )
    })
})

describe('typeToRoleName', () => {
    test('special-case mappings', () => {
        assert.equal(typeToRoleName('XMLHttpRequest'), 'xhr')
        assert.equal(typeToRoleName('WebSocket'), 'ws')
        assert.equal(typeToRoleName('Worker'), 'worker')
        assert.equal(typeToRoleName('AbortController'), 'abortController')
        assert.equal(typeToRoleName('URLSearchParams'), 'params')
        assert.equal(typeToRoleName('FormData'), 'formData')
        assert.equal(typeToRoleName('FileReader'), 'reader')
        assert.equal(typeToRoleName('Blob'), 'blob')
        assert.equal(typeToRoleName('Image'), 'image')
        assert.equal(typeToRoleName('Audio'), 'audio')
    })

    test('long name camelCase fallback', () => {
        assert.equal(typeToRoleName('FooBarBaz'), 'fooBarBaz')
        assert.equal(typeToRoleName('constructor'), 'constructor')
    })

    test('short name returns null', () => {
        assert.equal(typeToRoleName('Foo'), null)
    })
})

describe('anchor-propagation: AssignmentExpression anchor', () => {
    test('this.xxx = minified function -> renamed', () => {
        assert.equal(
            transform(
                `function n() {} this.playNoteAtNumber = n;`,
                anchorPropagation
            ),
            `function playNoteAtNumber() {}\nthis.playNoteAtNumber = playNoteAtNumber;`
        )
    })

    test('readable object.prop = minified function -> renamed', () => {
        assert.equal(
            transform(`function n() {} foo.bar = n;`, anchorPropagation),
            `function bar() {}\nfoo.bar = bar;`
        )
    })

    test('computed string property handled the same', () => {
        assert.equal(
            transform(`function n() {} foo['bar'] = n;`, anchorPropagation),
            `function bar() {}\nfoo['bar'] = bar;`
        )
    })

    test('non-readable property name untouched', () => {
        assert.equal(
            transform(`function n() {} this.ab = n;`, anchorPropagation),
            `function n() {}\nthis.ab = n;`
        )
        assert.equal(
            transform(
                `function n() {} foo['bar-baz'] = n;`,
                anchorPropagation
            ),
            `function n() {}\nfoo['bar-baz'] = n;`
        )
    })

    test('object not this/readable identifier untouched', () => {
        assert.equal(
            transform(`function n() {} a.b = n;`, anchorPropagation),
            `function n() {}\na.b = n;`
        )
        assert.equal(
            transform(`function n() {} foo.bar.baz = n;`, anchorPropagation),
            `function n() {}\nfoo.bar.baz = n;`
        )
    })

    test('property not identifier/string untouched', () => {
        assert.equal(
            transform(`function n() {} this[0] = n;`, anchorPropagation),
            `function n() {}\nthis[0] = n;`
        )
    })

    test('right side not identifier untouched', () => {
        assert.equal(
            transform(`foo.bar = 1;`, anchorPropagation),
            `foo.bar = 1;`
        )
        assert.equal(
            transform(`foo.bar = f();`, anchorPropagation),
            `foo.bar = f();`
        )
    })

    test('right side not minified untouched', () => {
        assert.equal(
            transform(`foo.bar = abc;`, anchorPropagation),
            `foo.bar = abc;`
        )
    })

    test('right-side binding not a function untouched', () => {
        assert.equal(
            transform(`var n = 1; foo.bar = n;`, anchorPropagation),
            `var n = 1;\nfoo.bar = n;`
        )
    })

    test('right-side binding without init untouched (var n; uninitialized)', () => {
        assert.equal(
            transform(`var n; foo.bar = n;`, anchorPropagation),
            `var n;\nfoo.bar = n;`
        )
    })

    test('right side is arrow function declared with var', () => {
        assert.equal(
            transform(`var n = () => {}; foo.bar = n;`, anchorPropagation),
            `var bar = () => {};\nfoo.bar = bar;`
        )
    })

    test('right side is named function expression (self-reference in body)', () => {
        assert.equal(
            transform(
                `foo.bar = (function n() { foo.bar = n });`,
                anchorPropagation
            ),
            `foo.bar = function bar() {\n  foo.bar = bar;\n};`
        )
    })
})

describe('anchor-propagation: function param callback fallback naming', () => {
    test('called minified param -> callback', () => {
        assert.equal(
            transform(`function f(a) { a() }`, anchorPropagation),
            `function f(callback) {\n  callback();\n}`
        )
    })

    test('param as value of readable object key -> yields to ObjectProperty anchor', () => {
        assert.equal(
            transform(
                `function f(a) { return { options: a } }`,
                anchorPropagation
            ),
            `function f(options) {\n  return {\n    options\n  };\n}`
        )
    })

    test('param reference in computed-key object -> no yield', () => {
        assert.equal(
            transform(
                `function f(a) { return { ['options']: a } }`,
                anchorPropagation
            ),
            `function f(a) {\n  return {\n    ['options']: a\n  };\n}`
        )
    })

    test('param reference in object key position -> no yield (value is not the reference itself)', () => {
        assert.equal(
            transform(`function f(a) { return { a: 1 } }`, anchorPropagation),
            `function f(a) {\n  return {\n    a: 1\n  };\n}`
        )
    })

    test('param reference in numeric-key object value -> no yield (key not identifier)', () => {
        assert.equal(
            transform(`function f(a) { return { 1: a } }`, anchorPropagation),
            `function f(a) {\n  return {\n    1: a\n  };\n}`
        )
    })

    test('a.call(x) recognized', () => {
        assert.equal(
            transform(`function f(a) { a.call(x) }`, anchorPropagation),
            `function f(callback) {\n  callback.call(x);\n}`
        )
    })

    test('a.apply(x) recognized', () => {
        assert.equal(
            transform(`function f(a) { a.apply(x) }`, anchorPropagation),
            `function f(callback) {\n  callback.apply(x);\n}`
        )
    })

    test('member call a.b() not recognized', () => {
        assert.equal(
            transform(`function f(a) { a.b() }`, anchorPropagation),
            `function f(a) {\n  a.b();\n}`
        )
    })

    test('referenced but not called not recognized', () => {
        assert.equal(
            transform(`function f(a) { return a }`, anchorPropagation),
            `function f(a) {\n  return a;\n}`
        )
    })

    test('anonymous function expression param', () => {
        assert.equal(
            transform(`f(function (a) { a() });`, anchorPropagation),
            `f(function (callback) {\n  callback();\n});`
        )
    })

    test('var-declared function expression param', () => {
        assert.equal(
            transform(`var f = function (a) { a() };`, anchorPropagation),
            `var f = function (callback) {\n  callback();\n};`
        )
    })

    test('multiple params: only called one is processed', () => {
        assert.equal(
            transform(`function f(a, b) { a() }`, anchorPropagation),
            `function f(callback, b) {\n  callback();\n}`
        )
    })

    test('non-minified param name untouched', () => {
        assert.equal(
            transform(`function f(abc) { abc() }`, anchorPropagation),
            `function f(abc) {\n  abc();\n}`
        )
    })

    test('destructured param untouched', () => {
        assert.equal(
            transform(`function f({ a }) { a() }`, anchorPropagation),
            `function f({\n  a\n}) {\n  a();\n}`
        )
    })

    test('a.bind(x) not recognized as call', () => {
        assert.equal(
            transform(`function f(a) { a.bind(x) }`, anchorPropagation),
            `function f(a) {\n  a.bind(x);\n}`
        )
    })

    test('a in a.c.call() is only an object, not recognized', () => {
        assert.equal(
            transform(`function f(a) { a.c.call() }`, anchorPropagation),
            `function f(a) {\n  a.c.call();\n}`
        )
    })

    test('a["call"]() computed property not recognized', () => {
        assert.equal(
            transform(`function f(a) { a['call']() }`, anchorPropagation),
            `function f(a) {\n  a['call']();\n}`
        )
    })

    test('param as argument of another call not recognized (callee is not the reference itself)', () => {
        assert.equal(
            transform(`function f(b) { a(b) }`, anchorPropagation),
            `function f(b) {\n  a(b);\n}`
        )
    })

    test('a.call not called not recognized', () => {
        assert.equal(
            transform(`function f(a) { var g = a.call }`, anchorPropagation),
            `function f(a) {\n  var g = a.call;\n}`
        )
    })

    test('(a.call).b() where a.call is not callee not recognized', () => {
        assert.equal(
            transform(`function f(a) { (a.call).b() }`, anchorPropagation),
            `function f(a) {\n  a.call.b();\n}`
        )
    })

    test('a.#x() private property access not recognized as call', () => {
        assert.equal(
            transform(`class A { #x; m(a) { a.#x() } }`, anchorPropagation),
            `class A {\n  #x;\n  m(a) {\n    a.#x();\n  }\n}`
        )
    })
})

describe('anchor-propagation: call-site argument anchor', () => {
    test('readable argument -> param renamed (yields to this rule)', () => {
        assert.equal(
            transform(
                `function f(a) { success(a) } f(success);`,
                anchorPropagation
            ),
            `function f(success) {\n  success(success);\n}\nf(success);`
        )
    })

    test('function declaration target', () => {
        assert.equal(
            transform(`function f(a) { } f(abc);`, anchorPropagation),
            `function f(abc) {}\nf(abc);`
        )
    })

    test('var function expression target', () => {
        assert.equal(
            transform(`var f = function (a) { }; f(abc);`, anchorPropagation),
            `var f = function (abc) {};\nf(abc);`
        )
    })

    test('var arrow function target', () => {
        assert.equal(
            transform(`var f = (a) => { }; f(abc);`, anchorPropagation),
            `var f = abc => {};\nf(abc);`
        )
    })

    test('non-function target untouched', () => {
        assert.equal(
            transform(`var f = 1; f(abc);`, anchorPropagation),
            `var f = 1;\nf(abc);`
        )
    })

    test('callee without binding untouched', () => {
        assert.equal(transform(`foo(a);`, anchorPropagation), `foo(a);`)
    })

    test('no arguments untouched', () => {
        assert.equal(
            transform(`function f(a) { } f();`, anchorPropagation),
            `function f(a) {}\nf();`
        )
    })

    test('non-identifier argument untouched', () => {
        assert.equal(
            transform(`function f(a) { } f(1);`, anchorPropagation),
            `function f(a) {}\nf(1);`
        )
    })

    test('non-minified param untouched', () => {
        assert.equal(
            transform(`function f(foo) { } f(abc);`, anchorPropagation),
            `function f(foo) {}\nf(abc);`
        )
    })

    test('non-readable argument untouched', () => {
        assert.equal(
            transform(`function f(a) { } f(ab);`, anchorPropagation),
            `function f(a) {}\nf(ab);`
        )
    })

    test('extra arguments truncated', () => {
        assert.equal(
            transform(`function f(a) { } f(abc, def);`, anchorPropagation),
            `function f(abc) {}\nf(abc, def);`
        )
    })
})
