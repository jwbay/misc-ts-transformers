import {
	EmitHint,
	Node,
	SourceFile,
	SyntaxKind,
	TransformationContext,
} from 'typescript'

export type FileTransformer = (context: TransformationContext) => (node: SourceFile) => SourceFile

export function transformKinds(visitorMap: { [kind: number]: <T extends Node>(node: T, hint: EmitHint) => Node }) {
	return function transform(context: TransformationContext) {
		const previousOnSubstituteNode = context.onSubstituteNode
		const kinds: SyntaxKind[] = Object.keys(visitorMap).map(kind => parseInt(kind, 10))
		kinds.forEach(kind => context.enableSubstitution(kind))
		context.onSubstituteNode = (hint, node) => {
			node = previousOnSubstituteNode(hint, node)

			const kind = kinds.find(k => node.kind === k)
			if (kind) {
				node = visitorMap[kind](node, hint)
			}

			return node
		}
		return (file: SourceFile) => file
	}
}
