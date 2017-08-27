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
`)

testCase(`inlines requires for aliases`, stripIndent`
	const path = require('path')

	const alias = path
	alias.resolve('a')

	function foo(value) {
		const alias = path
		alias.resolve('b')
	}
`)

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
`)

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
`)

testCase(`inlines requires for arrays`, stripIndent`
	const path = require('path')

	function foo(value) {
		let x;
		x = [];
		x = [path];
		x = [0, path];
		x = [0, () => path]
	}
`)

testCase(`inlines requires for objects`, stripIndent`
	const path = require('path')

	function foo(value) {
		let x;
		x = { a: 0 };
		x = { a: path };
		x = { a: [path] };
		x = { a: 0, b: path };
	}
`)

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
`)

testCase(`works with things named require`, stripIndent`
	var require = 42
	parseInt(require, 10)
	function require(x: any) {
		return x.require
	}
`)

testCase(`doesn't break with empty source files`, stripIndent`

`)

testCase(`doesn't break when required modules are names elsewhere`, stripIndent`
	const path = require('path')

	const x = {
		path: 42
	}

	x.path.toString()
`)

testCase(`works with call arguments`, stripIndent`
	const path = require('path')

	function foo() {}

	foo(path)
	foo(0 ? path : 1)
	foo(0, path)
`)

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
`)

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
`)

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

testCase(`should not transform declarations`, stripIndent`
	const FOO = require('foo');

	function FOO() {
		let FOO;
	}
	function foo(FOO) {
		let { x: FOO } = { x: 42 }
	}
	function foo(FOO: any) {}
`)
