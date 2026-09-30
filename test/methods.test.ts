import { describe, expect, it } from 'vitest';

import {
	getCustomFields,
	searchLists,
	searchTagIds,
	searchTagNames,
} from '../nodes/EmailFig/shared/methods';
import { loadOptionsContext } from './fake';

describe('list search', () => {
	it('filters lists by name, case-insensitively, valued by id', async () => {
		const { ctx } = loadOptionsContext([
			{
				body: {
					data: [
						{ id: 'lst_1', name: 'Newsletter' },
						{ id: 'lst_2', name: 'Beta' },
					],
				},
			},
		]);
		expect(await searchLists.call(ctx, 'news')).toEqual({
			results: [{ name: 'Newsletter', value: 'lst_1' }],
		});
	});

	it('pages tags by cursor and values them by id or by name', async () => {
		const page = { body: { data: [{ id: 'tag_1', name: 'vip' }], meta: { next_cursor: 'c2' } } };
		const byId = loadOptionsContext([page]);
		expect(await searchTagIds.call(byId.ctx)).toEqual({
			results: [{ name: 'vip', value: 'tag_1' }],
			paginationToken: 'c2',
		});
		const byName = loadOptionsContext([page]);
		expect(await searchTagNames.call(byName.ctx, undefined, 'c1')).toEqual({
			results: [{ name: 'vip', value: 'vip' }],
			paginationToken: 'c2',
		});
		expect(byName.sent[0].qs).toEqual({ per_page: 100, cursor: 'c1' });
	});
});

describe('getCustomFields', () => {
	it('offers each field by label, valued by key', async () => {
		const { ctx } = loadOptionsContext([
			{ body: { data: [{ id: 'cf_1', key: 'plan', label: 'Plan', field_type: 'text' }] } },
		]);
		expect(await getCustomFields.call(ctx)).toEqual([
			{ name: 'Plan', value: 'plan', description: 'plan (text)' },
		]);
	});
});
