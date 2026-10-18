export const SECURITY_EVENT_TYPES = [
	'LOGIN_SUCCEEDED',
	'LOGIN_FAILED',
	'LOGIN_DENIED',
	'LOGIN_PROVIDER_ERROR',
	'LOGIN_RATE_LIMITED',
	'REPEATED_LOGIN_FAILURES',
	'LOGOUT_SUCCEEDED',
	'LOGOUT_PROVIDER_REVOCATION_FAILED',
	'SESSION_REVOKED',
	'REVOKED_SESSION_USED',
	'AUTHENTICATION_REQUIRED',
	'SESSION_REJECTED',
	'SESSION_REFRESH_FAILED',
	'ACCESS_DENIED',
	'PASSWORD_RESET_REQUESTED',
	'PASSWORD_RESET_FAILED',
	'PASSWORD_CHANGED',
	'PASSWORD_CHANGE_STARTED',
	'PASSWORD_CHANGE_COMPLETED',
	'PASSWORD_CHANGE_REPAIR_REQUIRED',
	'ACCOUNT_CREATED',
	'ACCOUNT_BLOCKED',
	'ACCOUNT_UNBLOCKED',
	'ACCOUNT_ARCHIVED',
	'ACCOUNT_EMAIL_CHANGE_REQUESTED',
	'ACCOUNT_EMAIL_CHANGED',
	'ACCOUNT_CHANGE_FAILED',
	'ACCOUNT_CHANGE_REPAIR_REQUIRED',
] as const;

export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];
export type SecurityEventCategory =
	| 'AUTH'
	| 'SESSION'
	| 'ACCESS'
	| 'ACCOUNT'
	| 'DETECTION';
export type SecurityEventSeverity = 'INFO' | 'WARNING' | 'HIGH';
export type SecurityEventOutcome =
	| 'SUCCESS'
	| 'FAILURE'
	| 'DENIED'
	| 'DETECTED';
export type ActorVisibility = 'KNOWN' | 'UNKNOWN' | 'EXTERNAL';

export type SecurityEventSchoolScope = {
	schoolId: string;
	viewerUserId?: string | null;
	actorVisibility?: ActorVisibility;
	actorUserId?: string;
	actorDisplayName?: string;
	actorRole?: string;
	targetUserId?: string;
	targetDisplayName?: string;
};

export type SecurityEventInput = {
	type: SecurityEventType;
	source: string;
	attemptId: string;
	eventPhase?: string;
	occurredAt?: Date;
	category?: SecurityEventCategory;
	severity?: SecurityEventSeverity;
	outcome?: SecurityEventOutcome;
	reasonCode?: string;
	operationCode?: string;
	operationLabel?: string;
	httpMethod?: string;
	routeTemplate?: string;
	httpStatus?: number;
	actorUserId?: string;
	actorRole?: string;
	actorDisplayName?: string;
	targetUserId?: string;
	targetDisplayName?: string;
	resourceType?: string;
	resourceId?: string;
	loginIdentifier?: string;
	clientIp?: string;
	ipSource?: string;
	userAgent?: string;
	requestId?: string;
	schoolScopes?: SecurityEventSchoolScope[];
	accountActionId?: string;
	metadata?: { attemptCount?: number; windowMinutes?: number };
};

export function eventDefaults(type: SecurityEventType): {
	category: SecurityEventCategory;
	severity: SecurityEventSeverity;
	outcome: SecurityEventOutcome;
} {
	if (type === 'REPEATED_LOGIN_FAILURES')
		return { category: 'DETECTION', severity: 'HIGH', outcome: 'DETECTED' };
	if (type === 'ACCESS_DENIED')
		return { category: 'ACCESS', severity: 'WARNING', outcome: 'DENIED' };
	if (type.startsWith('LOGIN_') || type.startsWith('PASSWORD_')) {
		const failure =
			type.includes('FAILED') ||
			type === 'LOGIN_PROVIDER_ERROR' ||
			type === 'LOGIN_RATE_LIMITED' ||
			type.includes('REPAIR_REQUIRED');
		return {
			category: 'AUTH',
			severity: failure || type.includes('DENIED') ? 'WARNING' : 'INFO',
			outcome: failure
				? 'FAILURE'
				: type.includes('DENIED')
					? 'DENIED'
					: 'SUCCESS',
		};
	}
	if (
		type.startsWith('SESSION_') ||
		type.startsWith('LOGOUT_') ||
		type === 'REVOKED_SESSION_USED' ||
		type === 'AUTHENTICATION_REQUIRED'
	) {
		const denied =
			type === 'REVOKED_SESSION_USED' ||
			type === 'AUTHENTICATION_REQUIRED';
		const failure = type.includes('FAILED') || type.includes('REJECTED');
		return {
			category: 'SESSION',
			severity: failure || denied ? 'WARNING' : 'INFO',
			outcome: denied ? 'DENIED' : failure ? 'FAILURE' : 'SUCCESS',
		};
	}
	return {
		category: 'ACCOUNT',
		severity:
			type.includes('FAILED') || type.includes('REPAIR_REQUIRED')
				? 'WARNING'
				: 'INFO',
		outcome:
			type.includes('FAILED') || type.includes('REPAIR_REQUIRED')
				? 'FAILURE'
				: 'SUCCESS',
	};
}
