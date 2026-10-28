import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

if (process.env.NODE_ENV !== 'development' || !process.argv.includes('--confirm-dev')) throw new Error('DEV and --confirm-dev required');
const require = createRequire(import.meta.url);
const { getPrisma } = require('../dist/lib/prisma.js');
const { recordSecurityEvent } = require('../dist/services/security-events/record.js');
const { processSecurityDetectionQueue } = require('../dist/services/security-events/detection.js');
const { reportSecurityHealth, getSecurityCollectionStatus } = require('../dist/services/security-events/health.js');
const prisma = getPrisma();
const subjects = [];
const results = [];
const runId = randomUUID();

async function drain(subject) {
    const deadline = Date.now() + 30_000;
    do {
        await processSecurityDetectionQueue(100);
        const states = await prisma.securityDetectionState.findMany({ where: { subjectKey: `user:${subject}` } });
        if (states.length && states.every((s) => s.doneGeneration === s.queuedGeneration)) return;
    } while (Date.now() < deadline);
    throw new Error('Detection did not drain');
}

function childDrain() {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', "require('dotenv/config'); const p=require('./dist/lib/prisma').getPrisma(); require('./dist/services/security-events/detection').processSecurityDetectionQueue(100).then(()=>p.$disconnect()).catch(()=>process.exit(1))"], { cwd: process.cwd(), stdio: 'ignore', windowsHide: true });
        const timer = setTimeout(() => { child.kill(); reject(new Error('Child timeout')); }, 30_000);
        child.on('error', (error) => { clearTimeout(timer); reject(error); });
        child.on('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Child worker failed')); });
    });
}

async function check(name, test) {
    await test(); results.push({ name, passed: true }); console.log(`PASS ${name}`);
}

try {
    const school = await prisma.drivingSchool.findFirst({ where: { deletedAt: null, owner: { role: 'MANAGER', isActive: true, deletedAt: null } }, select: { id: true } });
    assert.ok(school);
    const subject = randomUUID(); subjects.push(subject);
    const base = Date.now() - 360_000;
    const add = (target, seconds, attempt = randomUUID()) => recordSecurityEvent({ type: 'LOGIN_FAILED', source: 'RELIABILITY_SMOKE', attemptId: attempt, targetUserId: target, occurredAt: new Date(base + seconds * 1000), schoolScopes: [{ schoolId: school.id, targetUserId: target }] });
    const alerts = async (target) => {
        const originals = await prisma.securityEvent.findMany({ where: { source: 'RELIABILITY_SMOKE', targetUserId: target }, select: { id: true } });
        return prisma.securityEvent.findMany({ where: { source: 'DETECTOR', sourceEventId: { in: originals.map((e) => e.id) }, schools: { some: { schoolId: school.id } } } });
    };
    await check('Four real DB failures remain below threshold', async () => {
        for (const t of [0,60,120,240]) await add(subject,t);
        await drain(subject); assert.equal((await alerts(subject)).length,0);
    });
    await check('Late fifth event rewinds cursor and produces exactly one scoped alarm', async () => {
        await add(subject,180); await drain(subject);
        assert.equal((await alerts(subject)).length,1);
    });
    await check('Replay of history preserves the existing alarm without duplicates', async () => {
        await add(subject,150); await drain(subject);
        assert.equal((await alerts(subject)).length,1);
    });
    await check('Duplicate delivery is idempotent', async () => {
        const attempt=randomUUID(); const a=await add(subject,260,attempt); const b=await add(subject,260,attempt);
        assert.equal(a.created,true); assert.equal(b.created,false); assert.equal(a.id,b.id);
    });
    await check('Two independent processes drain the same persistent queue without duplicate alarms', async () => {
        const target=randomUUID(); subjects.push(target);
        await Promise.all([0,30,60,90,120].map((t)=>add(target,t)));
        await Promise.all([childDrain(),childDrain()]); await drain(target);
        assert.equal((await alerts(target)).length,1);
    });
    await check('Database rejects UPDATE of audit history', async () => {
        const target=subjects[0];
        const event=await prisma.securityEvent.findFirst({where:{source:'RELIABILITY_SMOKE',targetUserId:target}});
        await assert.rejects(prisma.$executeRaw`UPDATE security_events SET reason_code = 'SHOULD_NOT_CHANGE' WHERE id = ${event.id}::uuid`);
        assert.notEqual((await prisma.securityEvent.findUnique({where:{id:event.id}})).reasonCode,'SHOULD_NOT_CHANGE');
    });
    await check('Audit tables have RLS and no anonymous or authenticated SELECT grants', async () => {
        const tables=['security_events','security_event_schools','security_detection_states','security_monitor_health'];
        for(const table of tables) {
            const [row]=await prisma.$queryRaw`SELECT c.relrowsecurity AS rls, has_table_privilege('anon', c.oid, 'SELECT') AS anon, has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=${table}`;
            assert.ok(row.rls); assert.equal(row.anon,false); assert.equal(row.authenticated,false);
        }
    });
    await check('Shared heartbeat is visible and recent failures remain degraded', async () => {
        await drain(subjects[0]); await reportSecurityHealth('DETECTOR',true);
        const rows=await prisma.$queryRaw`SELECT component, last_success_at, last_failure_at FROM security_monitor_health`;
        assert.ok(Date.now()-rows.find((r)=>r.component==='DETECTOR').last_success_at.getTime()<30_000);
        const hasRecentFailure=rows.some((r)=>r.last_failure_at && Date.now()-r.last_failure_at.getTime()<300_000);
        const status=await getSecurityCollectionStatus();
        assert.equal(status,hasRecentFailure?'DEGRADED':'OK');
        console.log(`Observed status: ${status}`);
    });
} finally {
    const originals=await prisma.securityEvent.findMany({where:{source:'RELIABILITY_SMOKE',targetUserId:{in:subjects}},select:{id:true}});
    await prisma.securityEvent.deleteMany({where:{source:'DETECTOR',sourceEventId:{in:originals.map((e)=>e.id)}}});
    await prisma.securityEvent.deleteMany({where:{source:'RELIABILITY_SMOKE',targetUserId:{in:subjects}}});
    await prisma.securityDetectionState.deleteMany({where:{subjectKey:{in:subjects.map((id)=>`user:${id}`)}}});
    assert.equal(await prisma.securityEvent.count({where:{source:'RELIABILITY_SMOKE',targetUserId:{in:subjects}}}),0);
    await mkdir(new URL('../../output/bsi-project/',import.meta.url), { recursive: true });
    await writeFile(new URL('../../output/bsi-project/reliability-results.json',import.meta.url),JSON.stringify({runId,executedAt:new Date().toISOString(),results,cleanupPassed:true},null,2));
    await prisma.$disconnect();
    console.log('Synthetic records removed');
}
