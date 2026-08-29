module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  reporters: ['default', '<rootDir>/../../scripts/jest-suite-integrity.cjs'],
};
