import { describe, expect, it } from 'vitest';
import { getOpenApiSpec } from '../../swagger/openapiSpec';

describe('getOpenApiSpec', () => {
	it('keeps representative public paths registered', () => {
		const spec = getOpenApiSpec() as {
			paths?: Record<string, Record<string, unknown>>;
		};

		expect(spec.paths?.['/auth/login']?.post).toBeDefined();
		expect(spec.paths?.['/auth/me']?.get).toBeDefined();
		expect(spec.paths?.['/vehicles/{id}/photo']?.post).toBeDefined();
		expect(
			spec.paths?.['/events/{id}/eligible-students']?.get,
		).toBeDefined();
		expect(spec.paths?.['/lessons/me']?.post).toBeDefined();
		expect(
			spec.paths?.['/instructors/{instructorId}/availability/slots']?.get,
		).toBeDefined();
	});

	it('keeps the documented domain route surface stable', () => {
		const spec = getOpenApiSpec() as {
			paths?: Record<string, Record<string, unknown>>;
		};

		const expectedDocumentedRoutes: Array<[string, string]> = [
			['get', '/test'],
			['post', '/auth/register'],
			['post', '/auth/login'],
			['post', '/auth/refresh'],
			['post', '/auth/logout'],
			['get', '/auth/me'],
			['patch', '/auth/profile'],
			['post', '/auth/profile/avatar'],
			['get', '/driving-schools'],
			['get', '/driving-schools/default'],
			['get', '/driving-schools/{id}/availability/slots'],
			['post', '/driving-schools'],
			['patch', '/driving-schools/{id}/set-default'],
			['patch', '/driving-schools/{id}/default-vehicle'],
			['patch', '/driving-schools/{id}'],
			['delete', '/driving-schools/{id}'],
			['get', '/instructors'],
			['get', '/instructors/{id}'],
			['get', '/instructors/{id}/ratings'],
			['post', '/instructors/{id}/schools'],
			['patch', '/instructors/{id}'],
			['delete', '/instructors/{id}'],
			['get', '/instructors/{instructorId}/availability/weekly'],
			[
				'put',
				'/instructors/{instructorId}/availability/weekly/{dayOfWeek}',
			],
			[
				'delete',
				'/instructors/{instructorId}/availability/weekly/{dayOfWeek}',
			],
			['get', '/instructors/{instructorId}/availability/exceptions'],
			[
				'put',
				'/instructors/{instructorId}/availability/exceptions/{date}',
			],
			[
				'delete',
				'/instructors/{instructorId}/availability/exceptions/{date}',
			],
			['get', '/instructors/{instructorId}/availability/compute'],
			['get', '/instructors/{instructorId}/availability/slots'],
			['get', '/students'],
			['get', '/students/{userId}/events'],
			['get', '/students/{userId}/process-status'],
			['get', '/students/{userId}/payments'],
			['get', '/students/{userId}'],
			['patch', '/students/{userId}'],
			['patch', '/students/{userId}/driving-school'],
			['patch', '/students/{userId}/pkk'],
			['post', '/students/{userId}/courses'],
			['patch', '/students/{userId}/courses/{courseId}/status'],
			['get', '/vehicles'],
			['get', '/vehicles/{id}'],
			['post', '/vehicles'],
			['post', '/vehicles/{id}/photo'],
			['patch', '/vehicles/{id}/status'],
			['patch', '/vehicles/{id}'],
			['delete', '/vehicles/{id}'],
			['get', '/courses'],
			['get', '/courses/{id}'],
			['patch', '/courses/{id}'],
			['post', '/courses'],
			['get', '/course-types'],
			['get', '/events/{id}'],
			['patch', '/events/{id}'],
			['delete', '/events/{id}'],
			['get', '/events/{id}/students'],
			['put', '/events/{id}/students'],
			['delete', '/events/{id}/students/{studentUserId}'],
			['post', '/events/{id}/students'],
			['get', '/events/{id}/eligible-students'],
			['post', '/events'],
			['post', '/lessons'],
			['post', '/lessons/me'],
			['patch', '/lessons/{lessonId}/cancel'],
			['post', '/lessons/{lessonId}/rating'],
			['get', '/lessons/{lessonId}/rating'],
			['get', '/lessons/{id}'],
			['patch', '/lessons/{id}'],
			['get', '/ratings'],
			['get', '/ratings/me'],
		];

		for (const [method, path] of expectedDocumentedRoutes) {
			expect(
				spec.paths?.[path]?.[method],
				`${method.toUpperCase()} ${path}`,
			).toBeDefined();
		}
	});
});
