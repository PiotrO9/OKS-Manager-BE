import 'dotenv/config';
import { createHash } from 'node:crypto';
import pg from 'pg';

if (process.env.NODE_ENV !== 'development') throw new Error('DEV environment required');
const url = new URL(process.env.SUPABASE_URL);
const database = new URL(process.env.DATABASE_URL);
const ref = url.hostname.split('.')[0];
if (!database.hostname.includes(ref) && !decodeURIComponent(database.username).includes(ref)) throw new Error('Database and Supabase project references differ');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 5000, connectionTimeoutMillis: 10000 });
try {
    await client.connect();
    console.log(JSON.stringify({ environment: process.env.NODE_ENV, projectFingerprint: createHash('sha256').update(ref).digest('hex').slice(0,16), matchingProjectReferences: true }));
    const migrations = await client.query("SELECT migration_name, finished_at IS NOT NULL AS applied FROM _prisma_migrations WHERE migration_name LIKE '%security%' ORDER BY migration_name");
    console.log(JSON.stringify({ migrations: migrations.rows }));
    const tables = await client.query("SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('security_events','security_event_schools','security_detection_states','security_monitor_health')");
    console.log(JSON.stringify({ tables: tables.rows }));
    if(tables.rows.some((r)=>r.relname==='security_monitor_health')) {
        console.log(JSON.stringify({health:(await client.query('SELECT component, last_success_at, last_failure_at FROM security_monitor_health')).rows}));
        console.log(JSON.stringify({queue:(await client.query('SELECT count(*)::int AS pending, min(last_active_at) AS oldest FROM security_detection_states WHERE done_generation < queued_generation')).rows}));
    }
    console.log(JSON.stringify({secretsLongEnough:Object.fromEntries(['SECURITY_EVENT_HMAC_KEY','SECURITY_LOG_CURSOR_SECRET','SECURITY_LOGS_BFF_SHARED_SECRET'].map((key)=>[key,(process.env[key]?.length??0)>=32]))}));
} finally { await client.end(); }
