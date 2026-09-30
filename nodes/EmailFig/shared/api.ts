import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
} from 'n8n-workflow';

import { apiError, type ErrorOptions } from './errors';
import routes from './routes.json';

export type Context = IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions;
export type RouteName = keyof typeof routes;

export interface ApiRequest {
	params?: Record<string, string>;
	qs?: IDataObject;
	body?: IDataObject;
}

export interface ApiResponse {
	statusCode: number;
	body: unknown;
}

interface Route {
	method: string;
	path: string;
	query?: string[];
	body?: string[];
}

const CREDENTIAL = 'emailFigApi';

export const isObject = (value: unknown): value is IDataObject =>
	!!value && typeof value === 'object' && !Array.isArray(value);

export function isBlank(value: unknown): boolean {
	if (value === undefined || value === null) return true;
	if (typeof value === 'string') return value.trim() === '';
	return Array.isArray(value) && value.length === 0;
}

// Only plain objects are nested fields; an expression can hand back a Luxon
// DateTime, which must reach JSON.stringify whole to serialize as ISO 8601.
const isPlainObject = (value: unknown): value is IDataObject =>
	isObject(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

export function compact(body: IDataObject): IDataObject {
	const out: IDataObject = {};
	for (const [key, value] of Object.entries(body)) {
		if (isPlainObject(value)) {
			const inner = compact(value);
			if (Object.keys(inner).length > 0) out[key] = inner;
		} else if (!isBlank(value)) {
			out[key] = value;
		}
	}
	return out;
}

export type IdPrefix = 'con' | 'lst' | 'tag' | 'frm';

export const idRegex = (prefix: IdPrefix) => `^${prefix}_[A-Za-z0-9]+$`;

export function isPrefixedId(value: unknown, prefix: IdPrefix): value is string {
	return typeof value === 'string' && new RegExp(idRegex(prefix)).test(value);
}

// A resource locator arrives as { __rl, mode, value } from a collection and as a
// bare value when read with extractValue.
export function locatorValue(value: unknown): unknown {
	return isObject(value) && 'value' in value ? value.value : value;
}

// Nested objects are checked a level down (consent.ip); properties holds the
// account's own custom field keys, so only the key itself is declared.
function sentKeys(body: IDataObject): string[] {
	return Object.entries(body).flatMap(([key, value]) =>
		isObject(value) && key !== 'properties'
			? Object.keys(value).map((inner) => `${key}.${inner}`)
			: [key],
	);
}

function assertDeclared(
	name: string,
	kind: 'query' | 'body',
	sent: string[],
	declared: string[] = [],
) {
	const extra = sent.find((key) => !declared.includes(key));
	if (extra) throw new Error(`${name} does not declare ${kind} key ${extra}`);
}

// Every request goes through a route in routes.json and throws on a query or
// body key the route doesn't list, so that file is the full list of what this
// node sends, and EmailFig checks it against its API spec.
export async function call(
	ctx: Context,
	name: RouteName,
	{ params = {}, qs, body }: ApiRequest = {},
): Promise<ApiResponse> {
	const route: Route = routes[name];
	assertDeclared(name, 'query', Object.keys(qs ?? {}), route.query);
	assertDeclared(name, 'body', sentKeys(body ?? {}), route.body);
	const path = route.path.replace(/\{(\w+)\}/g, (_, key: string) => {
		if (params[key] === undefined) throw new Error(`${name} needs ${key}`);
		return encodeURIComponent(params[key]);
	});
	const credentials = await ctx.getCredentials(CREDENTIAL);
	const baseUrl = String(credentials.baseUrl).replace(/\/+$/, '');
	const response = await ctx.helpers.httpRequestWithAuthentication.call(ctx, CREDENTIAL, {
		method: route.method as IHttpRequestMethods,
		url: `${baseUrl}${path}`,
		qs,
		body,
		json: true,
		ignoreHttpStatusErrors: true,
		returnFullResponse: true,
	});
	return { statusCode: response.statusCode, body: response.body };
}

export async function request<T = IDataObject>(
	ctx: Context,
	name: RouteName,
	req: ApiRequest = {},
	options: ErrorOptions = {},
): Promise<T> {
	const response = await call(ctx, name, req);
	if (response.statusCode >= 300) throw apiError(ctx, response, options);
	return (isObject(response.body) && 'data' in response.body ? response.body.data : null) as T;
}

export async function paginate(
	ctx: IExecuteFunctions,
	name: 'listContacts' | 'listTags',
	qs: IDataObject,
	limit: number | undefined,
	itemIndex: number,
): Promise<IDataObject[]> {
	const items: IDataObject[] = [];
	let cursor: string | undefined;
	do {
		const perPage = limit === undefined ? 100 : Math.min(100, limit - items.length);
		const response = await call(ctx, name, {
			qs: { ...qs, per_page: perPage, ...(cursor ? { cursor } : {}) },
		});
		if (response.statusCode === 429 && items.length > 0) {
			const noun = name === 'listContacts' ? 'contacts' : 'tags';
			throw apiError(ctx, response, {
				itemIndex,
				message: `Hit EmailFig's rate limit after ${items.length} ${noun}. For large accounts, use the Updated Since filter to fetch only what changed since your last run.`,
			});
		}
		if (response.statusCode >= 300) throw apiError(ctx, response, { itemIndex });
		const page = response.body as { data: IDataObject[]; meta?: { next_cursor?: string | null } };
		items.push(...page.data);
		cursor = page.meta?.next_cursor ?? undefined;
	} while (cursor && (limit === undefined || items.length < limit));
	return limit === undefined ? items : items.slice(0, limit);
}

// A blank email never reaches the API: the server matches nothing for it, but
// a request would still spend one of the key's 300 per 5 minutes.
export async function findContactByEmail(
	ctx: Context,
	email: string,
	{ includeDeleted = false, itemIndex }: { includeDeleted?: boolean; itemIndex?: number },
): Promise<IDataObject | null> {
	if (isBlank(email)) return null;
	const qs: IDataObject = {
		email,
		per_page: 1,
		...(includeDeleted ? { include_deleted: true } : {}),
	};
	const contacts = await request<IDataObject[]>(ctx, 'listContacts', { qs }, { itemIndex });
	return contacts[0] ?? null;
}
