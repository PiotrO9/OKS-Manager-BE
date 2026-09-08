import { Request, Response } from 'express';
import { sendJsonSuccess } from '../../lib/apiResponse';
import { requireUser } from '../../lib/http/requireUser';
import {
	createStudentPaymentBodySchema,
	markStudentPaymentPaidBodySchema,
	markStudentPaymentUnpaidBodySchema,
	studentDetailParamsSchema,
	studentPaymentParamsSchema,
	studentPaymentsQuerySchema,
	studentUserIdParamsSchema,
	updateStudentPaymentBodySchema,
} from '../../lib/validation/uuid';
import {
	createStudentPaymentForManager,
	listStudentPayments as fetchStudentPayments,
	markStudentPaymentPaidForManager,
	markStudentPaymentUnpaidForManager,
	updateStudentPaymentForManager,
} from '../../services/students.service';
import { parseRequestPart } from '../requestParsing';

async function getStudentPayments(req: Request, res: Response) {
	const user = requireUser(req);

	const params = parseRequestPart(
		studentDetailParamsSchema,
		req.params,
		'params',
	);
	const query = parseRequestPart(
		studentPaymentsQuerySchema,
		req.query,
		'query',
	);

	const data = await fetchStudentPayments(
		user.id,
		user.role,
		params.userId,
		query,
	);
	return sendJsonSuccess(res, data);
}

async function createStudentPayment(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(
		studentUserIdParamsSchema,
		req.params,
		'params',
	);
	const body = parseRequestPart(
		createStudentPaymentBodySchema,
		req.body,
		'body',
	);

	const data = await createStudentPaymentForManager(
		user.id,
		user.role,
		params.userId,
		body,
	);
	return sendJsonSuccess(res, data, 201);
}

async function updateStudentPayment(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(
		studentPaymentParamsSchema,
		req.params,
		'params',
	);
	const body = parseRequestPart(
		updateStudentPaymentBodySchema,
		req.body,
		'body',
	);

	const data = await updateStudentPaymentForManager(
		user.id,
		user.role,
		params.userId,
		params.paymentId,
		body,
	);
	return sendJsonSuccess(res, data);
}

async function markStudentPaymentPaid(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(
		studentPaymentParamsSchema,
		req.params,
		'params',
	);
	const body = parseRequestPart(
		markStudentPaymentPaidBodySchema,
		req.body,
		'body',
	);

	const data = await markStudentPaymentPaidForManager(
		user.id,
		user.role,
		params.userId,
		params.paymentId,
		body,
	);
	return sendJsonSuccess(res, data);
}

async function markStudentPaymentUnpaid(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(
		studentPaymentParamsSchema,
		req.params,
		'params',
	);
	const body = parseRequestPart(
		markStudentPaymentUnpaidBodySchema,
		req.body,
		'body',
	);

	const data = await markStudentPaymentUnpaidForManager(
		user.id,
		user.role,
		params.userId,
		params.paymentId,
		body,
	);
	return sendJsonSuccess(res, data);
}

export {
	createStudentPayment,
	getStudentPayments,
	markStudentPaymentPaid,
	markStudentPaymentUnpaid,
	updateStudentPayment,
};
