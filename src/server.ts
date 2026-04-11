import 'dotenv/config';
import './swagger/zodOpenApiInit';
import cors from 'cors';
import express from 'express';
import cookieParser from 'cookie-parser';
import { sendJsonSuccess } from './lib/apiResponse';
import { errorRequestHandler } from './lib/http/errorMiddleware';
import { createAuthRouter } from './routes/auth.routes';
import { createDrivingSchoolsRouter } from './routes/driving-schools.routes';
import { createInstructorsRouter } from './routes/instructors.routes';
import { createStudentsRouter } from './routes/students.routes';
import { createVehiclesRouter } from './routes/vehicles.routes';
import { createCoursesRouter } from './routes/courses.routes';
import { createCourseTypesRouter } from './routes/course-types.routes';
import { createEventsRouter } from './routes/events.routes';
import { createLessonsRouter } from './routes/lessons.routes';
import { createScheduleRouter } from './routes/schedule.routes';
import { setupSwagger } from './swagger/setupSwagger';

function parseAllowedOrigins(): string[] {
	const raw = process.env.FRONTEND_URL?.trim();
	if (raw) {
		return raw
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	}
	return ['http://localhost:5173', 'http://localhost:3000'];
}

function createApp() {
	const app = express();
	app.use(
		cors({
			origin: parseAllowedOrigins(),
			credentials: true,
		}),
	);
	app.use(express.json());
	app.use(cookieParser());

	app.use('/auth', createAuthRouter());
	app.use('/driving-schools', createDrivingSchoolsRouter());
	app.use('/instructors', createInstructorsRouter());
	app.use('/students', createStudentsRouter());
	app.use('/vehicles', createVehiclesRouter());
	app.use('/courses', createCoursesRouter());
	app.use('/course-types', createCourseTypesRouter());
	app.use('/events', createEventsRouter());
	app.use('/lessons', createLessonsRouter());
	app.use('/schedule', createScheduleRouter());

	app.get('/test', async (req, res) => {
		return sendJsonSuccess(res, {
			message: 'OSK Manager API - test endpoint',
		});
	});

	setupSwagger(app);

	app.use(errorRequestHandler);

	return app;
}

async function startServer() {
	const app = createApp();
	const port = process.env.PORT || 3001;
	app.listen(port, () => {
		// eslint-disable-next-line no-console
		console.log(`Server listening on http://localhost:${port}`);
	});
}

startServer().catch((err) => {
	// eslint-disable-next-line no-console
	console.error(err);
	process.exit(1);
});
