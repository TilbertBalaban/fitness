export * from './result';
export * from './expected-performance';
export * from './failure-progression';
export * from './normalize-history';
export * from './preference';
export * from './rir-band';
export * from './shortfall';
export * from './snap';
export * from './recommend';
// D-08: this package is private and workspace-only, never published, so re-exporting a test
// fixture from the public barrel costs every consumer nothing but bytes. The alternative — a deep
// import into dist/__fixtures__/parity.js — would couple apps/api and apps/mobile to this
// package's compiled internal layout and break the moment progression-engine gains a subpath
// export map; this line is what lets both apps import PROGRESSION_PARITY_FIXTURES the same way
// they import recommendNextPrescription.
export * from './__fixtures__/parity';
