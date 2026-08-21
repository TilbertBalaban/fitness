module.exports = {
  preset: 'jest-expo',
  reporters: ['default', '<rootDir>/../../scripts/jest-suite-integrity.cjs'],
  // Playwright suites live in e2e/ and run via `playwright test` (test:e2e), never via Jest —
  // Playwright's own test runner refuses to execute inside Jest's process.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e/'],
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|nativewind|react-native-css-interop|@powersync|@journeyapps|comlink|react-native-tab-view|react-native-gesture-handler|react-native-reanimated|react-native-worklets|react-native-pager-view))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};
