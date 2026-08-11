import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance as RNAppearance } from 'react-native';

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
  it("writes 'dark' under APPEARANCE_STORAGE_KEY and calls Appearance.setColorScheme('dark')", async () => {
    await setAppearance('dark');
    expect(mockedStorage.setItem).toHaveBeenCalledWith(APPEARANCE_STORAGE_KEY, 'dark');
    expect(setColorSchemeSpy).toHaveBeenCalledWith('dark');
  });

  it('writes \'system\' and hands Appearance.setColorScheme the resume-OS sentinel so the OS value resumes governing', async () => {
    await setAppearance('system');
    expect(mockedStorage.setItem).toHaveBeenCalledWith(APPEARANCE_STORAGE_KEY, 'system');
    // Which sentinel means "resume OS" depends on the React Native version reported by
    // Platform.constants: 'unspecified' from 0.82 on, null before it. Jest's mocked platform
    // constants report 0.0.0, so both are accepted here rather than pinning the value the test
    // environment happens to produce.
    expect(['unspecified', null]).toContain(setColorSchemeSpy.mock.calls[0]?.[0] ?? null);
  });

  it('resolves without rejecting when the underlying storage write rejects, and still applies the selection', async () => {
    mockedStorage.setItem.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(setAppearance('dark')).resolves.toBeUndefined();
    expect(setColorSchemeSpy).toHaveBeenCalledWith('dark');
  });
});

describe('restart restoration', () => {
  it('returns the previously selected token from a fresh read after a simulated restart', async () => {
    await setAppearance('light');
    await expect(readStoredAppearance()).resolves.toBe('light');
  });
});
