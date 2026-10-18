import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { once } from 'node:events';

if (
	process.env.NODE_ENV !== 'development' ||
	process.argv[2] !== '--confirm-dev'
) {
	throw new Error(
		'This smoke test requires NODE_ENV=development and --confirm-dev',
	);
}

const require = createRequire(import.meta.url);
const { createApp } = require('../dist/app.js');
const { getPrisma } = require('../dist/lib/prisma.js');
const {
	recordSecurityEvent,
} = require('../dist/services/security-events/record.js');
const {
	processSecurityDetectionQueue,
} = require('../dist/services/security-events/detection.js');
const {
	listManagerSecurityLogs,
	getManagerSecurityLog,
} = require('../dist/services/security-events/list.js');
const prisma = getPrisma();
const createdIds = [];
let loginHash;
let bffAttemptId;
let deniedRequestId;
let detectionSubject;
let server;

try {
	const school = await prisma.drivingSchool.findFirst({
		where: {
			deletedAt: null,
			owner: { role: 'MANAGER', deletedAt: null, isActive: true },
		},
		select: { id: true, ownerId: true },
	});
	assert.ok(
		school,
		'DEV needs an active manager-owned school for the scoped read test',
	);

	const synthetic = await recordSecurityEvent({
		type: 'ACCESS_DENIED',
		source: 'DEV_SMOKE',
		attemptId: randomUUID(),
		reasonCode: 'DEV_SMOKE',
		operationCode: 'DEV_SMOKE_OPERATION',
		operationLabel: 'Weryfikacja dziennika DEV',
		httpMethod: 'PATCH',
		routeTemplate: '/manager/accounts/:userId/status',
		httpStatus: 403,
		schoolScopes: [{ schoolId: school.id, actorVisibility: 'UNKNOWN' }],
	});
	createdIds.push(synthetic.id);

	const listInput = {
		schoolId: school.id,
		limit: 20,
		search: 'Weryfikacja dziennika DEV',
		view: 'all',
		filters: {
			rules: [
				{
					field: 'operationCode',
					operator: 'is',
					value: 'DEV_SMOKE_OPERATION',
				},
			],
		},
	};
	const list = await listManagerSecurityLogs(school.ownerId, listInput);
	assert.ok(
		list.items.some((event) => event.id === synthetic.id),
		'manager list omitted the scoped event',
	);
	const detail = await getManagerSecurityLog(
		school.ownerId,
		school.id,
		synthetic.id,
	);
	assert.equal(detail.operationLabel, 'Weryfikacja dziennika DEV');
	assert.equal(detail.routeTemplate, '/manager/accounts/:userId/status');
	await assert.rejects(
		getManagerSecurityLog(randomUUID(), school.id, synthetic.id),
		{ statusCode: 404 },
	);
	console.log(
		'DEV scoped write, filtered list, detail and school isolation: OK',
	);

	server = createApp().listen(0, '127.0.0.1');
	await once(server, 'listening');
	const base = `http://127.0.0.1:${server.address().port}`;
	deniedRequestId = randomUUID();
	const denied = await fetch(
		`${base}/manager/security-logs?schoolId=${school.id}`,
		{
			headers: { 'X-Request-Id': deniedRequestId },
		},
	);
	assert.equal(denied.status, 401);
	assert.match(denied.headers.get('cache-control') ?? '', /no-store/);
	const deniedEvent = await prisma.securityEvent.findFirst({
		where: { source: 'BE_HTTP', requestId: deniedRequestId },
	});
	assert.ok(
		deniedEvent,
		'unauthenticated manager read did not create an event',
	);
	assert.equal(deniedEvent.operationCode, 'SECURITY_LOGS_LIST');
	console.log(
		'DEV manager API rejects anonymous reads and records the operation: OK',
	);

	const attemptId = randomUUID();
	bffAttemptId = attemptId;
	const body = JSON.stringify({
		attemptId,
		method: 'PATCH',
		path: `/manager/accounts/${randomUUID()}/status`,
		reasonCode: 'MISSING_SESSION',
	});
	const timestamp = new Date().toISOString();
	const signature = createHmac(
		'sha256',
		process.env.SECURITY_LOGS_BFF_SHARED_SECRET,
	)
		.update(`${timestamp}.${body}`)
		.digest('hex');
	const headers = {
		'Content-Type': 'application/json',
		'X-OSK-Audit-Timestamp': timestamp,
		'X-OSK-Audit-Signature': `sha256=${signature}`,
	};
	const first = await fetch(`${base}/internal/security-events/bff-denial`, {
		method: 'POST',
		headers,
		body,
	});
	assert.equal(first.status, 202);
	assert.equal((await first.json()).data.created, true);
	const replay = await fetch(`${base}/internal/security-events/bff-denial`, {
		method: 'POST',
		headers,
		body,
	});
	assert.equal(replay.status, 202);
	assert.equal((await replay.json()).data.created, false);
	const ingested = await prisma.securityEvent.findFirst({
		where: { source: 'BFF_INTERNAL', attemptId },
	});
	assert.ok(ingested, 'signed BFF denial was not saved');
	assert.equal(ingested.operationCode, 'MANAGER_ACCOUNT_STATUS_UPDATE');
	console.log(
		'DEV signed BFF denial, operation naming and replay deduplication: OK',
	);

	const email = `security-smoke-${randomUUID()}@example.com`;
	loginHash = createHmac('sha256', process.env.SECURITY_EVENT_HMAC_KEY)
		.update(email.toLowerCase())
		.digest('hex');
	const loginResponse = await fetch(`${base}/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password: `invalid-${randomUUID()}` }),
	});
	assert.equal(
		loginResponse.status,
		401,
		'expected a rejected login attempt',
	);
	const loginEvent = await prisma.securityEvent.findFirst({
		where: { source: 'BE_HTTP', loginIdentifierHash: loginHash },
	});
	assert.ok(loginEvent, 'rejected HTTP login did not create an event');
	assert.equal(loginEvent.type, 'LOGIN_FAILED');
	console.log('DEV rejected HTTP login persisted as LOGIN_FAILED: OK');

	detectionSubject = randomUUID();
	for (let i = 0; i < 5; i += 1) {
		const attempt = await recordSecurityEvent({
			type: 'LOGIN_FAILED',
			source: 'DEV_SMOKE',
			attemptId: randomUUID(),
			targetUserId: detectionSubject,
			schoolScopes: [
				{
					schoolId: school.id,
					viewerUserId: school.ownerId,
					actorVisibility: 'UNKNOWN',
					targetUserId: detectionSubject,
					targetDisplayName: 'DEV smoke target',
				},
			],
		});
		createdIds.push(attempt.id);
	}
	const scopedStateKey = `school:${school.id}:${school.ownerId}`;
	const detectionDeadline = Date.now() + 30_000;
	let scopedDetectionComplete = false;
	let processedDetectionStates = 0;
	while (Date.now() < detectionDeadline) {
		processedDetectionStates += await processSecurityDetectionQueue(100);
		const state = await prisma.securityDetectionState.findUnique({
			where: {
				rule_scopeKey_subjectKey_keyVersion: {
					rule: 'ACCOUNT',
					scopeKey: scopedStateKey,
					subjectKey: `user:${detectionSubject}`,
					keyVersion: 'user',
				},
			},
			select: { queuedGeneration: true, doneGeneration: true },
		});
		if (state && state.doneGeneration >= state.queuedGeneration) {
			scopedDetectionComplete = true;
			break;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	assert.ok(
		scopedDetectionComplete,
		`school-scoped login detection did not finish after processing ${processedDetectionStates} states`,
	);
	const alerts = await prisma.securityEvent.findMany({
		where: {
			type: 'REPEATED_LOGIN_FAILURES',
			source: 'DETECTOR',
			sourceEventId: { in: createdIds },
		},
	});
	assert.ok(
		alerts.length >= 1,
		'fifth login failure did not trigger an alert',
	);
	const suspicious = await listManagerSecurityLogs(school.ownerId, {
		schoolId: school.id,
		limit: 20,
		search: '',
		view: 'suspicious',
		filters: {
			rules: [
				{
					field: 'targetUserId',
					operator: 'is',
					value: detectionSubject,
				},
			],
		},
	});
	assert.ok(
		suspicious.items.some((event) =>
			alerts.some((alert) => alert.id === event.id),
		),
	);
	console.log('DEV fifth failed login produces a manager-visible alert: OK');
} finally {
	if (server) await new Promise((resolve) => server.close(resolve));
	if (createdIds.length)
		await prisma.securityEvent.deleteMany({
			where: { source: 'DETECTOR', sourceEventId: { in: createdIds } },
		});
	if (createdIds.length)
		await prisma.securityEvent.deleteMany({
			where: { id: { in: createdIds } },
		});
	if (bffAttemptId)
		await prisma.securityEvent.deleteMany({
			where: { source: 'BFF_INTERNAL', attemptId: bffAttemptId },
		});
	if (deniedRequestId)
		await prisma.securityEvent.deleteMany({
			where: { source: 'BE_HTTP', requestId: deniedRequestId },
		});
	if (loginHash)
		await prisma.securityEvent.deleteMany({
			where: { source: 'BE_HTTP', loginIdentifierHash: loginHash },
		});
	if (loginHash)
		await prisma.securityDetectionState.deleteMany({
			where: { subjectKey: `hash:${loginHash}` },
		});
	if (detectionSubject)
		await prisma.securityDetectionState.deleteMany({
			where: { subjectKey: `user:${detectionSubject}` },
		});
	if (createdIds.length)
		assert.equal(
			await prisma.securityEvent.count({
				where: { id: { in: createdIds } },
			}),
			0,
		);
	if (bffAttemptId)
		assert.equal(
			await prisma.securityEvent.count({
				where: { source: 'BFF_INTERNAL', attemptId: bffAttemptId },
			}),
			0,
		);
	if (deniedRequestId)
		assert.equal(
			await prisma.securityEvent.count({
				where: { source: 'BE_HTTP', requestId: deniedRequestId },
			}),
			0,
		);
	if (loginHash)
		assert.equal(
			await prisma.securityEvent.count({
				where: { source: 'BE_HTTP', loginIdentifierHash: loginHash },
			}),
			0,
		);
	console.log('DEV smoke records removed: OK');
	await prisma.$disconnect();
}
