import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance as RNAppearance, Platform } from 'react-native';

import {
  APPEARANCE_STORAGE_KEY,
  readStoredAppearance,
  setAppearance,
} from '../theme';

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) => Promise.resolve(key in store ? store[key] : null)),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value;
        return Promise.resolve();
      }),
      __reset(): void {
        store = {};
      },
    },
  };
});

const mockedStorage = AsyncStorage as unknown as {
  getItem: jest.Mock;
  setItem: jest.Mock;
  __reset: () => void;
};

let setColorSchemeSpy: jest.SpiedFunction<typeof RNAppearance.setColorScheme>;

beforeEach(() => {
  mockedStorage.__reset();
  mockedStorage.getItem.mockClear();
  mockedStorage.setItem.mockClear();
  setColorSchemeSpy = jest.spyOn(RNAppearance, 'setColorScheme').mockImplementation(() => {});
});

afterEach(() => {
  setColorSchemeSpy.mockRestore();
});

describe('readStoredAppearance', () => {
  it('returns system when nothing has ever been stored', async () => {
    await expect(readStoredAppearance()).resolves.toBe('system');
  });

  it('returns the stored token when it is exactly light', async () => {
    await mockedStorage.setItem(APPEARANCE_STORAGE_KEY, 'light');
    await expect(readStoredAppearance()).resolves.toBe('light');
  });

  it('returns the stored token when it is exactly dark', async () => {
    await mockedStorage.setItem(APPEARANCE_STORAGE_KEY, 'dark');
    await expect(readStoredAppearance()).resolves.toBe('dark');
  });

  it('returns system when the stored value is an empty string', async () => {
    await mockedStorage.setItem(APPEARANCE_STORAGE_KEY, '');
    await expect(readStoredAppearance()).resolves.toBe('system');
  });

  it('returns system when the stored value is a legacy or future token', async () => {
    await mockedStorage.setItem(APPEARANCE_STORAGE_KEY, 'auto');
    await expect(readStoredAppearance()).resolves.toBe('system');
  });

  it('returns system when the underlying storage read rejects, without rethrowing', async () => {
    mockedStorage.getItem.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(readStoredAppearance()).resolves.toBe('system');
  });
});

describe('setAppearance', () => {
  let platformConstantsSpy: jest.SpiedFunction<() => typeof Platform.constants>;

  beforeEach(() => {
    // The resume-OS sentinel nativewind's colorScheme.set picks branches on
    // Platform.constants().reactNativeVersion.minor, not on anything this project's own code
    // decides. Stubbing it to this project's pinned minor (86, from apps/mobile/package.json)
    // makes the cases below exercise the sentinel the shipped runtime actually produces, instead
    // of whichever version jest-expo's default native-module mock happens to report.
    platformConstantsSpy = jest.spyOn(Platform, 'constants', 'get').mockReturnValue({
      reactNativeVersion: { major: 0, minor: 86, patch: 2, prerelease: undefined },
    } as unknown as typeof Platform.constants);
  });

  afterEach(() => {
    platformConstantsSpy.mockRestore();
  });

  it("writes 'dark' under APPEARANCE_STORAGE_KEY and calls Appearance.setColorScheme('dark')", async () => {
    await setAppearance('dark');
    expect(mockedStorage.setItem).toHaveBeenCalledWith(APPEARANCE_STORAGE_KEY, 'dark');
    expect(setColorSchemeSpy).toHaveBeenCalledWith('dark');
  });

  it('writes \'system\' and hands Appearance.setColorScheme the resume-OS sentinel so the OS value resumes governing', async () => {
    await setAppearance('system');
    expect(mockedStorage.setItem).toHaveBeenCalledWith(APPEARANCE_STORAGE_KEY, 'system');
    // With Platform.constants stubbed to this project's pinned React Native minor version (86,
    // at or above the 0.82 threshold where the sentinel changed from null to 'unspecified'), the
    // resume-OS call must be exactly 'unspecified'. A regression to the pre-0.82 null sentinel on
    // this pinned runtime now fails this equality instead of passing a permissive membership check.
    expect(setColorSchemeSpy.mock.calls[0]?.[0]).toBe('unspecified');
  });

  it('resolves without rejecting when the underlying storage write rejects, and still applies the selection', async () => {
    mockedStorage.setItem.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(setAppearance('dark')).resolves.toBeUndefined();
    expect(setColorSchemeSpy).toHaveBeenCalledWith('dark');
  });

  // This assertion exists so the stub above cannot silently outlive the version it claims to pin:
  // if apps/mobile/package.json's react-native dependency is ever downgraded below the 0.82
  // sentinel threshold, this case fails loudly, rather than leaving the stub above asserting a
  // sentinel the project no longer ships.
  it('is pinned to a React Native minor version at or above 0.82, the resume-OS sentinel threshold', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mobilePackageJson = require('../../package.json') as {
      dependencies: Record<string, string>;
    };
    const pinnedReactNativeVersion = mobilePackageJson.dependencies['react-native'];
    const [, minorSegment] = pinnedReactNativeVersion.split('.');
    expect(Number(minorSegment)).toBeGreaterThanOrEqual(82);
  });
});

describe('restart restoration', () => {
  it('returns the previously selected token from a fresh read after a simulated restart', async () => {
    await setAppearance('light');
    await expect(readStoredAppearance()).resolves.toBe('light');
  });
});
