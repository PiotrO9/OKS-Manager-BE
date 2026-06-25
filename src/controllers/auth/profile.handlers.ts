import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { sendJsonSuccess } from '../../lib/apiResponse';
import { AppError } from '../../lib/http/AppError';
import { requireUser } from '../../lib/http/requireUser';
import { getPrisma } from '../../lib/prisma';
import {
	type PatchProfileInput,
	type UploadedPhotoFile,
	userProfileService,
} from '../../services/userProfile.service';
import { buildMeResponsePayload } from './me.handlers';

export async function patchProfile(req: Request, res: Response) {
	const u = requireUser(req);
	const body = req.body as Record<string, unknown>;
	const wantsNameField =
		Object.prototype.hasOwnProperty.call(body, 'firstName') ||
		Object.prototype.hasOwnProperty.call(body, 'lastName');
	if (wantsNameField && u.role !== Role.MANAGER && u.role !== Role.ADMIN) {
		throw AppError.forbidden('Forbidden');
	}

	const patch: PatchProfileInput = {};
	if (Object.prototype.hasOwnProperty.call(body, 'bio')) {
		patch.bio = body.bio as string | null;
	}
	if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
		patch.phone = body.phone as string | null;
	}
	if (Object.prototype.hasOwnProperty.call(body, 'firstName')) {
		patch.firstName = body.firstName as string;
	}
	if (Object.prototype.hasOwnProperty.call(body, 'lastName')) {
		patch.lastName = body.lastName as string;
	}
	await userProfileService.patchProfileForUser(u.id, patch);

	const prisma = getPrisma();
	const updated = await prisma.user.findUnique({
		where: { id: u.id },
		include: { profile: true },
	});
	if (!updated) {
		throw AppError.notFound('User not found');
	}

	return sendJsonSuccess(res, {
		ok: true,
		user: await buildMeResponsePayload(updated),
	});
}

export async function uploadProfileAvatar(req: Request, res: Response) {
	const u = requireUser(req);
	const file = (req as Request & { file?: UploadedPhotoFile }).file;
	const data = await userProfileService.uploadAvatarForUser(
		u.id,
		file as UploadedPhotoFile,
	);
	return sendJsonSuccess(res, { photoUrl: data.avatarUrl });
}
