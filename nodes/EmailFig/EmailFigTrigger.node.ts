import {
	NodeConnectionTypes,
	type IDataObject,
	type IHookFunctions,
	type INodeProperties,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
} from 'n8n-workflow';

import {
	call,
	isBlank,
	locatorValue,
	request,
	type ApiResponse,
	type IdPrefix,
} from './shared/api';
import { apiError, hasFieldError, problemMessage, problemOf } from './shared/errors';
import { EVENT_OPTIONS, SUBJECT_EVENTS, matchingEvents, type Filters } from './shared/events';
import { searchForms, searchLists, searchTagIds } from './shared/methods';
import { idValidation } from './shared/properties';
import { verifySignature } from './shared/signature';

const LIMIT_REACHED =
	'Your EmailFig account has reached its limit of 20 integration webhooks, and each active EmailFig Trigger uses one. Delete the ones you no longer need in EmailFig under Settings > Webhooks.';
const URL_REFUSED =
	"It only sends to public HTTPS addresses on port 443, so set n8n's WEBHOOK_URL to one; a tunnel works for testing.";

function filter(
	name: 'list' | 'tag' | 'form',
	searchListMethod: string,
	prefix: IdPrefix,
): INodeProperties {
	const noun = name.charAt(0).toUpperCase() + name.slice(1);
	return {
		displayName: noun,
		name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		description: `Only events for this ${name}. Leave empty for any ${name}.`,
		displayOptions: { show: { events: SUBJECT_EVENTS[name] } },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod, searchable: true },
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				placeholder: `${prefix}_...`,
				validation: idValidation(prefix, noun),
			},
		],
	};
}

const selectedEvents = (ctx: IHookFunctions | IWebhookFunctions) =>
	ctx.getNodeParameter('events') as string[];

const sameSet = (a: unknown, b: string[]) =>
	Array.isArray(a) && a.length === b.length && b.every((type) => a.includes(type));

async function deleteEndpoint(ctx: IHookFunctions, id: string): Promise<void> {
	const response = await call(ctx, 'deleteWebhook', { params: { id } });
	// 404: EmailFig already removed it. 401: revoking the key removed its webhooks.
	if (response.statusCode < 300 || response.statusCode === 404 || response.statusCode === 401)
		return;
	throw apiError(ctx, response);
}

function forget(data: IDataObject) {
	delete data.webhookId;
	delete data.webhookSecret;
}

function createError(ctx: IHookFunctions, response: ApiResponse) {
	const problem = problemOf(response.body);
	if (response.statusCode === 422 && hasFieldError(problem, null, 'limit_reached')) {
		return apiError(ctx, response, { message: LIMIT_REACHED });
	}
	if (response.statusCode === 422 && hasFieldError(problem, 'url')) {
		return apiError(ctx, response, {
			message: `EmailFig refused this webhook address (${problemMessage(problem, 422)}). ${URL_REFUSED}`,
		});
	}
	return apiError(ctx, response);
}

export class EmailFigTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'EmailFig Trigger',
		name: 'emailFigTrigger',
		icon: { light: 'file:../../icons/emailfig.svg', dark: 'file:../../icons/emailfig.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts a workflow when something happens in EmailFig',
		defaults: { name: 'EmailFig Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'emailFigApi', required: true }],
		webhooks: [
			{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' },
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: [],
				options: EVENT_OPTIONS,
			},
			filter('list', 'searchLists', 'lst'),
			filter('tag', 'searchTagIds', 'tag'),
			filter('form', 'searchForms', 'frm'),
		],
	};

	methods = { listSearch: { searchLists, searchTagIds, searchForms } };

	webhookMethods = {
		default: {
			// Runs on every activation and every n8n restart. Repairs a matching
			// endpoint by PATCH, keeping its delivery log; deletes one whose secret
			// this node doesn't hold (say, from a create whose response was lost)
			// so create makes a fresh one.
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				const url = this.getNodeWebhookUrl('default');
				const endpoint = (await request<IDataObject[]>(this, 'listWebhooks')).find(
					(e) => e.url === url,
				);
				if (!endpoint) {
					forget(data);
					return false;
				}
				if (endpoint.id !== data.webhookId || typeof data.webhookSecret !== 'string') {
					await deleteEndpoint(this, String(endpoint.id));
					forget(data);
					return false;
				}
				const events = selectedEvents(this);
				if (!sameSet(endpoint.event_types, events) || endpoint.enabled !== true) {
					await request(this, 'updateWebhook', {
						params: { id: String(endpoint.id) },
						body: { event_types: events, enabled: true },
					});
				}
				return true;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const body = {
					url: this.getNodeWebhookUrl('default'),
					event_types: selectedEvents(this),
					description: `n8n: ${this.getWorkflow().name ?? 'workflow'}`.slice(0, 255),
				};
				const response = await call(this, 'createWebhook', { body });
				if (response.statusCode >= 300) throw createError(this, response);
				const endpoint = (response.body as { data: IDataObject }).data;
				const data = this.getWorkflowStaticData('node');
				data.webhookId = endpoint.id;
				data.webhookSecret = endpoint.secret;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (typeof data.webhookId === 'string') await deleteEndpoint(this, data.webhookId);
				forget(data);
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const data = this.getWorkflowStaticData('node');
		const valid = verifySignature(
			data.webhookSecret,
			this.getHeaderData() as IDataObject,
			this.getRequestObject().rawBody,
			Date.now(),
		);
		if (!valid) {
			this.getResponseObject().status(401).json({ error: 'Invalid signature' });
			return { noWebhookResponse: true };
		}

		const filters: Filters = {};
		for (const name of ['list', 'tag', 'form'] as const) {
			const value = locatorValue(this.getNodeParameter(name, ''));
			if (!isBlank(value)) filters[name] = String(value);
		}
		const events = matchingEvents(this.getBodyData(), selectedEvents(this), filters);
		return events.length ? { workflowData: [this.helpers.returnJsonArray(events)] } : {};
	}
}
