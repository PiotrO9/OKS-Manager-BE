import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const url = new URL(process.env.DATABASE_URL ?? '');
assert(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/bsi_login_limit', 'Only isolated local bsi_login_limit DB accepted');
const pool = new Pool({ connectionString: url.href });
const { reserveLoginAttempt, LoginLimitExceeded } = require('../dist/services/loginRateLimit.js');
const { getPrisma } = require('../dist/lib/prisma.js');
try {
  await pool.query(await readFile(new URL('../prisma/migrations/20261027160000_login_rate_limit/migration.sql', import.meta.url), 'utf8'));
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => reserveLoginAttempt([{ key: 'account', limit: 5 }], 60_000)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 5);
  assert.equal(results.filter((r) => r.status === 'rejected' && r.reason instanceof LoginLimitExceeded).length, 7);
  await assert.rejects(reserveLoginAttempt([{ key: '0-ip', limit: 20 }, { key: 'account', limit: 5 }], 60_000), LoginLimitExceeded);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM login_rate_limit_buckets WHERE key='0-ip'")).rows[0].count, 0, 'Other bucket reservation must roll back');
  await reserveLoginAttempt([{ key: 'expiry', limit: 1 }], 100);
  await assert.rejects(reserveLoginAttempt([{ key: 'expiry', limit: 1 }], 100), LoginLimitExceeded);
  await new Promise((resolve) => setTimeout(resolve, 150));
  await reserveLoginAttempt([{ key: 'expiry', limit: 1 }], 100);
  assert.equal((await pool.query("SELECT attempts FROM login_rate_limit_buckets WHERE key='expiry'")).rows[0].attempts, 1);
  console.log(JSON.stringify({ database: 'isolated local PostgreSQL', parallel: { requests: 12, allowed: 5, blocked: 7 }, rollback: 'PASS', expiry: 'PASS' }));
} finally {
  await getPrisma().$disconnect();
  await pool.end();
}
