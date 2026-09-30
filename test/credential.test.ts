import { describe, expect, it } from 'vitest';

import { EmailFigApi } from '../credentials/EmailFigApi.credentials';

describe('EmailFigApi credential', () => {
	const credential = new EmailFigApi();

	it('sends the key as a bearer token', () => {
		expect(credential.authenticate).toEqual({
			type: 'generic',
			properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
		});
	});

	it('tests the key against GET /account on the configured base URL', () => {
		expect(credential.test.request).toEqual({
			baseURL: '={{$credentials.baseUrl}}',
			url: '/account',
		});
	});

	it('defaults to the production API and hides the key', () => {
		const byName = Object.fromEntries(credential.properties.map((p) => [p.name, p]));
		expect(byName.baseUrl.default).toBe('https://emailfig.com/api/v1');
		expect(byName.apiKey.typeOptions).toEqual({ password: true });
	});
});
