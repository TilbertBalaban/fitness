import { getTableName } from 'drizzle-orm';
import { analyticsWatermark, drizzleSchema, muscleVolumeRollup } from '../schema';

function columnNames(table: object): string[] {
  return Object.values(table)
    .filter((value): value is { name: string } => typeof (value as { name?: unknown })?.name === 'string')
    .map((column) => column.name);
}

describe('muscleVolumeRollup / analyticsWatermark mirrors (10-01)', () => {
  it('muscleVolumeRollup mirrors muscle_volume_rollup with every column the server table declares', () => {
    expect(getTableName(muscleVolumeRollup)).toBe('muscle_volume_rollup');
    expect(columnNames(muscleVolumeRollup).sort()).toEqual(
      ['id', 'user_id', 'muscle_group_id', 'local_date', 'weighted_volume_kg', 'weighted_sets', 'set_count', 'server_seq'].sort(),
    );
  });

  it('analyticsWatermark mirrors analytics_watermark with every column the server table declares', () => {
    expect(getTableName(analyticsWatermark)).toBe('analytics_watermark');
    expect(columnNames(analyticsWatermark).sort()).toEqual(
      ['id', 'user_id', 'computed_through_date', 'server_seq'].sort(),
    );
  });

  it('both tables are registered in drizzleSchema, so AppSchema (which spreads it wholesale) picks them up', () => {
    expect(drizzleSchema.muscleVolumeRollup).toBe(muscleVolumeRollup);
    expect(drizzleSchema.analyticsWatermark).toBe(analyticsWatermark);
  });
});
