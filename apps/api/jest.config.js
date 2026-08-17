module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testEnvironment: 'node',
  testRegex: '\\.spec\\.ts$',
  reporters: ['default', '<rootDir>/../../scripts/jest-suite-integrity.cjs'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  testTimeout: 30000,
};
