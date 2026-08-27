// Same mock-before-import discipline as gym-profiles-screen.test.tsx and profile.test.tsx: the
// route modules' top-level imports reach @powersync's ESM dist, better-auth/react (native secure
// storage), and AsyncStorage's native module, none of which Jest's transform can parse.
jest.mock('../../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../../lib/db/id', () => ({ generateClientId: jest.fn(() => 'fixed-id') }));
jest.mock('../../../lib/auth-client', () => ({
  authClient: { useSession: () => ({ data: null, refetch: jest.fn() }) },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/lib/theme-colors', () => ({
  useThemeColors: () => ({
    accent: 'rgb(37, 99, 235)',
    foregroundMuted: 'rgb(113, 113, 122)',
    surface: 'rgb(244, 244, 245)',
  }),
}));

const mockCreateEquipmentProfile = jest.fn();
const mockUpdateEquipmentProfile = jest.fn();
const mockLoadEquipmentProfile = jest.fn();

jest.mock('../../../lib/db/equipment-profiles', () => ({
  createEquipmentProfile: (...args: unknown[]) => mockCreateEquipmentProfile(...args),
  updateEquipmentProfile: (...args: unknown[]) => mockUpdateEquipmentProfile(...args),
  loadEquipmentProfile: (...args: unknown[]) => mockLoadEquipmentProfile(...args),
}));

import { createGymProfile } from '../new';
import { updateGymProfile } from '../edit/[id]';
import type { EquipmentProfileDraftOutput } from '../../../lib/gym/profile-draft';

function sampleOutput(): EquipmentProfileDraftOutput {
  return {
    name: 'Home Gym',
    nativeUnit: 'kg',
    barbellWeightKg: '20.000',
    plates: [],
    dumbbells: [],
    machines: [],
  };
}

describe('createGymProfile (new.tsx create path)', () => {
  afterEach(() => {
    mockCreateEquipmentProfile.mockReset();
  });

  it('saves through createEquipmentProfile with the caller-supplied userId and the draft output', async () => {
    mockCreateEquipmentProfile.mockResolvedValue('new-id');
    const output = sampleOutput();

    const result = await createGymProfile('user-1', output);

    expect(mockCreateEquipmentProfile).toHaveBeenCalledWith({ userId: 'user-1', ...output });
    expect(result).toEqual({ ok: true, id: 'new-id' });
  });

  it('reports failure rather than throwing when the local write rejects', async () => {
    mockCreateEquipmentProfile.mockRejectedValue(new Error('write failed'));

    const result = await createGymProfile('user-1', sampleOutput());

    expect(result).toEqual({ ok: false });
  });
});

describe('updateGymProfile (edit/[id].tsx save path)', () => {
  afterEach(() => {
    mockUpdateEquipmentProfile.mockReset();
  });

  it('saves through updateEquipmentProfile for the given id', async () => {
    mockUpdateEquipmentProfile.mockResolvedValue(undefined);
    const output = sampleOutput();

    const result = await updateGymProfile('gym-1', output);

    expect(mockUpdateEquipmentProfile).toHaveBeenCalledWith('gym-1', output);
    expect(result).toEqual({ ok: true });
  });

  it('reports failure rather than throwing when the local write rejects', async () => {
    mockUpdateEquipmentProfile.mockRejectedValue(new Error('write failed'));

    const result = await updateGymProfile('gym-1', sampleOutput());

    expect(result).toEqual({ ok: false });
  });
});
