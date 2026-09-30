import { describe, expect, it } from 'vitest';

import {
	apiError,
	INVALID_KEY,
	problemMessage,
	problemOf,
	RATE_LIMITED,
} from '../nodes/EmailFig/shared/errors';
import { NODE } from './fake';

const ctx = { getNode: () => NODE };

describe('problemMessage', () => {
	it('prefers the first field error, humanizing the field', () => {
		const problem = {
			errors: [{ field: 'email_address', code: 'invalid', message: 'is invalid' }],
		};
		expect(problemMessage(problem, 422)).toBe('Email address: is invalid');
	});

	it('shows a base error alone, a bare properties error as Custom fields, and a property by its key', () => {
		expect(
			problemMessage({ errors: [{ field: 'base', message: 'You have hit a limit' }] }, 422),
		).toBe('You have hit a limit');
		expect(
			problemMessage(
				{ errors: [{ field: 'properties', message: 'contains undefined custom fields: x' }] },
				422,
			),
		).toBe('Custom fields: contains undefined custom fields: x');
		expect(
			problemMessage({ errors: [{ field: 'properties.plan', message: 'is too long' }] }, 422),
		).toBe('plan: is too long');
	});

	it('names a taken address plainly', () => {
		const problem = {
			errors: [
				{ field: 'email_address', code: 'contact_exists', message: 'has already been taken' },
			],
		};
		expect(problemMessage(problem, 422)).toBe('Another contact already has that email address.');
	});

	it('falls back to detail, then title, then the status', () => {
		expect(problemMessage({ detail: 'That record already exists.', title: 'Conflict' }, 422)).toBe(
			'That record already exists.',
		);
		expect(problemMessage({ title: 'Account is suspended' }, 403)).toBe('Account is suspended');
		expect(problemMessage({}, 502)).toBe('EmailFig answered HTTP 502.');
	});
});

describe('problemOf', () => {
	it('reads a JSON string and survives HTML', () => {
		expect(problemOf('{"title":"Not found"}')).toEqual({ title: 'Not found' });
		expect(problemOf('<html>Bad gateway</html>')).toEqual({});
		expect(problemOf(undefined)).toEqual({});
	});
});

describe('apiError', () => {
	it('passes a 5xx problem title through', () => {
		expect(apiError(ctx, { statusCode: 503, body: { title: 'Service unavailable' } }).message).toBe(
			'Service unavailable',
		);
	});

	it('uses fixed wording for 401 and 429, and the caller wording for a 404', () => {
		expect(apiError(ctx, { statusCode: 401, body: { title: 'Unauthorized' } }).message).toBe(
			INVALID_KEY,
		);
		expect(apiError(ctx, { statusCode: 429, body: {} }).message).toBe(RATE_LIMITED);
		expect(
			apiError(
				ctx,
				{ statusCode: 404, body: { title: 'Not found' } },
				{ notFound: 'List not found' },
			).message,
		).toBe('List not found');
	});

	it('keeps the status and the problem type', () => {
		const error = apiError(
			ctx,
			{
				statusCode: 403,
				body: {
					type: 'https://emailfig.com/docs/errors/account_suspended',
					title: 'Account is suspended',
				},
			},
			{ itemIndex: 2 },
		);
		expect(error.message).toBe('Account is suspended');
		expect(error.httpCode).toBe('403');
		expect(error.description).toBe('HTTP 403, https://emailfig.com/docs/errors/account_suspended');
		expect(error.context.itemIndex).toBe(2);
	});
});
