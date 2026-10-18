import type { NextFunction, Request, Response } from 'express';

export type SecurityOperation = {
	code: string;
	label: string;
	routeTemplate: string;
	method: string;
};

type Definition = SecurityOperation & { segments: string[] };

const definitions: Definition[] = [];

function add(
	method: string,
	routeTemplate: string,
	code: string,
	label: string,
) {
	definitions.push({
		method,
		routeTemplate,
		code,
		label,
		segments: routeTemplate.split('/').filter(Boolean),
	});
}

// Keep this catalog at the HTTP boundary: authorization may reject a request
// before Express has selected a route, so req.route is unavailable there.
add('POST', '/auth/login', 'AUTH_LOGIN', 'Logowanie');
add('POST', '/auth/register', 'AUTH_REGISTER', 'Rejestracja użytkownika');
add(
	'POST',
	'/auth/password-recovery/request',
	'AUTH_RECOVERY_REQUEST',
	'Żądanie resetu hasła',
);
add(
	'POST',
	'/auth/password-recovery/complete',
	'AUTH_RECOVERY_COMPLETE',
	'Zmiana hasła przez link odzyskiwania',
);
add('POST', '/auth/refresh', 'AUTH_REFRESH', 'Odnowienie sesji');
add('POST', '/auth/logout', 'AUTH_LOGOUT', 'Wylogowanie');
add('GET', '/auth/me', 'AUTH_ME', 'Odczyt profilu użytkownika');
add(
	'PATCH',
	'/auth/profile',
	'AUTH_PROFILE_UPDATE',
	'Zmiana profilu użytkownika',
);
add(
	'POST',
	'/auth/profile/avatar',
	'AUTH_AVATAR_UPDATE',
	'Zmiana zdjęcia profilowego',
);

add(
	'GET',
	'/manager/security-logs',
	'SECURITY_LOGS_LIST',
	'Przeglądanie dziennika bezpieczeństwa',
);
add(
	'GET',
	'/manager/security-logs/filter-options',
	'SECURITY_LOGS_FILTER_OPTIONS',
	'Pobranie filtrów dziennika bezpieczeństwa',
);
add(
	'GET',
	'/manager/security-logs/:eventId',
	'SECURITY_LOGS_DETAIL',
	'Przeglądanie szczegółów zdarzenia bezpieczeństwa',
);
add(
	'GET',
	'/manager/attention-items',
	'MANAGER_ATTENTION_LIST',
	'Przeglądanie spraw wymagających uwagi',
);
add(
	'GET',
	'/manager/accounts',
	'MANAGER_ACCOUNTS_LIST',
	'Przeglądanie kont szkoły',
);
add(
	'GET',
	'/manager/accounts/:userId',
	'MANAGER_ACCOUNT_DETAIL',
	'Przeglądanie konta użytkownika',
);
add(
	'PATCH',
	'/manager/accounts/:userId/profile',
	'MANAGER_ACCOUNT_PROFILE_UPDATE',
	'Zmiana profilu konta',
);
add(
	'PATCH',
	'/manager/accounts/:userId/email',
	'MANAGER_ACCOUNT_EMAIL_UPDATE',
	'Zmiana adresu e-mail konta',
);
add(
	'POST',
	'/manager/accounts/:userId/email/reconcile',
	'MANAGER_ACCOUNT_EMAIL_RECONCILE',
	'Uzgodnienie zmiany adresu e-mail konta',
);
add(
	'PATCH',
	'/manager/accounts/:userId/status',
	'MANAGER_ACCOUNT_STATUS_UPDATE',
	'Zmiana aktywności konta',
);
add(
	'POST',
	'/manager/accounts/:userId/archive',
	'MANAGER_ACCOUNT_ARCHIVE',
	'Archiwizacja konta',
);
add(
	'POST',
	'/manager/accounts/:userId/password-reset',
	'MANAGER_ACCOUNT_PASSWORD_RESET',
	'Wysłanie resetu hasła konta',
);

add(
	'POST',
	'/students/:userId/courses',
	'STUDENT_COURSE_ASSIGN',
	'Przypisanie kursanta do kursu',
);
add(
	'PATCH',
	'/students/:userId/payments/:paymentId/mark-paid',
	'STUDENT_PAYMENT_MARK_PAID',
	'Oznaczenie płatności jako opłaconej',
);
add(
	'PATCH',
	'/students/:userId/payments/:paymentId/mark-unpaid',
	'STUDENT_PAYMENT_MARK_UNPAID',
	'Oznaczenie płatności jako nieopłaconej',
);
add(
	'PATCH',
	'/students/:userId/driving-school',
	'STUDENT_SCHOOL_CHANGE',
	'Zmiana szkoły kursanta',
);
add(
	'PATCH',
	'/vehicles/:id/status',
	'VEHICLE_STATUS_UPDATE',
	'Zmiana statusu pojazdu',
);
add(
	'POST',
	'/instructors/:id/schools',
	'INSTRUCTOR_SCHOOL_ASSIGN',
	'Przypisanie instruktora do szkoły',
);
add(
	'PUT',
	'/instructors/:id/school',
	'INSTRUCTOR_SCHOOL_CHANGE',
	'Zmiana szkoły instruktora',
);
add(
	'PATCH',
	'/events/bulk-status',
	'EVENT_BULK_STATUS_UPDATE',
	'Zbiorcza zmiana statusu wydarzeń',
);
add(
	'POST',
	'/events/:id/students',
	'EVENT_STUDENT_ADD',
	'Dodanie uczestnika wydarzenia',
);
add(
	'PUT',
	'/events/:id/students',
	'EVENT_STUDENTS_UPDATE',
	'Zmiana uczestników wydarzenia',
);
add(
	'DELETE',
	'/events/:id/students/:studentUserId',
	'EVENT_STUDENT_REMOVE',
	'Usunięcie uczestnika wydarzenia',
);
add(
	'POST',
	'/schedule/availability-check',
	'SCHEDULE_AVAILABILITY_CHECK',
	'Sprawdzenie dostępności grafiku',
);
add('POST', '/lessons/me', 'LESSON_SELF_BOOK', 'Rezerwacja jazdy');
add('PATCH', '/lessons/:lessonId/cancel', 'LESSON_CANCEL', 'Odwołanie jazdy');
add(
	'POST',
	'/lessons/:lessonId/rating',
	'LESSON_RATING_CREATE',
	'Wystawienie oceny jazdy',
);

const resources: Record<string, string> = {
	'driving-schools': 'szkoły jazdy',
	instructors: 'instruktorów',
	students: 'kursantów',
	vehicles: 'pojazdów',
	courses: 'kursów',
	'course-types': 'typów kursów',
	events: 'wydarzeń',
	lessons: 'jazd',
	ratings: 'ocen jazd',
	schedule: 'grafiku',
	me: 'własnych danych',
};

const actionLabels: Record<string, string> = {
	availability: 'dostępności',
	slots: 'terminów',
	students: 'uczestników',
	payments: 'płatności',
	'process-status': 'statusu szkolenia',
	'driving-school': 'przypisania do szkoły',
	pkk: 'numeru PKK',
	status: 'statusu',
	'bulk-status': 'zbiorczego statusu',
	profile: 'profilu',
	photo: 'zdjęcia',
	'password-reset': 'resetu hasła',
	'booking-options': 'możliwości rezerwacji',
	cancel: 'odwołania',
	rating: 'oceny',
	weekly: 'tygodniowej dostępności',
	exceptions: 'wyjątków dostępności',
	'eligible-students': 'uprawnionych kursantów',
	'default-vehicle': 'domyślnego pojazdu',
	'set-default': 'ustawienia domyślnej szkoły',
};

function addGenericRoutes(prefix: string, routes: string) {
	for (const entry of routes.trim().split(/\s+/)) {
		const separator = entry.indexOf(':');
		const method = entry.slice(0, separator);
		const path = entry.slice(separator + 1);
		const routeTemplate = `${prefix}${path === '/' ? '' : path}`;
		const code = `HTTP_${method}_${routeTemplate
			.toUpperCase()
			.replace(/:[A-Z][A-Z0-9]*/g, 'ID')
			.replace(/[^A-Z0-9]+/g, '_')
			.replace(/^_|_$/g, '')}`;
		const section = prefix.split('/')[1] ?? '';
		const lastAction = path
			.split('/')
			.filter(Boolean)
			.reverse()
			.find((part) => part in actionLabels);
		const verb =
			method === 'GET'
				? 'Odczyt'
				: method === 'POST'
					? 'Utworzenie lub wykonanie'
					: method === 'DELETE'
						? 'Usunięcie'
						: 'Zmiana';
		add(
			method,
			routeTemplate,
			code,
			`${verb} ${lastAction ? actionLabels[lastAction] : (resources[section] ?? 'zasobu')}`,
		);
	}
}

addGenericRoutes(
	'/driving-schools',
	`GET:/ GET:/default GET:/:id/availability/slots POST:/ PATCH:/:id/set-default PATCH:/:id/default-vehicle PATCH:/:id DELETE:/:id`,
);
addGenericRoutes(
	'/instructors',
	`GET:/ GET:/:id GET:/:id/ratings POST:/:id/schools PUT:/:id/school PATCH:/:id DELETE:/:id`,
);
addGenericRoutes(
	'/instructors/:instructorId/availability',
	`GET:/weekly PUT:/weekly/:dayOfWeek DELETE:/weekly/:dayOfWeek GET:/exceptions PUT:/exceptions/:date DELETE:/exceptions/:date GET:/compute GET:/slots`,
);
addGenericRoutes(
	'/students',
	`GET:/ GET:/:userId/events GET:/:userId/process-status GET:/:userId/payments POST:/:userId/payments PATCH:/:userId/payments/:paymentId PATCH:/:userId/payments/:paymentId/mark-paid PATCH:/:userId/payments/:paymentId/mark-unpaid GET:/:userId PATCH:/:userId PATCH:/:userId/driving-school PATCH:/:userId/pkk POST:/:userId/courses PATCH:/:userId/courses/:courseId/status`,
);
addGenericRoutes(
	'/vehicles',
	`GET:/ GET:/:id POST:/ POST:/:id/photo PATCH:/:id/status PATCH:/:id DELETE:/:id`,
);
addGenericRoutes('/courses', `GET:/ GET:/:id PATCH:/:id DELETE:/:id POST:/`);
addGenericRoutes('/course-types', `GET:/`);
addGenericRoutes(
	'/events',
	`GET:/ PATCH:/bulk-status POST:/ GET:/:id/eligible-students GET:/:id PATCH:/:id DELETE:/:id GET:/:id/students PUT:/:id/students POST:/:id/students/availability-check DELETE:/:id/students/:studentUserId POST:/:id/students`,
);
addGenericRoutes(
	'/lessons',
	`GET:/ GET:/me GET:/booking-options POST:/ POST:/me PATCH:/:lessonId/cancel POST:/:lessonId/rating GET:/:lessonId/rating GET:/:id/instructor-options GET:/:id PATCH:/:id`,
);
addGenericRoutes('/ratings', `GET:/ GET:/`);
addGenericRoutes(
	'/schedule',
	`GET:/me POST:/availability-check POST:/availability-options GET:/`,
);
addGenericRoutes('/me', `GET:/courses GET:/payments`);

function fallbackOperation(
	method: string,
	pathname: string,
): SecurityOperation {
	const segments = pathname.split('/').filter(Boolean);
	const resource = segments[0] ?? 'zasobu';
	const normalized = segments.map((segment, index) => {
		if (index === 0) return segment;
		if (segment in actionLabels) return segment;
		return ':id';
	});
	const routeTemplate = `/${normalized.join('/')}`;
	const action = [...normalized]
		.reverse()
		.find((segment) => segment in actionLabels);
	const verb =
		method === 'GET'
			? 'Odczyt'
			: method === 'POST'
				? 'Utworzenie lub wykonanie'
				: method === 'DELETE'
					? 'Usunięcie'
					: 'Zmiana';
	const label = `${verb} ${action ? actionLabels[action] : (resources[resource] ?? 'zasobu')}`;
	return {
		method,
		routeTemplate,
		code: `HTTP_${method}_${resource.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
		label,
	};
}

export function lookupSecurityOperation(
	method: string,
	pathname: string,
): SecurityOperation | null {
	const normalizedMethod = method.toUpperCase();
	const requestSegments = pathname.split('?')[0].split('/').filter(Boolean);
	const matches = definitions.filter(
		(entry) =>
			entry.method === normalizedMethod &&
			entry.segments.length === requestSegments.length &&
			entry.segments.every(
				(segment, index) =>
					segment.startsWith(':') ||
					segment === requestSegments[index],
			),
	);
	const match = matches.sort(
		(a, b) =>
			b.segments.filter((segment) => !segment.startsWith(':')).length -
			a.segments.filter((segment) => !segment.startsWith(':')).length,
	)[0];
	if (match) {
		return {
			code: match.code,
			label: match.label,
			routeTemplate: match.routeTemplate,
			method: match.method,
		};
	}
	return null;
}

export function resolveSecurityOperation(
	method: string,
	pathname: string,
): SecurityOperation {
	return (
		lookupSecurityOperation(method, pathname) ??
		fallbackOperation(method.toUpperCase(), pathname)
	);
}

export function securityOperationContext(
	req: Request,
	_res: Response,
	next: NextFunction,
) {
	req.securityOperation = resolveSecurityOperation(req.method, req.path);
	next();
}
