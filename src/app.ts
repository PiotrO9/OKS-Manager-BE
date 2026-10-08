import './swagger/zodOpenApiInit';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { sendJsonSuccess } from './lib/apiResponse';
import { errorRequestHandler } from './lib/http/errorMiddleware';
import { requestIdMiddleware } from './middleware/requestId.middleware';
import { createAuthRouter } from './routes/auth.routes';
import { createCourseTypesRouter } from './routes/course-types.routes';
import { createCoursesRouter } from './routes/courses.routes';
import { createDevRouter } from './routes/dev.routes';
import { createDrivingSchoolsRouter } from './routes/driving-schools.routes';
import { createEventsRouter } from './routes/events.routes';
import { createInstructorsRouter } from './routes/instructors.routes';
import { createLessonRatingsRouter } from './routes/lesson-ratings.routes';
import { createLessonsRouter } from './routes/lessons.routes';
import { createManagerAttentionRouter } from './routes/manager-attention.routes';
import { createManagerAccountsRouter } from './routes/manager-accounts.routes';
import { createMeRouter } from './routes/me.routes';
import { createScheduleRouter } from './routes/schedule.routes';
import { createStudentsRouter } from './routes/students.routes';
import { createVehiclesRouter } from './routes/vehicles.routes';
import { setupSwagger } from './swagger/setupSwagger';

function parseAllowedOrigins(): string[] {
	const frontendUrlSetting = process.env.FRONTEND_URL?.trim();
	if (frontendUrlSetting) {
		return frontendUrlSetting
			.split(',')
			.map((origin) => origin.trim())
			.filter(Boolean);
	}
	return ['http://localhost:5173', 'http://localhost:3000'];
}

export function createApp() {
	const app = express();
	app.use(
		cors({
			origin: parseAllowedOrigins(),
			credentials: true,
		}),
	);
	app.use(express.json());
	app.use(cookieParser());
	app.use(requestIdMiddleware);

	app.use('/auth', createAuthRouter());
	app.use('/driving-schools', createDrivingSchoolsRouter());
	app.use('/instructors', createInstructorsRouter());
	app.use('/students', createStudentsRouter());
	app.use('/vehicles', createVehiclesRouter());
	app.use('/courses', createCoursesRouter());
	app.use('/course-types', createCourseTypesRouter());
	app.use('/events', createEventsRouter());
	app.use('/lessons', createLessonsRouter());
	app.use('/ratings', createLessonRatingsRouter());
	app.use('/manager', createManagerAttentionRouter());
	app.use('/manager', createManagerAccountsRouter());
	app.use('/me', createMeRouter());
	app.use('/schedule', createScheduleRouter());
	app.use('/dev', createDevRouter());

	app.get('/health', async (_req, res) => {
		return sendJsonSuccess(res, { status: 'ok' });
	});

	app.get('/test', async (_req, res) => {
		return sendJsonSuccess(res, {
			message: 'OSK Manager API - test endpoint',
		});
	});

	setupSwagger(app);
	app.use(errorRequestHandler);

	return app;
}
