// This package is private and workspace-only, never published, and resolves through main/types
// alone — there is deliberately no subpath export map, matching progression-engine. Later plans in
// this phase append exactly one line each at the END of this file; do not reorder it.
export * from './constants';
export * from './chart-geometry';
export * from './exercise-series';
export * from './e1rm-display';
export * from './bucketing';
export * from './trend-series';
export * from './weekly-progress';
export * from './muscle-volume';
export * from './muscle-map';
