import { getPowerSync } from '../db/powersync';
import { buildExportDocument } from './build-export-document';

function exportFilename(now: Date): string {
  return `training-export-${now.toISOString().replace(/[:.]/g, '-')}.json`;
}

// The web target's web.output is static (app.json) — there is no server route to stream a
// download from, so this triggers a browser download directly, the browser's own equivalent of
// the native share sheet handoff (T-02-06).
export async function exportTrainingData(): Promise<void> {
  const document = await buildExportDocument(getPowerSync());
  const json = JSON.stringify(document, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = window.document.createElement('a');
  link.href = url;
  link.download = exportFilename(new Date());
  window.document.body.appendChild(link);
  link.click();
  window.document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
