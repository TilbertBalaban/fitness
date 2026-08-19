import { goBackOrReplace, type BackRouter } from '../back';

function fakeRouter(canGoBack: boolean): BackRouter & { back: jest.Mock; replace: jest.Mock } {
  return {
    canGoBack: () => canGoBack,
    back: jest.fn(),
    replace: jest.fn(),
  };
}

describe('goBackOrReplace', () => {
  it('with a previous entry, calls back() exactly once and never replace()', () => {
    const router = fakeRouter(true);

    goBackOrReplace(router, '/exercises');

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('with no previous entry — the direct-URL-load / refresh case — calls replace() exactly once with the fallback href and never back()', () => {
    const router = fakeRouter(false);

    goBackOrReplace(router, '/exercises');

    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/exercises');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('forwards the supplied fallback href verbatim rather than deriving a destination from route params', () => {
    const router = fakeRouter(false);

    goBackOrReplace(router, '/exercises/edit/seed_90_90_Hamstring');

    expect(router.replace).toHaveBeenCalledWith('/exercises/edit/seed_90_90_Hamstring');
  });
});
