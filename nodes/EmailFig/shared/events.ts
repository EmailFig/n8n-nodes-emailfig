import type { IDataObject, INodePropertyOptions } from 'n8n-workflow';

import { isObject } from './api';

export const EVENT_OPTIONS: INodePropertyOptions[] = [
	{
		name: 'Campaign Sent',
		value: 'campaign.sent',
		description:
			'A campaign finished sending. The event has delivery stats (sometimes null) but no contact.',
	},
	{ name: 'Contact Added to List', value: 'contact.list_subscribed' },
	{
		name: 'Contact Cleaned',
		value: 'contact.cleaned',
		description:
			'The address bounced (a hard bounce, or repeated soft bounces) and is no longer mailed',
	},
	{
		name: 'Contact Confirmed',
		value: 'contact.confirmed',
		description: 'A contact confirmed a double opt-in signup',
	},
	{
		name: 'Contact Deleted',
		value: 'contact.deleted',
		description: "A contact was deleted in EmailFig. Erasing a contact doesn't trigger this.",
	},
	{ name: 'Contact Removed From List', value: 'contact.list_unsubscribed' },
	{
		name: 'Contact Unsubscribed',
		value: 'contact.unsubscribed',
		description: 'A contact unsubscribed, marked an email as spam, or was suppressed',
	},
	{ name: 'Contact Updated', value: 'contact.updated' },
	{ name: 'Form Submitted', value: 'form.submitted' },
	{ name: 'New Contact', value: 'contact.created' },
	{ name: 'Tag Added', value: 'contact.tag_added' },
	{ name: 'Tag Removed', value: 'contact.tag_removed' },
];

export const SUBJECT_EVENTS = {
	list: ['contact.list_subscribed', 'contact.list_unsubscribed'],
	tag: ['contact.tag_added', 'contact.tag_removed'],
	form: ['form.submitted'],
};

export type Filters = Partial<Record<keyof typeof SUBJECT_EVENTS, string>>;

export function matchingEvents(body: unknown, selected: string[], filters: Filters): IDataObject[] {
	const events = Array.isArray(body) ? body : [body];
	return events.filter((event): event is IDataObject => {
		if (!isObject(event) || typeof event.type !== 'string' || !selected.includes(event.type))
			return false;
		const type = event.type;
		return (Object.keys(SUBJECT_EVENTS) as Array<keyof typeof SUBJECT_EVENTS>).every((subject) => {
			const wanted = filters[subject];
			if (!wanted || !SUBJECT_EVENTS[subject].includes(type)) return true;
			const data = isObject(event.data) ? event.data : {};
			return isObject(data[subject]) && (data[subject] as IDataObject).id === wanted;
		});
	});
}
