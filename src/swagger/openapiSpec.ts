import {
	OpenAPIRegistry,
	OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import './zodOpenApiInit';
import { registerOpenApiPaths } from './registerOpenApiPaths';

export function getOpenApiSpec(): Record<string, unknown> {
	const port = process.env.PORT ?? '3001';
	const baseUrl =
		process.env.API_BASE_URL?.trim() || `http://localhost:${port}`;

	const registry = new OpenAPIRegistry();
	registerOpenApiPaths(registry);

	const generator = new OpenApiGeneratorV3(registry.definitions);

	return generator.generateDocument({
		openapi: '3.0.3',
		info: {
			title: 'OSK Manager API',
			version: '0.1.0',
			description:
				'REST API — odpowiedzi `{ success, data?, error? }`. Ścieżki, body i parametry są generowane z schematów **Zod** (`@asteasolutions/zod-to-openapi`). Szczegóły biznesowe: `context/*.md`.',
		},
		servers: [{ url: baseUrl, description: 'Bieżący serwer' }],
		tags: [
			{ name: 'Health', description: 'Test' },
			{
				name: 'Auth',
				description: 'POST /auth/*, Bearer dla chronionych',
			},
			{ name: 'Driving schools', description: 'OSK' },
			{ name: 'Instructors', description: 'Instruktorzy (MANAGER)' },
			{
				name: 'Instructor availability',
				description: 'Grafik / dostępność instruktora',
			},
			{ name: 'Students', description: 'Kursanci' },
			{ name: 'Vehicles', description: 'Pojazdy' },
			{ name: 'Courses', description: 'Kursy' },
			{ name: 'Course types', description: 'Typy kursów' },
			{
				name: 'Events',
				description: 'Wydarzenia instruktora (bloki czasu, MANAGER)',
			},
		],
	}) as unknown as Record<string, unknown>;
}
