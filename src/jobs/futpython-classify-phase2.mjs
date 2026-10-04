import { withClient, closePool } from '../db.mjs';
import { loadClassification } from '../providers/futpython/classification.mjs';

export async function runPhase2Classification() {
  return withClient(client => loadClassification(client));
}

function redact(value) {
  return String(value || '')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]')
    .replace(/api_key=[^&\s]+/gi, 'api_key=[REDACTED]');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPhase2Classification()
    .then(result => {
      console.log('FUTPYTHON_PHASE2_CLASSIFICATION ' + JSON.stringify({
        gate: result.gate,
        catalog_total: result.catalog_total,
        classified_total: result.classified_total,
        unclassified: result.unclassified,
        duplicate_catalog_keys: result.duplicate_catalog_keys,
        labels: result.labels,
        issues: result.issues,
        samples: result.samples
      }));
      if (!result.gate) process.exitCode = 1;
    })
    .catch(error => {
      console.error('FUTPYTHON_PHASE2_CLASSIFICATION_FATAL', redact(error?.message || error));
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
