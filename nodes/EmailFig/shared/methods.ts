import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
} from 'n8n-workflow';

import { call, request } from './api';
import { apiError } from './errors';

function byName(records: IDataObject[], filter?: string): IDataObject[] {
	const wanted = filter?.trim().toLowerCase();
	return wanted ? records.filter((r) => String(r.name).toLowerCase().includes(wanted)) : records;
}

async function searchAll(
	ctx: ILoadOptionsFunctions,
	route: 'listLists' | 'listForms',
	filter?: string,
): Promise<INodeListSearchResult> {
	const records = await request<IDataObject[]>(ctx, route);
	return {
		results: byName(records, filter).map((r) => ({ name: String(r.name), value: String(r.id) })),
	};
}

// /tags pages by name with no search, so the filter narrows one page at a time.
async function searchTags(
	ctx: ILoadOptionsFunctions,
	valueKey: 'id' | 'name',
	filter?: string,
	token?: string,
): Promise<INodeListSearchResult> {
	const response = await call(ctx, 'listTags', {
		qs: { per_page: 100, ...(token ? { cursor: token } : {}) },
	});
	if (response.statusCode >= 300) throw apiError(ctx, response);
	const page = response.body as { data: IDataObject[]; meta?: { next_cursor?: string | null } };
	return {
		results: byName(page.data, filter).map((t) => ({
			name: String(t.name),
			value: String(t[valueKey]),
		})),
		paginationToken: page.meta?.next_cursor ?? undefined,
	};
}

export async function searchLists(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	return await searchAll(this, 'listLists', filter);
}

export async function searchForms(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	return await searchAll(this, 'listForms', filter);
}

export async function searchTagIds(
	this: ILoadOptionsFunctions,
	filter?: string,
	token?: string,
): Promise<INodeListSearchResult> {
	return await searchTags(this, 'id', filter, token);
}

export async function searchTagNames(
	this: ILoadOptionsFunctions,
	filter?: string,
	token?: string,
): Promise<INodeListSearchResult> {
	return await searchTags(this, 'name', filter, token);
}

export async function getCustomFields(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const fields = await request<IDataObject[]>(this, 'listCustomFields');
	return fields.map((f) => ({
		name: String(f.label),
		value: String(f.key),
		description: `${f.key} (${f.field_type})`,
	}));
}
