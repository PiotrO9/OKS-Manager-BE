import type { Express, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { getOpenApiSpec } from './openapiSpec';

export function setupSwagger(app: Express): void {
	const spec = getOpenApiSpec();

	app.get('/openapi.json', (_req: Request, res: Response) => {
		res.json(spec);
	});

	app.use(
		'/api-docs',
		swaggerUi.serve,
		swaggerUi.setup(spec, {
			explorer: true,
			customCss: '.swagger-ui .topbar { display: none }',
		}),
	);
}
