import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

/**
 * Wywołaj dokładnie raz przed załadowaniem schematów używanych w OpenAPI.
 * Importowany na początku `server.ts`.
 */
extendZodWithOpenApi(z);
