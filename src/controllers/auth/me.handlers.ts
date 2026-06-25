import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { sendJsonError, sendJsonSuccess } from '../../lib/apiResponse';
import { getPrisma } from '../../lib/prisma';
import { loadDrivingSchoolContextForMe } from '../../services/meContext.service';
import type { AuthRequestUser } from '../../types/express';

function buildMeUserPayload(user: AuthRequestUser) {
	const nameFromParts = [user.firstName, user.lastName]
		.map((s) => String(s).trim())
		.filter((s) => s.length > 0)
		.join(' ')
		.trim();

	return {
		id: user.id,
		name: nameFromParts || user.email,
		firstName: user.firstName,
		lastName: user.lastName,
		email: user.email,
		phone: user.phone,
		avatarUrl: user.profile?.avatarUrl ?? null,
		bio: user.profile?.bio ?? null,
		profileUpdatedAt: user.profile?.updatedAt ?? null,
		role: user.role,
	};
}

export async function buildMeResponsePayload(user: AuthRequestUser) {
	const context = await loadDrivingSchoolContextForMe(user.id, user.role);
	const base = {
		...buildMeUserPayload(user),
		...context,
	};
	if (user.role !== Role.STUDENT) {
		return base;
	}
	const prisma = getPrisma();
	const sp = await prisma.studentProfile.findUnique({
		where: { userId: user.id },
		select: { pkkNumber: true },
	});
	return {
		...base,
		pkkNumber: sp?.pkkNumber ?? null,
	};
}

export async function getMe(req: Request, res: Response) {
	const user = req.user;
	if (!user) {
		return sendJsonError(res, 'Unauthorized', 401);
	}
	const payload = await buildMeResponsePayload(user);
	return sendJsonSuccess(res, { user: payload });
}
