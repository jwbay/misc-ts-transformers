import { stripIndent } from 'common-tags'
import { createAsserter } from '../testHelpers'
import { inlineRequires } from './inlinerequires'

const testCase = createAsserter(inlineRequires)

testCase(`inlines requires for property access`, stripIndent`
	const path = require('path')
	const a = path.resolve('a')
	foo(path.resolve('b'))

	function foo(value) {
		return path.resolve('c')
		return path.foo.bar.resolve('c')
		return foo.path.bar.resolve('c')
	}
`, true)

testCase(`inlines requires for aliases`, stripIndent`
	const path = require('path')

	const alias = path
	alias.resolve('a')

	function foo(value) {
		const alias = path
		alias.resolve('b')
	}
`, true)

testCase(`inlines requires for calls`, stripIndent`
	const someFunction = require('some-function')
	const not = {
		someFunction: () => { }
	}

	someFunction()
	not.someFunction();

	function foo(value) {
		someFunction().do.something()
		return someFunction()
	}
`, true)

testCase(`inlines requires for initializers`, stripIndent`
	const someFunction = require('some-function')

	function foo(bar: any, a = someFunction, b = someFunction()) {
		const [{ c = someFunction }] = bar
		return c
	}

	class bar {
		private x = someFunction
		protected y = someFunction()
	}
`, true)

testCase(`inlines requires for ternaries`, stripIndent`
const path = require('path')

function foo() {
	let x;
	x = 0 ? 0 : 0;
	x = 0 ? path : 0;
	x = 0 ? 0 : path;
	x = 0 ? path : path;
	x = path ? path : 0;
	x = path ? 0 : path;
	x = path ? path : path;
	x = path ? path : () => path;
}
`, true)

testCase(`works with things named require`, stripIndent`
	var require = 42
	parseInt(require, 10)
	function require(x: any) {
		return x.require
	}
`, true)

testCase(`doesn't break with empty source files`, stripIndent`

`, true)

testCase(`doesn't break when required modules are names elsewhere`, stripIndent`
	const path = require('path')

	const x = {
		path: 42
	}

	x.path.toString()
`, true)

testCase(`works with call arguments`, stripIndent`
	const path = require('path')

	function foo() {}

	foo(path)
	foo(0 ? path : 1)
	foo(0, path)
`, true)

testCase(`works with returns`, stripIndent`
	const path = require('path')

	function foo() {
		if (false) {
			return path;
		}

		if (false) {
			return () => path;
		}

		return [path, () => path]
	}
`, true)

testCase(`works with JSX elements`, stripIndent`
	const Component = require('Component');
	const Local = (props) => <div/>;

	function Test(props) {
		return (
			<div>
				<Component prop={ 42 } />
				<Local />
				{ Component }
				{ true && Component }
				<Local prop={ Component } />
			</div>
		)
	}
`, true)

testCase(`element access`, stripIndent`
	const KEY = require('key');
	const other = { KEY: 42 };

	const foo = {
		[KEY.two]: true,
		[other]: true,
		[other.KEY]: true,
	}

	function Test(props) {
		return (
			<div>
				<KEY.two />
				<other.KEY />
			</div>
		)
	}

`)

testCase(`functions`, stripIndent`
	const FOO = require('foo');

	function FOO() {}
	function foo(FOO) {}
	function foo(FOO: any) {}
`)
