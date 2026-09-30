import { NodeApiError, type INode, type JsonObject } from 'n8n-workflow';

export interface Problem {
	type?: string;
	title?: string;
	detail?: string;
	errors?: Array<{ field?: string; code?: string; message?: string }>;
}

export interface ErrorOptions {
	itemIndex?: number;
	notFound?: string;
	message?: string;
}

export const INVALID_KEY = 'The EmailFig API key is invalid or has been revoked.';

export const RATE_LIMITED =
	'EmailFig allows 300 requests every 5 minutes per API key. Slow the workflow down with Loop Over Items and a Wait node, or try again in 5 minutes.';

export function problemOf(body: unknown): Problem {
	if (typeof body === 'string') {
		try {
			return problemOf(JSON.parse(body));
		} catch {
			return {};
		}
	}
	return body && typeof body === 'object' && !Array.isArray(body) ? (body as Problem) : {};
}

export function hasFieldError(problem: Problem, field: string | null, code?: string): boolean {
	return (problem.errors ?? []).some(
		(e) => (field === null || e.field === field) && (!code || e.code === code),
	);
}

function fieldLabel(field: string): string {
	if (field === 'url') return 'URL';
	if (field === 'properties') return 'Custom fields';
	if (field.startsWith('properties.')) return field.slice('properties.'.length);
	const words = field.replace(/_/g, ' ');
	return words.charAt(0).toUpperCase() + words.slice(1);
}

export function problemMessage(problem: Problem, status: number): string {
	const first = problem.errors?.[0];
	if (first?.code === 'contact_exists') return 'Another contact already has that email address.';
	if (first?.message) {
		return !first.field || first.field === 'base'
			? first.message
			: `${fieldLabel(first.field)}: ${first.message}`;
	}
	return problem.detail ?? problem.title ?? `EmailFig answered HTTP ${status}.`;
}

// 401, 403, 404 and 429 carry no detail, and a 404's title is generic, so those
// get wording of their own.
export function apiError(
	ctx: { getNode(): INode },
	response: { statusCode: number; body: unknown },
	{ itemIndex, notFound, message }: ErrorOptions = {},
): NodeApiError {
	const problem = problemOf(response.body);
	const status = response.statusCode;
	let text = message;
	if (!text && status === 401) text = INVALID_KEY;
	if (!text && status === 429) text = RATE_LIMITED;
	if (!text && status === 404 && notFound) text = notFound;
	return new NodeApiError(ctx.getNode(), problem as JsonObject, {
		message: text ?? problemMessage(problem, status),
		description: problem.type ? `HTTP ${status}, ${problem.type}` : `HTTP ${status}`,
		httpCode: String(status),
		itemIndex,
	});
}
