import { createHmac } from 'node:crypto';
import type { IDataObject } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { EmailFigTrigger } from '../nodes/EmailFig/EmailFigTrigger.node';
import { hookContext, WEBHOOK_URL, webhookContext } from './fake';

const trigger = new EmailFigTrigger();
const hooks = trigger.webhookMethods.default;
const params = { events: ['contact.created', 'contact.tag_added'] };
const endpoint = (over: IDataObject = {}) => ({
	id: 'whe_1',
	url: WEBHOOK_URL,
	event_types: ['contact.tag_added', 'contact.created'],
	enabled: true,
	...over,
});
const stored = () => ({ webhookId: 'whe_1', webhookSecret: 'whsec_c2VjcmV0' });

describe('checkExists', () => {
	it('reports none, clearing state, when no endpoint has this URL', async () => {
		const { ctx, staticData } = hookContext(params, [{ body: { data: [] } }], stored());
		expect(await hooks.checkExists.call(ctx)).toBe(false);
		expect(staticData).toEqual({});
	});

	it('writes nothing when the endpoint matches, events compared as a set', async () => {
		const { ctx, sent } = hookContext(params, [{ body: { data: [endpoint()] } }], stored());
		expect(await hooks.checkExists.call(ctx)).toBe(true);
		expect(sent).toHaveLength(1);
	});

	it('re-enables a disabled endpoint and updates its events by PATCH, never deleting it', async () => {
		const { ctx, sent } = hookContext(
			params,
			[
				{ body: { data: [endpoint({ enabled: false, event_types: ['contact.created'] })] } },
				{ body: { data: {} } },
			],
			stored(),
		);
		expect(await hooks.checkExists.call(ctx)).toBe(true);
		expect(sent[1]).toMatchObject({
			method: 'PATCH',
			url: expect.stringMatching(/\/webhooks\/whe_1$/),
			body: { event_types: params.events, enabled: true },
		});
	});

	it('replaces an endpoint whose secret this node does not hold', async () => {
		for (const state of [{}, { webhookId: 'whe_other', webhookSecret: 'whsec_x' }]) {
			const { ctx, sent, staticData } = hookContext(
				params,
				[{ body: { data: [endpoint()] } }, { status: 204 }],
				{ ...state },
			);
			expect(await hooks.checkExists.call(ctx)).toBe(false);
			expect(sent[1]).toMatchObject({
				method: 'DELETE',
				url: expect.stringMatching(/\/webhooks\/whe_1$/),
			});
			expect(staticData).toEqual({});
		}
	});
});

describe('create', () => {
	it('subscribes this URL to the selected events and stores the id and secret', async () => {
		const { ctx, sent, staticData } = hookContext(params, [
			{ status: 201, body: { data: { id: 'whe_9', secret: 'whsec_new' } } },
		]);
		expect(await hooks.create.call(ctx)).toBe(true);
		expect(sent[0].body).toEqual({
			url: WEBHOOK_URL,
			event_types: params.events,
			description: 'n8n: Welcome series',
		});
		expect(staticData).toEqual({ webhookId: 'whe_9', webhookSecret: 'whsec_new' });
	});

	it('names the cap and the URL rules', async () => {
		const cap = hookContext(params, [
			{
				status: 422,
				body: { errors: [{ field: 'base', code: 'limit_reached', message: 'limit' }] },
			},
		]);
		await expect(hooks.create.call(cap.ctx)).rejects.toThrow(
			'Your EmailFig account has reached its limit of 20 integration webhooks, and each active EmailFig Trigger uses one. Delete the ones you no longer need in EmailFig under Settings > Webhooks.',
		);
		const url = hookContext(params, [
			{
				status: 422,
				body: { errors: [{ field: 'url', code: 'invalid', message: 'must use https' }] },
			},
		]);
		await expect(hooks.create.call(url.ctx)).rejects.toThrow(
			"EmailFig refused this webhook address (URL: must use https). It only sends to public HTTPS addresses on port 443, so set n8n's WEBHOOK_URL to one; a tunnel works for testing.",
		);
	});
});

describe('delete', () => {
	it('deletes the stored endpoint and clears state; 404 and 401 count as gone', async () => {
		for (const status of [204, 404, 401]) {
			const { ctx, staticData } = hookContext(params, [{ status }], stored());
			expect(await hooks.delete.call(ctx)).toBe(true);
			expect(staticData).toEqual({});
		}
	});

	it('keeps state and throws on any other failure', async () => {
		const { ctx, staticData } = hookContext(
			params,
			[{ status: 500, body: { title: 'Server error' } }],
			stored(),
		);
		await expect(hooks.delete.call(ctx)).rejects.toThrow();
		expect(staticData).toEqual(stored());
	});

	it('does nothing without a stored id', async () => {
		const { ctx, sent } = hookContext(params, [], {});
		expect(await hooks.delete.call(ctx)).toBe(true);
		expect(sent).toHaveLength(0);
	});
});

describe('webhook', () => {
	const key = Buffer.from('0123456789abcdef0123456789abcdef');
	const secret = `whsec_${key.toString('base64')}`;
	const events = [
		{ id: 'evt_1', type: 'contact.created', data: { contact: { id: 'con_1' } } },
		{
			id: 'evt_2',
			type: 'contact.tag_added',
			data: { contact: { id: 'con_1' }, tag: { id: 'tag_b' } },
		},
	];
	const rawBody = Buffer.from(JSON.stringify(events));
	const signed = (body = rawBody) => {
		const ts = String(Math.floor(Date.now() / 1000));
		const signature = createHmac('sha256', key)
			.update(`msg_1.${ts}.`)
			.update(body)
			.digest('base64');
		return {
			'webhook-id': 'msg_1',
			'webhook-timestamp': ts,
			'webhook-signature': `v1,${signature}`,
		};
	};

	it('emits one item per kept event', async () => {
		const { ctx } = webhookContext({
			params,
			body: events,
			rawBody,
			headers: signed(),
			staticData: { webhookSecret: secret },
		});
		const result = await trigger.webhook.call(ctx);
		expect(result.workflowData?.[0].map((item) => item.json.id)).toEqual(['evt_1', 'evt_2']);
	});

	it('applies the tag filter to tag events only', async () => {
		const { ctx } = webhookContext({
			params: { ...params, tag: { __rl: true, mode: 'list', value: 'tag_a' } },
			body: events,
			rawBody,
			headers: signed(),
			staticData: { webhookSecret: secret },
		});
		const result = await trigger.webhook.call(ctx);
		expect(result.workflowData?.[0].map((item) => item.json.id)).toEqual(['evt_1']);
	});

	it('applies the form filter to form submissions', async () => {
		const forms = [
			{ id: 'evt_5', type: 'form.submitted', data: { contact: {}, form: { id: 'frm_a' } } },
			{ id: 'evt_6', type: 'form.submitted', data: { contact: {}, form: { id: 'frm_b' } } },
		];
		const body = Buffer.from(JSON.stringify(forms));
		const { ctx } = webhookContext({
			params: { events: ['form.submitted'], form: { __rl: true, mode: 'list', value: 'frm_b' } },
			body: forms,
			rawBody: body,
			headers: signed(body),
			staticData: { webhookSecret: secret },
		});
		const result = await trigger.webhook.call(ctx);
		expect(result.workflowData?.[0].map((item) => item.json.id)).toEqual(['evt_6']);
	});

	it('starts nothing when every event is filtered out', async () => {
		const { ctx } = webhookContext({
			params: { events: ['form.submitted'] },
			body: events,
			rawBody,
			headers: signed(),
			staticData: { webhookSecret: secret },
		});
		expect(await trigger.webhook.call(ctx)).toEqual({});
	});

	it('answers 401 and starts nothing on a bad signature', async () => {
		const { ctx, response } = webhookContext({
			params,
			body: events,
			rawBody,
			headers: signed(),
			staticData: { webhookSecret: 'whsec_b3RoZXI=' },
		});
		expect(await trigger.webhook.call(ctx)).toEqual({ noWebhookResponse: true });
		expect(response.statusCode).toBe(401);
	});
});
