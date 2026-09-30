import { describe, expect, it } from 'vitest';

import {
	call,
	compact,
	findContactByEmail,
	isPrefixedId,
	paginate,
	request,
} from '../nodes/EmailFig/shared/api';
import { BASE, executeContext } from './fake';

describe('call', () => {
	it('fills path params, encoded, onto the credential base URL', async () => {
		const { ctx, sent } = executeContext([{}], [{ status: 204 }]);
		const response = await call(ctx, 'leaveList', {
			params: { list_id: 'lst_1', contact_id: 'con/2' },
		});
		expect(response.statusCode).toBe(204);
		expect(sent[0]).toMatchObject({
			method: 'DELETE',
			url: `${BASE}/lists/lst_1/contacts/con%2F2`,
		});
	});

	it('refuses a query or body key the route does not declare', async () => {
		const { ctx, sent } = executeContext([{}], []);
		await expect(call(ctx, 'listContacts', { qs: { tag_id: 'tag_1' } })).rejects.toThrow(
			'listContacts does not declare query key tag_id',
		);
		await expect(
			call(ctx, 'joinList', {
				params: { list_id: 'lst_1' },
				body: { consent: { ip: '1.2.3.4', when: 'x' } },
			}),
		).rejects.toThrow('joinList does not declare body key consent.when');
		expect(sent).toHaveLength(0);
	});

	it('accepts any key inside properties', async () => {
		const { ctx } = executeContext([{}], [{ body: { data: {} } }]);
		await expect(
			call(ctx, 'upsertContact', {
				body: { email_address: 'a@b.co', properties: { anything: 1 } },
			}),
		).resolves.toBeTruthy();
	});
});

describe('request', () => {
	it('returns data, and null for an empty 204', async () => {
		const { ctx } = executeContext([{}], [{ body: { data: { id: 'con_1' } } }, { status: 204 }]);
		expect(await request(ctx, 'getContact', { params: { id: 'con_1' } })).toEqual({ id: 'con_1' });
		expect(await request(ctx, 'eraseContact', { params: { id: 'con_1' } })).toBeNull();
	});

	it('turns a proxy error page into an error with its status', async () => {
		const { ctx } = executeContext([{}], [{ status: 502, body: '<html>Bad gateway</html>' }]);
		await expect(request(ctx, 'listLists')).rejects.toMatchObject({
			httpCode: '502',
			message: 'EmailFig answered HTTP 502.',
		});
	});
});

describe('paginate', () => {
	it('follows next_cursor to the end at 100 a page', async () => {
		const { ctx, sent } = executeContext(
			[{}],
			[
				{ body: { data: [{ id: 'con_1' }], meta: { next_cursor: 'c2' } } },
				{ body: { data: [{ id: 'con_2' }], meta: { next_cursor: null } } },
			],
		);
		expect(await paginate(ctx, 'listContacts', { tag: 'vip' }, undefined, 0)).toEqual([
			{ id: 'con_1' },
			{ id: 'con_2' },
		]);
		expect(sent.map((s) => s.qs)).toEqual([
			{ tag: 'vip', per_page: 100 },
			{ tag: 'vip', per_page: 100, cursor: 'c2' },
		]);
	});

	it('stops at the limit and asks for no more than it needs', async () => {
		const { ctx, sent } = executeContext(
			[{}],
			[{ body: { data: [{ id: 'con_1' }, { id: 'con_2' }], meta: { next_cursor: 'c2' } } }],
		);
		expect(await paginate(ctx, 'listContacts', {}, 2, 0)).toHaveLength(2);
		expect(sent[0].qs).toEqual({ per_page: 2 });
	});

	it('names how far it got when the rate limit stops it', async () => {
		const { ctx } = executeContext(
			[{}],
			[
				{ body: { data: [{ id: 'con_1' }], meta: { next_cursor: 'c2' } } },
				{ status: 429, body: { title: 'Too many requests' } },
			],
		);
		await expect(paginate(ctx, 'listContacts', {}, undefined, 0)).rejects.toThrow(
			"Hit EmailFig's rate limit after 1 contacts. For large accounts, use the Updated Since filter to fetch only what changed since your last run.",
		);
	});
});

describe('findContactByEmail', () => {
	it('makes no request for a blank or whitespace email', async () => {
		const { ctx, sent } = executeContext([{}], []);
		expect(await findContactByEmail(ctx, '   ', {})).toBeNull();
		expect(sent).toHaveLength(0);
	});

	it('asks for one exact match, deleted included on request', async () => {
		const { ctx, sent } = executeContext([{}], [{ body: { data: [{ id: 'con_1' }] } }]);
		expect(await findContactByEmail(ctx, 'a+b@example.com', { includeDeleted: true })).toEqual({
			id: 'con_1',
		});
		expect(sent[0].qs).toEqual({ email: 'a+b@example.com', per_page: 1, include_deleted: true });
	});
});

describe('compact', () => {
	it('drops blanks at the top level and inside nested objects', () => {
		expect(
			compact({
				email_address: 'a@b.co',
				first_name: '',
				last_name: '  ',
				tags: [],
				properties: { plan: '', seats: 3 },
				consent: { ip: '', at: undefined },
			}),
		).toEqual({ email_address: 'a@b.co', properties: { seats: 3 } });
	});

	it('keeps a date object whole, so it serializes as ISO 8601', () => {
		class Stamp {
			toJSON() {
				return '2026-09-30T12:00:00.000Z';
			}
		}
		const body = compact({ consent: { ip: '1.2.3.4', at: new Stamp() as unknown as string } });
		expect(JSON.parse(JSON.stringify(body))).toEqual({
			consent: { ip: '1.2.3.4', at: '2026-09-30T12:00:00.000Z' },
		});
	});
});

describe('isPrefixedId', () => {
	it('matches the whole id with its own prefix only', () => {
		expect(isPrefixedId('con_0abc123XYZ', 'con')).toBe(true);
		for (const bad of ['', '.', 'lst_abc', 'con_', 'con_abc/..', 'con_abc?x=1', undefined]) {
			expect(isPrefixedId(bad, 'con')).toBe(false);
		}
	});
});
