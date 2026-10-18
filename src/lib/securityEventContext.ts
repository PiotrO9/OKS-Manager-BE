import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { logger } from './logger';
import {
	recordSecurityEvent,
	resolveLoginTarget,
} from '../services/security-events/record';

type SecurityEventInput = Parameters<typeof recordSecurityEvent>[0];
type EventDetails = Omit<
	SecurityEventInput,
	| 'source'
	| 'attemptId'
	| 'requestId'
	| 'operationCode'
	| 'operationLabel'
	| 'routeTemplate'
	| 'httpMethod'
	| 'clientIp'
	| 'ipSource'
	| 'userAgent'
> & {
	operationCode?: string;
	operationLabel?: string;
	routeTemplate?: string;
	httpMethod?: string;
};

const requestAttempts = new WeakMap<Request, string>();
const recordedPhases = new WeakMap<Request, Set<string>>();

function serverAttemptId(req: Request): string {
	let id = requestAttempts.get(req);
	if (!id) {
		id = randomUUID();
		requestAttempts.set(req, id);
	}
	return id;
}

function requestClientIp(req: Request): string | undefined {
	// Most requests arrive through the BFF, so the socket belongs to that
	// intermediary. Only a deployment explicitly serving clients directly can
	// treat the socket address as a client address.
	return process.env.SECURITY_EVENTS_DIRECT_CLIENT_SOCKET === 'true'
		? req.socket?.remoteAddress || undefined
		: undefined;
}

export async function authenticatedAccountScopes(user: {
	id: string;
	email: string;
	role: string;
	firstName: string;
	lastName: string;
}): Promise<NonNullable<SecurityEventInput['schoolScopes']>> {
	try {
		const target = await resolveLoginTarget(user.email);
		return target.schoolScopes.map((scope) => ({
			...scope,
			actorVisibility: 'KNOWN',
			actorUserId: user.id,
			actorDisplayName: `${user.firstName} ${user.lastName}`.trim(),
			actorRole: user.role,
		}));
	} catch (error) {
		logger.error('Account school scope could not be resolved for audit', {
			error,
		});
		return [];
	}
}

export async function actorSchoolScopes(
	req: Request,
): Promise<NonNullable<SecurityEventInput['schoolScopes']>> {
	const user = req.user;
	if (!user) return [];
	// A target resource may belong to another school. Its school must be resolved
	// from the resource by the handler, never inferred from the actor alone.
	if (/:[^/]+/.test(req.securityOperation?.routeTemplate ?? '')) return [];
	const scopes = await authenticatedAccountScopes(user);
	const requestedSchool = req.query?.schoolId;
	return (
		typeof requestedSchool === 'string'
			? scopes.filter((scope) => scope.schoolId === requestedSchool)
			: scopes
	).map((scope) => ({
		...scope,
		targetUserId: undefined,
		targetDisplayName: undefined,
	}));
}

export async function verifiedSchoolScope(
	req: Request,
	schoolId: string,
	target?: { userId?: string; displayName?: string },
): Promise<NonNullable<SecurityEventInput['schoolScopes']>> {
	const user = req.user;
	if (!user) return [{ schoolId, actorVisibility: 'UNKNOWN' }];
	try {
		const actor = await resolveLoginTarget(user.email);
		const membership = actor.schoolScopes.find(
			(scope) => scope.schoolId === schoolId,
		);
		return [
			{
				schoolId,
				viewerUserId: null,
				actorVisibility: membership ? 'KNOWN' : 'EXTERNAL',
				actorUserId: membership ? user.id : undefined,
				actorDisplayName: membership
					? `${user.firstName} ${user.lastName}`.trim()
					: undefined,
				actorRole: membership ? user.role : undefined,
				targetUserId: target?.userId,
				targetDisplayName: target?.displayName,
			},
		];
	} catch (error) {
		logger.error('School projection could not be resolved for audit', {
			requestId: req.requestId,
			error,
		});
		return [
			{
				schoolId,
				actorVisibility: 'EXTERNAL',
				targetUserId: target?.userId,
				targetDisplayName: target?.displayName,
			},
		];
	}
}

export async function recordRequestSecurityEvent(
	req: Request,
	details: EventDetails,
): Promise<void> {
	const eventPhase = details.eventPhase ?? details.type.toLowerCase();
	const phases = recordedPhases.get(req) ?? new Set<string>();
	if (phases.has(eventPhase)) return;
	phases.add(eventPhase);
	recordedPhases.set(req, phases);

	const operation = req.securityOperation;
	try {
		await recordSecurityEvent({
			...details,
			source: 'BE_HTTP',
			attemptId: serverAttemptId(req),
			eventPhase,
			requestId: req.requestId,
			operationCode:
				details.operationCode ?? operation?.code ?? 'unknown_operation',
			operationLabel:
				details.operationLabel ??
				operation?.label ??
				'Nieznana operacja',
			routeTemplate: details.routeTemplate ?? operation?.routeTemplate,
			httpMethod: details.httpMethod ?? operation?.method ?? req.method,
			clientIp: requestClientIp(req),
			ipSource: requestClientIp(req) ? 'SOCKET' : 'UNKNOWN',
			userAgent: req.get?.('user-agent'),
		});
	} catch (error) {
		// Audit storage cannot silently change authentication or business results.
		logger.error('Security event could not be recorded', {
			type: details.type,
			requestId: req.requestId,
			error,
		});
	}
}
