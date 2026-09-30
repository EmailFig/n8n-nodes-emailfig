import { describe, expect, it } from 'vitest';

import { EVENT_OPTIONS, matchingEvents } from '../nodes/EmailFig/shared/events';

const joined = (listId: string) => ({
	id: 'evt_1',
	type: 'contact.list_subscribed',
	data: { contact: {}, list: { id: listId } },
});
const created = { id: 'evt_2', type: 'contact.created', data: { contact: {} } };
const campaign = {
	id: 'evt_3',
	type: 'campaign.sent',
	data: { campaign: { id: 'cmp_1', stats: null } },
};
const test = { id: 'evt_4', type: 'webhook.test', data: {} };

describe('matchingEvents', () => {
	it("keeps selected types only, which drops EmailFig's webhook.test delivery", () => {
		expect(matchingEvents([created, test], ['contact.created'], {})).toEqual([created]);
	});

	it('applies a filter only to the events that carry its subject', () => {
		const events = [joined('lst_a'), joined('lst_b'), created, campaign];
		const selected = ['contact.list_subscribed', 'contact.created', 'campaign.sent'];
		expect(matchingEvents(events, selected, { list: 'lst_a' })).toEqual([
			joined('lst_a'),
			created,
			campaign,
		]);
	});

	it('treats a single object as a one-event delivery and ignores junk', () => {
		expect(matchingEvents(created, ['contact.created'], {})).toEqual([created]);
		expect(matchingEvents(['x', null, { type: 3 }], ['contact.created'], {})).toEqual([]);
	});
});

describe('EVENT_OPTIONS', () => {
	it('is sorted by name and offers the twelve events', () => {
		const names = EVENT_OPTIONS.map((o) => o.name);
		expect(names).toEqual([...names].sort());
		expect(EVENT_OPTIONS).toHaveLength(12);
	});
});
