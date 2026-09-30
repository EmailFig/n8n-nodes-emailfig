import { describe, expect, it } from 'vitest';

import { EmailFig } from '../nodes/EmailFig/EmailFig.node';
import { executeContext } from './fake';

const node = new EmailFig();
const get = (value: string) => ({
	resource: 'contact',
	operation: 'get',
	contact: { __rl: true, mode: 'email', value },
});

describe('execute', () => {
	it('pairs every output with its input item', async () => {
		const { ctx } = executeContext(
			[get('a@b.co'), get('c@d.co')],
			[{ body: { data: [{ id: 'con_1' }] } }, { body: { data: [{ id: 'con_2' }] } }],
		);
		const [out] = await node.execute.call(ctx);
		expect(out.map((o) => [o.json.id, o.pairedItem])).toEqual([
			['con_1', { item: 0 }],
			['con_2', { item: 1 }],
		]);
	});

	it('turns only the failing item into an error item with Continue On Fail', async () => {
		const { ctx } = executeContext(
			[get('a@b.co'), get('missing@b.co'), get('c@d.co')],
			[
				{ body: { data: [{ id: 'con_1' }] } },
				{ body: { data: [] } },
				{ body: { data: [{ id: 'con_3' }] } },
			],
			{ continueOnFail: true },
		);
		const [out] = await node.execute.call(ctx);
		expect(out.map((o) => o.json)).toEqual([
			{ id: 'con_1' },
			{ error: 'No contact with that email' },
			{ id: 'con_3' },
		]);
		expect(out[1].pairedItem).toEqual({ item: 1 });
	});

	it('throws on the first failure without Continue On Fail', async () => {
		const { ctx } = executeContext([get('missing@b.co')], [{ body: { data: [] } }]);
		await expect(node.execute.call(ctx)).rejects.toThrow('No contact with that email');
	});

	it('rethrows an API error with its HTTP code', async () => {
		const { ctx } = executeContext([get('a@b.co')], [{ status: 401, body: {} }]);
		await expect(node.execute.call(ctx)).rejects.toMatchObject({
			httpCode: '401',
			message: 'The EmailFig API key is invalid or has been revoked.',
		});
	});

	it('lists lists and tags', async () => {
		const lists = executeContext(
			[{ resource: 'list', operation: 'getAll', returnAll: false, limit: 1 }],
			[{ body: { data: [{ id: 'lst_1' }, { id: 'lst_2' }] } }],
		);
		expect((await node.execute.call(lists.ctx))[0].map((o) => o.json.id)).toEqual(['lst_1']);
		const tags = executeContext(
			[{ resource: 'tag', operation: 'getAll', returnAll: true }],
			[{ body: { data: [{ id: 'tag_1' }], meta: { next_cursor: null } } }],
		);
		expect((await node.execute.call(tags.ctx))[0].map((o) => o.json.id)).toEqual(['tag_1']);
	});
});
