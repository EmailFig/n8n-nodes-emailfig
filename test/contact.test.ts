import type { IDataObject } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { contactOperation } from '../nodes/EmailFig/resources/contact';
import { BASE, executeContext, type Reply } from './fake';

const byEmail = (value: string) => ({ __rl: true, mode: 'email', value });
const byId = (value: string) => ({ __rl: true, mode: 'id', value });
const list = (value: string) => ({ __rl: true, mode: 'list', value });
const contact = {
	id: 'con_1',
	email_address: 'a@b.co',
	status: 'subscribed',
	lists: [],
	tags: [],
	updated_at: 't',
	deleted_at: null,
};
const found: Reply = { body: { data: [contact] } };
const none: Reply = { body: { data: [] } };

async function run(params: IDataObject, replies: Reply[]) {
	const { ctx, sent } = executeContext([params], replies);
	const result = await contactOperation.call(ctx, String(params.operation), 0);
	return { result, sent };
}

async function fails(params: IDataObject, replies: Reply[], message: string) {
	const { ctx, sent } = executeContext([params], replies);
	await expect(contactOperation.call(ctx, String(params.operation), 0)).rejects.toThrow(message);
	return sent;
}

describe('Create or Update', () => {
	it('upserts without a list, dropping blank fields', async () => {
		const { sent } = await run(
			{
				operation: 'upsert',
				email: 'a@b.co',
				additionalFields: {
					firstName: '',
					lastName: 'Lee',
					tags: 'vip, , new',
					customFields: {
						field: [
							{ key: 'plan', value: '' },
							{ key: 'seats', value: '3' },
						],
					},
					consentIp: '1.2.3.4',
				},
			},
			[{ body: { data: contact } }],
		);
		expect(sent[0]).toEqual({
			method: 'POST',
			url: `${BASE}/contacts`,
			qs: undefined,
			body: {
				email_address: 'a@b.co',
				last_name: 'Lee',
				tags: ['vip', 'new'],
				properties: { seats: '3' },
			},
		});
	});

	it('joins the chosen list with consent', async () => {
		const { sent } = await run(
			{
				operation: 'upsert',
				email: 'a@b.co',
				additionalFields: {
					list: list('lst_1'),
					consentIp: '1.2.3.4',
					consentAt: '2026-09-29T10:00:00Z',
				},
			},
			[{ body: { data: contact } }],
		);
		expect(sent[0]).toMatchObject({
			method: 'POST',
			url: `${BASE}/lists/lst_1/contacts`,
			body: { email_address: 'a@b.co', consent: { ip: '1.2.3.4', at: '2026-09-29T10:00:00Z' } },
		});
	});

	it('refuses an added list that is not a list id, without a request', async () => {
		const sent = await fails(
			{ operation: 'upsert', email: 'a@b.co', additionalFields: { list: list('') } },
			[],
			'List not found',
		);
		expect(sent).toHaveLength(0);
	});
});

describe('Get', () => {
	it('by email returns the lookup itself, unchanged', async () => {
		const { result, sent } = await run({ operation: 'get', contact: byEmail('a@b.co') }, [found]);
		expect(result).toEqual(contact);
		expect(sent).toHaveLength(1);
	});

	it('by ID makes one request', async () => {
		const { sent } = await run({ operation: 'get', contact: byId('con_1') }, [
			{ body: { data: contact } },
		]);
		expect(sent[0].url).toBe(`${BASE}/contacts/con_1`);
	});

	it('is an error when not found', async () => {
		await fails(
			{ operation: 'get', contact: byEmail('x@b.co') },
			[none],
			'No contact with that email',
		);
		await fails(
			{ operation: 'get', contact: byId('con_9') },
			[{ status: 404, body: { title: 'Not found' } }],
			'No contact with that ID',
		);
	});

	it('refuses a blank or malformed ID without a request', async () => {
		for (const value of ['', '.', 'lst_1', 'con_1/..']) {
			expect(
				await fails({ operation: 'get', contact: byId(value) }, [], 'No contact with that ID'),
			).toHaveLength(0);
		}
		expect(
			await fails({ operation: 'get', contact: byEmail('  ') }, [], 'No contact with that email'),
		).toHaveLength(0);
	});
});

describe('Get Many', () => {
	it('sends a tag filter as tag=<name>, never tag_id', async () => {
		const { sent } = await run(
			{
				operation: 'getAll',
				returnAll: false,
				limit: 50,
				filters: { tag: { __rl: true, mode: 'list', value: 'vip' } },
			},
			[{ body: { data: [contact], meta: { next_cursor: null } } }],
		);
		expect(sent[0].qs).toEqual({ tag: 'vip', per_page: 50 });
	});

	it('resolves a list filter first, so a deleted list is not found', async () => {
		const sent = await fails(
			{ operation: 'getAll', returnAll: true, filters: { list: list('lst_gone') } },
			[{ status: 404, body: { title: 'Not found' } }],
			'List not found',
		);
		expect(sent.map((s) => s.url)).toEqual([`${BASE}/lists/lst_gone`]);
	});

	it('returns nothing, with no request, for any added filter that is blank', async () => {
		for (const filters of [
			{ email: ' ' },
			{ list: list('') },
			{ tag: { __rl: true, mode: 'name', value: '  ' } },
		]) {
			const { result, sent } = await run({ operation: 'getAll', returnAll: true, filters }, []);
			expect(result).toEqual([]);
			expect(sent).toHaveLength(0);
		}
	});

	it('passes updated since and include deleted through', async () => {
		const { sent } = await run(
			{
				operation: 'getAll',
				returnAll: true,
				filters: { email: 'a@b.co', updatedSince: '2026-09-01T00:00:00Z', includeDeleted: true },
			},
			[{ body: { data: [], meta: { next_cursor: null } } }],
		);
		expect(sent[0].qs).toEqual({
			email: 'a@b.co',
			updated_since: '2026-09-01T00:00:00Z',
			include_deleted: true,
			per_page: 100,
		});
	});
});

describe('Update', () => {
	it('finds by email, then patches only the filled fields', async () => {
		const { sent } = await run(
			{
				operation: 'update',
				contact: byEmail('a@b.co'),
				updateFields: {
					email: 'new@b.co',
					firstName: '',
					customFields: { field: [{ key: 'plan', value: 'pro' }] },
				},
			},
			[found, { body: { data: contact } }],
		);
		expect(sent[1]).toMatchObject({
			method: 'PATCH',
			url: `${BASE}/contacts/con_1`,
			body: { email_address: 'new@b.co', properties: { plan: 'pro' } },
		});
	});

	it('names a taken address', async () => {
		await fails(
			{ operation: 'update', contact: byId('con_1'), updateFields: { email: 'taken@b.co' } },
			[
				{
					status: 422,
					body: {
						errors: [
							{ field: 'email_address', code: 'contact_exists', message: 'has already been taken' },
						],
					},
				},
			],
			'Another contact already has that email address.',
		);
	});
});

describe('Erase', () => {
	it('by email finds deleted contacts too and returns deleted: true', async () => {
		const { result, sent } = await run({ operation: 'erase', contact: byEmail('a@b.co') }, [
			found,
			{ status: 204 },
		]);
		expect(sent[0].qs).toMatchObject({ include_deleted: true });
		expect(sent[1]).toMatchObject({ method: 'DELETE', url: `${BASE}/contacts/con_1` });
		expect(result).toEqual({ deleted: true });
	});

	it('by ID deletes directly, reaching a soft-deleted contact', async () => {
		const { sent } = await run({ operation: 'erase', contact: byId('con_1') }, [{ status: 204 }]);
		expect(sent).toHaveLength(1);
	});
});

describe('Unsubscribe', () => {
	it('opts the address out in one call', async () => {
		const { result, sent } = await run({ operation: 'unsubscribe', email: 'a@b.co' }, [
			{ body: { data: { email_address: 'a@b.co', contact: null } } },
		]);
		expect(sent[0]).toMatchObject({
			method: 'POST',
			url: `${BASE}/contacts/unsubscribe`,
			body: { email_address: 'a@b.co' },
		});
		expect(result).toEqual({ email_address: 'a@b.co', contact: null });
	});
});

describe('lists and tags', () => {
	it('adds to a list', async () => {
		const { sent } = await run(
			{ operation: 'addToList', email: 'a@b.co', list: list('lst_1'), additionalFields: {} },
			[{ body: { data: contact } }],
		);
		expect(sent[0]).toMatchObject({
			url: `${BASE}/lists/lst_1/contacts`,
			body: { email_address: 'a@b.co' },
		});
	});

	it('removes from a list, naming either missing record', async () => {
		const { result } = await run(
			{ operation: 'removeFromList', list: list('lst_1'), contact: byId('con_1') },
			[{ status: 204 }],
		);
		expect(result).toEqual({ success: true });
		await fails(
			{ operation: 'removeFromList', list: list('lst_1'), contact: byId('con_1') },
			[{ status: 404, body: { title: 'Not found' } }],
			'List or contact not found',
		);
	});

	it('adds and removes several tags in one call each', async () => {
		const add = await run({ operation: 'addTags', contact: byEmail('a@b.co'), tags: 'vip, beta' }, [
			found,
			{ body: { data: contact } },
		]);
		expect(add.sent[1]).toMatchObject({
			method: 'POST',
			url: `${BASE}/contacts/con_1/tags`,
			body: { tags: ['vip', 'beta'] },
		});
		const remove = await run(
			{ operation: 'removeTags', contact: byId('con_1'), tags: 'a/b, 50%' },
			[{ body: { data: contact } }],
		);
		expect(remove.sent[0]).toMatchObject({
			method: 'DELETE',
			url: `${BASE}/contacts/con_1/tags`,
			body: { tags: ['a/b', '50%'] },
		});
	});

	it('refuses an empty tag list without a request', async () => {
		expect(
			await fails(
				{ operation: 'addTags', contact: byId('con_1'), tags: ' , ' },
				[],
				'Enter at least one tag name',
			),
		).toHaveLength(0);
	});
});
