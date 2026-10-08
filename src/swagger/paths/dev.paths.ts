import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
	auditExecuteBodySchema,
	auditPreviewBodySchema,
	devResetAndSeedBodySchema,
} from '../../schemas/dev.schemas';
import { clientError, okDataUnknown, stdBearerResponses } from './shared';

export function registerDevPaths(registry: OpenAPIRegistry): void {
	registry.registerPath({
		method: 'post',
		path: '/dev/reset-and-seed',
		tags: ['Dev'],
		summary: 'Reset bazy i seed danych demo',
		description:
			'Endpoint deweloperski. Wymaga ADMIN, ALLOW_DB_RESET=true, ALLOW_DB_FULL_RESET=true, AUDIT_RESET_TARGET_FINGERPRINT, AUDIT_RESET_CONFIRM_SECRET, środowiska innego niż production oraz nagłówka x-audit-full-confirmation: WIPE AUDIT DATABASE.',
		security: [{ bearerAuth: [] }],
		request: {
			body: {
				required: false,
				description:
					'Opcjonalne poziomy liczby generowanych danych. Pominięte pola korzystają z wartości domyślnych seedera.',
				content: {
					'application/json': {
						schema: devResetAndSeedBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Database reset and demo seed completed'),
			403: clientError('Brak roli ADMIN lub wyłączony reset bazy'),
		}),
	});

	registry.registerPath({
		method: 'post',
		path: '/dev/audit/preview',
		tags: ['Dev'],
		summary: 'Podgląd resetu danych audytu',
		description:
			'Wymaga ADMIN, ALLOW_DB_RESET=true, środowiska innego niż production i AUDIT_RESET_CONFIRM_SECRET. Zwraca liczebności, identyfikator celu i potwierdzenie ważne 10 minut. Nie modyfikuje danych.',
		security: [{ bearerAuth: [] }],
		request: {
			body: {
				required: true,
				content: {
					'application/json': { schema: auditPreviewBodySchema },
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Podgląd resetu audytu'),
			403: clientError('Reset audytu jest wyłączony'),
		}),
	});

	registry.registerPath({
		method: 'post',
		path: '/dev/audit/execute',
		tags: ['Dev'],
		summary: 'Wykonanie resetu lub zestawu audytowego',
		description:
			'Wymaga ADMIN, ALLOW_DB_RESET=true, zgodnego AUDIT_RESET_TARGET_FINGERPRINT i ważnego potwierdzenia z preview. Pełny reset i fixture wymagają także ALLOW_DB_FULL_RESET=true oraz fullConfirmation="WIPE AUDIT DATABASE". Operacja dotyczy tabel aplikacji; Auth i Storage są osobne.',
		security: [{ bearerAuth: [] }],
		request: {
			body: {
				required: true,
				content: {
					'application/json': { schema: auditExecuteBodySchema },
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Reset danych audytu wykonany'),
			403: clientError('Cel lub poziom resetu nie jest dozwolony'),
			409: clientError(
				'Podgląd wygasł, dane zmieniły się lub trwa reset',
			),
		}),
	});
}
