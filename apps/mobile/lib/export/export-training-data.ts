import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getPowerSync } from '../db/powersync';
import { buildExportDocument } from './build-export-document';

export { buildExportDocument } from './build-export-document';
export type {
  ExportedLoggedSet,
  ExportedSession,
  ExportedSessionExercise,
  ExportManifest,
  ExportDb,
  TrainingExport,
} from './build-export-document';

function exportFilename(now: Date): string {
  return `training-export-${now.toISOString().replace(/[:.]/g, '-')}.json`;
}

// Writes into the app's own document directory, then hands off through the system share sheet
// (T-02-06) — never written directly to a world-readable shared location.
export async function exportTrainingData(): Promise<void> {
  const document = await buildExportDocument(getPowerSync());
  const json = JSON.stringify(document, null, 2);

  const file = new File(Paths.document, exportFilename(new Date()));
  file.create({ overwrite: true });
  file.write(json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
  }
}
