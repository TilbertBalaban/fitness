module.exports = {
  preset: 'jest-expo',
  reporters: ['default', '<rootDir>/../../scripts/jest-suite-integrity.cjs'],
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|nativewind|react-native-css-interop|@powersync|@journeyapps|comlink))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};
