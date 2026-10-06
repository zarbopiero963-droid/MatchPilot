import pg from 'pg';
import { createOrReadFreezeBoundary, exportMetadata } from './lib/provider-trial-final-export.mjs';

const DATABASE_URL=process.env.DATABASE_URL?.trim();
// Temporary provider-trial branch: collection is already disabled; create/read the immutable freeze boundary on every startup.
const ENABLED=true;

if (ENABLED && DATABASE_URL) {
  const pool=new pg.Pool({connectionString:DATABASE_URL,max:1,connectionTimeoutMillis:15000,idleTimeoutMillis:30000});
  try {
    const freeze=await createOrReadFreezeBoundary(pool,{
      collector_commit:process.env.RENDER_GIT_COMMIT||null,
      render_service:process.env.RENDER_SERVICE_NAME||null,
      export_contract:'2026-10-06-v1'
    });
    console.log('PROVIDER_TRIAL_FINAL_FREEZE '+JSON.stringify({
      freeze_at_utc:freeze.freeze_at_utc,
      max_raw_record_id:freeze.max_raw_record_id,
      total_raw:freeze.total_raw
    }));
    const meta=await exportMetadata(pool);
    console.log('PROVIDER_TRIAL_FINAL_COUNTS '+JSON.stringify({
      freeze:meta.freeze,
      datasets:meta.datasets
    }));
  } finally {
    await pool.end();
  }
}
