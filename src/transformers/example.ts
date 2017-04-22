import {
	createIdentifier,
	Identifier,
	setTextRange,
	SyntaxKind,
} from 'typescript'
import { FileTransformer, transformKinds } from '../helpers'

export const replaceIdentifiersNamedOldNameWithName: FileTransformer = transformKinds({
	[SyntaxKind.Identifier]: (node: Identifier) => {
		if (node.text === 'oldName') {
			return setTextRange(createIdentifier('name'), node)
		}
		return node
	},
})
