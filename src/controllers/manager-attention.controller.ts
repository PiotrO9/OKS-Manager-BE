import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { requireUser } from '../lib/http/requireUser';
import { managerAttentionQuerySchema } from '../schemas/manager-attention.schemas';
import { listManagerAttentionItems } from '../services/manager-attention.service';
import { parseRequestPart } from './requestParsing';

async function listAttentionItems(req: Request, res: Response) {
	const user = requireUser(req);
	const query = parseRequestPart(
		managerAttentionQuerySchema,
		req.query,
		'query',
	);

	const data = await listManagerAttentionItems(
		user.id,
		user.role,
		query.schoolId,
	);

	return sendJsonSuccess(res, data);
}

export { listAttentionItems };
