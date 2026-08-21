// react-native-worklets' own jest mock (its NativeWorklets native module has no Jest double —
// react-native-reanimated 4's setUpTests() alone throws "Cannot read properties of undefined
// (reading 'loadUnpackersWithCode')" without this, since reanimated 4 delegates its native bridge
// to react-native-worklets rather than owning it directly).
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));

// react-native-reanimated's own testing setup (docs.swmansion.com/react-native-reanimated/docs/guides/testing).
// Reanimated initializes its native-module bridge at import time, before any hook runs — any test
// file that imports a component which imports react-native-reanimated (DragHandle.tsx, 04-05) fails
// to even load without this, not just at the point a reanimated hook is called.
require('react-native-reanimated').setUpTests();
