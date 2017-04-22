module.exports = {
	moduleFileExtensions: ['js', 'json', 'ts'],
	mapCoverage: true,
	testEnvironment: 'node',
	testRegex: '.test.ts$',
	transform: {
		'.ts': '<rootDir>/node_modules/ts-jest/preprocessor.js'
	}
}
