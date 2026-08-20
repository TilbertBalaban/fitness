// Module-local ambient declaration, not @types/node — same reasoning e2e/node-shims.d.ts records
// for node:child_process: __dirname resolves and works under Jest's Node runtime with zero
// packages, this line only teaches the type checker its shape.
declare const __dirname: string;

import { getExactRoutes } from 'expo-router/build/getRoutes';
import { inMemoryContext, requireContext } from 'expo-router/build/internal/testing';

const APP_DIR = `${__dirname}/../../../app`;

// Verbatim copy of expo-router/_ctx.js's own regex — the file Metro actually evaluates in
// production — so this test sees exactly the files Metro would, not an approximation of them.
const PRODUCTION_ROUTE_REGEX = /^(?:\.\/)(?!(?:(?:(?:.*\+api)|(?:\+html)))\.[tj]sx?$).*\.[tj]sx?$/;

function isRouteFile(key: string): boolean {
  return !key.includes('__tests__') && !key.endsWith('.test.ts') && !key.endsWith('.test.tsx') && !key.endsWith('.d.ts');
}

// Only the key list comes from disk here. inMemoryContext never calls the route modules
// themselves, so global.css, PowerSync's ESM dist and expo-secure-store's native module never load.
function buildRouteTree(keys: string[]) {
  const context = inMemoryContext(Object.fromEntries(keys.map((key) => [key, () => null])));
  return getExactRoutes(context)!;
}

const realKeys = requireContext(APP_DIR, true, PRODUCTION_ROUTE_REGEX).keys().filter(isRouteFile);

describe('exercises route hoisting (WR-03 regression)', () => {
  it('sanity: the real app directory contains the exercises segment layout', () => {
    expect(realKeys).toContain('./exercises/_layout.tsx');
  });

  describe('Case A: the real app directory', () => {
    const tree = buildRouteTree(realKeys);

    it('has exactly one root-level child named exercises, of type layout', () => {
      const exercisesChildren = tree.children.filter((child) => child.route === 'exercises');
      expect(exercisesChildren).toHaveLength(1);
      expect(exercisesChildren[0].type).toBe('layout');
    });

    it('nests the detail, edit, index and new routes under the exercises node', () => {
      const exercisesNode = tree.children.find((child) => child.route === 'exercises')!;
      const childRoutes = exercisesNode.children.map((child) => child.route).sort();
      expect(childRoutes).toEqual(['[id]', 'edit/[id]', 'index', 'new']);
    });

    it('has no root-level child whose route starts with exercises/', () => {
      const leaked = tree.children.filter((child) => child.route.startsWith('exercises/'));
      expect(leaked).toEqual([]);
    });
  });

  describe('Case B: the same list with the segment layout removed', () => {
    const bypassKeys = realKeys.filter((key) => key !== './exercises/_layout.tsx');
    const tree = buildRouteTree(bypassKeys);

    it('no longer nests the detail, new and edit routes under a single exercises node', () => {
      const exercisesNode = tree.children.find((child) => child.route === 'exercises');
      const nested = exercisesNode ? exercisesNode.children.map((child) => child.route) : [];
      expect(nested).not.toEqual(expect.arrayContaining(['[id]', 'new', 'edit/[id]']));
    });

    it('hoists all four exercises routes to the root stack as exercises/-prefixed siblings', () => {
      const leakedRoutes = tree.children.filter((child) => child.route.startsWith('exercises/')).map((child) => child.route).sort();
      expect(leakedRoutes).toEqual(['exercises/[id]', 'exercises/edit/[id]', 'exercises/index', 'exercises/new']);
    });

    it('has no root-level child named exactly exercises — the protected Stack.Screen matches nothing', () => {
      const exercisesChildren = tree.children.filter((child) => child.route === 'exercises');
      expect(exercisesChildren).toHaveLength(0);
    });
  });

  it('produces a different exercises-children set with and without the segment layout', () => {
    const withLayout = buildRouteTree(realKeys).children.find((child) => child.route === 'exercises')!;
    const withoutLayoutTree = buildRouteTree(realKeys.filter((key) => key !== './exercises/_layout.tsx'));
    const withoutLayoutNode = withoutLayoutTree.children.find((child) => child.route === 'exercises');

    const withLayoutSet = new Set(withLayout.children.map((child) => child.route));
    const withoutLayoutSet = new Set(withoutLayoutNode ? withoutLayoutNode.children.map((child) => child.route) : []);

    expect(withLayoutSet).not.toEqual(withoutLayoutSet);
  });
});
