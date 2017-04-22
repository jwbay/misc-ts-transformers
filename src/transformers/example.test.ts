import { stripIndent } from 'common-tags'
import { createAsserter } from '../testHelpers'
import { replaceIdentifiersNamedOldNameWithName } from './example'

const testCase = createAsserter(replaceIdentifiersNamedOldNameWithName)

testCase('works', stripIndent`
	const oldName = 42;
	function asdf(oldName) {
		console.log(oldName);
	}
	asdf(oldName);
`)

testCase('works too', stripIndent`
	class oldName {
		private oldName = 42;
	}
`)
