import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INode,
	IWebhookFunctions,
} from 'n8n-workflow';

export interface Sent {
	method: string;
	url: string;
	qs?: IDataObject;
	body?: unknown;
}

export interface Reply {
	status?: number;
	body?: unknown;
}

export const BASE = 'https://emailfig.test/api/v1';

export const NODE: INode = {
	id: 'node-1',
	name: 'EmailFig',
	type: '@emailfig/n8n-nodes-emailfig.emailFig',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

// Replies are consumed in order; a request with none left fails the test, so
// every test states exactly which calls it expects.
export function http(replies: Reply[]) {
	const sent: Sent[] = [];
	const queue = [...replies];
	const request = async (credential: string, options: IHttpRequestOptions) => {
		if (credential !== 'emailFigApi') throw new Error(`unexpected credential ${credential}`);
		sent.push({
			method: String(options.method),
			url: String(options.url),
			qs: options.qs,
			body: options.body,
		});
		const reply = queue.shift();
		if (!reply) throw new Error(`unexpected request ${options.method} ${options.url}`);
		return { statusCode: reply.status ?? 200, body: reply.body ?? '', headers: {} };
	};
	return { sent, request };
}

function parameter(
	values: IDataObject,
	name: string,
	fallback: unknown,
	options?: { extractValue?: boolean },
) {
	const value = name in values ? values[name] : fallback;
	if (value === undefined) throw new Error(`no parameter ${name}`);
	if (options?.extractValue && value && typeof value === 'object' && 'value' in value) {
		return (value as IDataObject).value;
	}
	return value;
}

function helpers(request: ReturnType<typeof http>['request']) {
	return {
		httpRequestWithAuthentication: async function (
			this: unknown,
			credential: string,
			options: IHttpRequestOptions,
		) {
			return await request(credential, options);
		},
		returnJsonArray: (data: IDataObject | IDataObject[]) =>
			(Array.isArray(data) ? data : [data]).map((json) => ({ json })),
		constructExecutionMetaData: (
			items: Array<{ json: IDataObject }>,
			{ itemData }: { itemData: { item: number } },
		) => items.map((item) => ({ ...item, pairedItem: itemData })),
	};
}

const credentials = async () => ({ apiKey: 'key', baseUrl: BASE });

export function executeContext(
	items: IDataObject[],
	replies: Reply[],
	options: { continueOnFail?: boolean } = {},
) {
	const server = http(replies);
	const ctx = {
		getInputData: () => items.map(() => ({ json: {} })),
		getNodeParameter: (
			name: string,
			i: number,
			fallback?: unknown,
			opts?: { extractValue?: boolean },
		) => parameter(items[i], name, fallback, opts),
		getCredentials: credentials,
		getNode: () => NODE,
		continueOnFail: () => options.continueOnFail ?? false,
		helpers: helpers(server.request),
	} as unknown as IExecuteFunctions;
	return { ctx, ...server };
}

export function loadOptionsContext(replies: Reply[]) {
	const server = http(replies);
	const ctx = {
		getCredentials: credentials,
		getNode: () => NODE,
		helpers: helpers(server.request),
	} as unknown as ILoadOptionsFunctions;
	return { ctx, ...server };
}

export const WEBHOOK_URL = 'https://n8n.example.com/webhook/abc-123/webhook';

export function hookContext(params: IDataObject, replies: Reply[], staticData: IDataObject = {}) {
	const server = http(replies);
	const ctx = {
		getNodeParameter: (name: string, fallback?: unknown) => parameter(params, name, fallback),
		getNodeWebhookUrl: () => WEBHOOK_URL,
		getWorkflowStaticData: () => staticData,
		getWorkflow: () => ({ id: 'wf-1', name: 'Welcome series', active: true }),
		getCredentials: credentials,
		getNode: () => NODE,
		helpers: helpers(server.request),
	} as unknown as IHookFunctions;
	return { ctx, staticData, ...server };
}

export function webhookContext(options: {
	params: IDataObject;
	body: unknown;
	rawBody?: Buffer;
	headers?: IDataObject;
	staticData?: IDataObject;
}) {
	const response = { statusCode: 200, sent: undefined as unknown };
	const res = {
		status(code: number) {
			response.statusCode = code;
			return res;
		},
		json(payload: unknown) {
			response.sent = payload;
			return res;
		},
	};
	const ctx = {
		getNodeParameter: (name: string, fallback?: unknown, opts?: { extractValue?: boolean }) =>
			parameter(options.params, name, fallback, opts),
		getWorkflowStaticData: () => options.staticData ?? {},
		getHeaderData: () => options.headers ?? {},
		getRequestObject: () => ({ rawBody: options.rawBody }),
		getResponseObject: () => res,
		getBodyData: () => options.body,
		getNode: () => NODE,
		helpers: helpers(http([]).request),
	} as unknown as IWebhookFunctions;
	return { ctx, response };
}
