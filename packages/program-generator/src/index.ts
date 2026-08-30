export * from './result';
export * from './candidate-pool';
export * from './split-templates';
export * from './volume-landmarks';
export * from './slot-fill';
export * from './emphasis';
export * from './session-length';
export * from './degradation';
export * from './deload';
export * from './generate';
// GEN-07: this package is private and workspace-only, never published, so re-exporting a test
// fixture from the public barrel costs every consumer nothing but bytes. The alternative — a deep
// import into dist/__fixtures__/parity.js — would couple apps/api and apps/mobile to this
// package's compiled internal layout and break the moment program-generator gains a subpath
// export map; this line is what lets both apps import GENERATION_PARITY_FIXTURES the same way
// they import generateProgram.
export * from './__fixtures__/parity';
