// Module-local ambient declaration, not @types/node — same reasoning e2e/node-shims.d.ts records
// for node:child_process: __dirname resolves and works under Jest's Node runtime with zero
// packages, this line only teaches the type checker its shape.
declare const __dirname: string;

import type { ReactElement, ReactNode } from 'react';
import { getExactRoutes } from 'expo-router/build/getRoutes';
import { inMemoryContext, requireContext } from 'expo-router/build/internal/testing';
import { isProtectedReactElement } from 'expo-router/build/views/Protected';
import { renderRootStack } from '../root-stack';

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

describe('programs route hoisting (T-04-52 regression)', () => {
  it('sanity: the real app directory contains the programs segment layout', () => {
    expect(realKeys).toContain('./programs/_layout.tsx');
  });

  describe('Case A: the real app directory', () => {
    const tree = buildRouteTree(realKeys);

    it('has exactly one root-level child named programs, of type layout', () => {
      const programsChildren = tree.children.filter((child) => child.route === 'programs');
      expect(programsChildren).toHaveLength(1);
      expect(programsChildren[0].type).toBe('layout');
    });

    it('nests the library and new routes under the programs node', () => {
      const programsNode = tree.children.find((child) => child.route === 'programs')!;
      const childRoutes = programsNode.children.map((child) => child.route).sort();
      expect(childRoutes).toEqual(['library', 'new']);
    });

    it('has no root-level child whose route starts with programs/', () => {
      const leaked = tree.children.filter((child) => child.route.startsWith('programs/'));
      expect(leaked).toEqual([]);
    });
  });

  describe('Case B: the same list with the segment layout removed', () => {
    const bypassKeys = realKeys.filter((key) => key !== './programs/_layout.tsx');
    const tree = buildRouteTree(bypassKeys);

    it('hoists both programs routes to the root stack as programs/-prefixed siblings', () => {
      const leakedRoutes = tree.children
        .filter((child) => child.route.startsWith('programs/'))
        .map((child) => child.route)
        .sort();
      expect(leakedRoutes).toEqual(['programs/library', 'programs/new']);
    });

    it('has no root-level child named exactly programs — the protected Stack.Screen matches nothing', () => {
      const programsChildren = tree.children.filter((child) => child.route === 'programs');
      expect(programsChildren).toHaveLength(0);
    });
  });
});

type AnyElement = ReactElement<Record<string, unknown>>;
type Entry = { element: AnyElement; ancestors: AnyElement[] };

function findWithAncestors(node: ReactNode, ancestors: AnyElement[] = [], found: Entry[] = []): Entry[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return found;
  }
  if (Array.isArray(node)) {
    for (const child of node) findWithAncestors(child, ancestors, found);
    return found;
  }
  const element = node as AnyElement;
  found.push({ element, ancestors });
  const children = element.props?.children as ReactNode;
  if (children !== undefined) findWithAncestors(children, [...ancestors, element], found);
  return found;
}

describe('root stack guard boundary (WR-03 regression)', () => {
  it.each([false, true])('guard=%s: the exercises screen has a protected ancestor whose guard prop matches signedIn', (signedIn) => {
    const entries = findWithAncestors(renderRootStack(signedIn));
    const exercisesEntries = entries.filter((entry) => entry.element.props.name === 'exercises');

    expect(exercisesEntries).toHaveLength(1);

    const protectedAncestor = exercisesEntries[0].ancestors.find(isProtectedReactElement);
    expect(protectedAncestor).toBeDefined();
    expect((protectedAncestor as ReactElement<{ guard: boolean }>).props.guard).toBe(signedIn);
  });

  it.each([false, true])('guard=%s: the (tabs) screen shares the exercises screen protected ancestor', (signedIn) => {
    const entries = findWithAncestors(renderRootStack(signedIn));

    const exercisesAncestor = entries.find((entry) => entry.element.props.name === 'exercises')!.ancestors.find(isProtectedReactElement);
    const tabsAncestor = entries.find((entry) => entry.element.props.name === '(tabs)')!.ancestors.find(isProtectedReactElement);

    expect(tabsAncestor).toBe(exercisesAncestor);
  });

  it.each([false, true])('guard=%s: no exercises screen exists outside a protected boundary', (signedIn) => {
    const entries = findWithAncestors(renderRootStack(signedIn));

    const unprotected = entries.filter(
      (entry) => entry.element.props.name === 'exercises' && !entry.ancestors.some(isProtectedReactElement),
    );
    expect(unprotected).toEqual([]);
  });
});

describe('programs segment guard boundary (T-04-52)', () => {
  it.each([false, true])('guard=%s: the programs screen has a protected ancestor whose guard prop matches signedIn', (signedIn) => {
    const entries = findWithAncestors(renderRootStack(signedIn));
    const programsEntries = entries.filter((entry) => entry.element.props.name === 'programs');

    // Exactly one registration: a second would be a second guard carrying its own condition, which
    // is the failure mode the single-segment pattern exists to make impossible.
    expect(programsEntries).toHaveLength(1);

    const protectedAncestor = programsEntries[0].ancestors.find(isProtectedReactElement);
    expect(protectedAncestor).toBeDefined();
    expect((protectedAncestor as ReactElement<{ guard: boolean }>).props.guard).toBe(signedIn);
  });

  it.each([false, true])('guard=%s: programs shares the (tabs) and exercises protected ancestor', (signedIn) => {
    const entries = findWithAncestors(renderRootStack(signedIn));

    const programsAncestor = entries.find((entry) => entry.element.props.name === 'programs')!.ancestors.find(isProtectedReactElement);
    const tabsAncestor = entries.find((entry) => entry.element.props.name === '(tabs)')!.ancestors.find(isProtectedReactElement);
    const exercisesAncestor = entries.find((entry) => entry.element.props.name === 'exercises')!.ancestors.find(isProtectedReactElement);

    expect(programsAncestor).toBe(tabsAncestor);
    expect(programsAncestor).toBe(exercisesAncestor);
  });

  it.each([false, true])('guard=%s: no programs screen exists outside a protected boundary', (signedIn) => {
    const entries = findWithAncestors(renderRootStack(signedIn));

    const unprotected = entries.filter(
      (entry) => entry.element.props.name === 'programs' && !entry.ancestors.some(isProtectedReactElement),
    );
    expect(unprotected).toEqual([]);
  });
});

describe('protected set membership', () => {
  function screenNamesUnderGuard(signedIn: boolean, guardValue: boolean): string[] {
    const entries = findWithAncestors(renderRootStack(signedIn));
    return entries
      .filter((entry) => {
        const ancestor = entry.ancestors.find(isProtectedReactElement) as ReactElement<{ guard: boolean }> | undefined;
        return typeof entry.element.props.name === 'string' && ancestor?.props.guard === guardValue;
      })
      .map((entry) => entry.element.props.name as string)
      .sort();
  }

  it('guards (tabs), exercises and programs behind the signed-in condition', () => {
    expect(screenNamesUnderGuard(true, true)).toEqual(['(tabs)', 'exercises', 'programs']);
  });

  it('guards only (auth) behind the signed-out condition', () => {
    expect(screenNamesUnderGuard(true, false)).toEqual(['(auth)']);
  });
});
