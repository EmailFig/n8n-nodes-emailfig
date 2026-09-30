import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeParameterResourceLocator,
	type INodeProperties,
} from 'n8n-workflow';

import {
	compact,
	findContactByEmail,
	isBlank,
	isPrefixedId,
	locatorValue,
	paginate,
	request,
} from '../shared/api';
import { idValidation, limitFields } from '../shared/properties';

const LIST_NOT_FOUND = 'List not found';
const NO_CONTACT_EMAIL = 'No contact with that email';
const NO_CONTACT_ID = 'No contact with that ID';

const show = (...operation: string[]) => ({ show: { resource: ['contact'], operation } });

const emailField = (operations: string[]): INodeProperties => ({
	displayName: 'Email',
	name: 'email',
	type: 'string',
	placeholder: 'name@email.com',
	required: true,
	default: '',
	displayOptions: show(...operations),
});

const listLocator = (extra: Partial<INodeProperties> = {}): INodeProperties => ({
	displayName: 'List',
	name: 'list',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	description:
		'A double opt-in list sends a confirmation email, and the contact stays pending until they confirm',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: { searchListMethod: 'searchLists', searchable: true },
		},
		{
			displayName: 'ID',
			name: 'id',
			type: 'string',
			placeholder: 'lst_...',
			validation: idValidation('lst', 'List'),
		},
	],
	...extra,
});

const customFields: INodeProperties = {
	displayName: 'Custom Fields',
	name: 'customFields',
	type: 'fixedCollection',
	typeOptions: { multipleValues: true },
	placeholder: 'Add Custom Field',
	default: {},
	options: [
		{
			displayName: 'Field',
			name: 'field',
			values: [
				{
					displayName: 'Field Name or ID',
					name: 'key',
					type: 'options',
					typeOptions: { loadOptionsMethod: 'getCustomFields' },
					default: '',
					description:
						'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				},
				{
					displayName: 'Value',
					name: 'value',
					type: 'string',
					default: '',
					description:
						'Dates use YYYY-MM-DD. In an expression, format one with .toFormat("yyyy-MM-dd").',
				},
			],
		},
	],
};

const nameFields: INodeProperties[] = [
	{ displayName: 'First Name', name: 'firstName', type: 'string', default: '' },
	{ displayName: 'Last Name', name: 'lastName', type: 'string', default: '' },
];

const tagsDescription = 'Tag names, separated by commas';

export const contactProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['contact'] } },
		default: 'upsert',
		options: [
			{ name: 'Add Tags', value: 'addTags', action: 'Add tags to a contact' },
			{ name: 'Add to List', value: 'addToList', action: 'Add a contact to a list' },
			{ name: 'Create or Update', value: 'upsert', action: 'Create or update a contact' },
			{
				name: 'Erase (Permanent)',
				value: 'erase',
				action: 'Permanently erase a contact',
				description:
					'Deletes the contact and their data for good. If they had opted out, the address stays unsubscribed.',
			},
			{ name: 'Get', value: 'get', action: 'Get a contact' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many contacts' },
			{ name: 'Remove From List', value: 'removeFromList', action: 'Remove a contact from a list' },
			{ name: 'Remove Tags', value: 'removeTags', action: 'Remove tags from a contact' },
			{
				name: 'Unsubscribe',
				value: 'unsubscribe',
				action: 'Unsubscribe an email address',
				description: "Unsubscribes the address from all email, even if it isn't a contact yet",
			},
			{ name: 'Update', value: 'update', action: 'Update a contact' },
		],
	},
	emailField(['upsert', 'addToList', 'unsubscribe']),
	{
		displayName: 'Contact',
		name: 'contact',
		type: 'resourceLocator',
		required: true,
		default: { mode: 'email', value: '' },
		displayOptions: show('get', 'update', 'erase', 'removeFromList', 'addTags', 'removeTags'),
		modes: [
			{ displayName: 'By Email', name: 'email', type: 'string', placeholder: 'name@email.com' },
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'con_...',
				validation: idValidation('con', 'Contact'),
			},
		],
	},
	listLocator({ required: true, displayOptions: show('addToList', 'removeFromList') }),
	{
		displayName: 'Tags',
		name: 'tags',
		type: 'string',
		required: true,
		default: '',
		description: `${tagsDescription}. Add Tags creates any that don't exist yet.`,
		displayOptions: show('addTags', 'removeTags'),
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show('upsert', 'addToList'),
		options: [
			{
				displayName: 'Consent IP',
				name: 'consentIp',
				type: 'string',
				default: '',
				description:
					"The subscriber's IP address, recorded as consent proof when the contact joins a list",
			},
			{
				displayName: 'Consent Time',
				name: 'consentAt',
				type: 'dateTime',
				default: '',
				description:
					'When the subscriber consented, recorded when the contact joins a list. A time with no offset is read as UTC.',
			},
			customFields,
			...nameFields,
			listLocator({ displayOptions: { show: { '/operation': ['upsert'] } } }),
			{
				displayName: 'Tags',
				name: 'tags',
				type: 'string',
				default: '',
				description: `${tagsDescription}. New ones are created.`,
			},
		],
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show('update'),
		options: [
			customFields,
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				description: 'A new email address for the contact',
			},
			...nameFields,
		],
	},
	...limitFields(
		'contact',
		"One run can read about 30,000 contacts before EmailFig's rate limit; sync larger accounts with the Updated Since filter",
	),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: show('getAll'),
		options: [
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				description: 'An exact email address',
			},
			{
				displayName: 'Include Deleted',
				name: 'includeDeleted',
				type: 'boolean',
				default: false,
				description: 'Whether to include deleted contacts, each with deleted_at set',
			},
			listLocator({ description: 'Contacts on this list, including those who unsubscribed' }),
			{
				displayName: 'Tag',
				name: 'tag',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				description: 'Contacts with this tag. An unknown tag name matches nothing.',
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: { searchListMethod: 'searchTagNames', searchable: true },
					},
					{ displayName: 'Name', name: 'name', type: 'string', placeholder: 'vip' },
				],
			},
			{
				displayName: 'Updated Since',
				name: 'updatedSince',
				type: 'dateTime',
				default: '',
				description:
					'Contacts changed at or after this time, oldest first. A time with no offset is read as UTC. To sync, start each run a minute before the latest change the last run saw.',
			},
		],
	},
];

function parseTags(value: unknown): string[] {
	const names = Array.isArray(value) ? value : String(value ?? '').split(',');
	return names.map((name) => String(name).trim()).filter((name) => name !== '');
}

function contactFields(fields: IDataObject): IDataObject {
	const rows = ((fields.customFields as IDataObject | undefined)?.field ?? []) as Array<{
		key: string;
		value: unknown;
	}>;
	return {
		first_name: fields.firstName,
		last_name: fields.lastName,
		properties: Object.fromEntries(rows.map((row) => [row.key, row.value])),
	};
}

function listId(ctx: IExecuteFunctions, value: unknown, i: number): string {
	if (!isPrefixedId(value, 'lst'))
		throw new NodeOperationError(ctx.getNode(), LIST_NOT_FOUND, { itemIndex: i });
	return value;
}

// By ID never looks the contact up: the write endpoint answers 404 itself, and
// a lookup would refuse the soft-deleted contact an erasure must still reach.
async function target(ctx: IExecuteFunctions, i: number, includeDeleted = false) {
	const { mode, value } = ctx.getNodeParameter('contact', i) as INodeParameterResourceLocator;
	if (mode === 'id') {
		if (!isPrefixedId(value, 'con'))
			throw new NodeOperationError(ctx.getNode(), NO_CONTACT_ID, { itemIndex: i });
		return { id: value, notFound: NO_CONTACT_ID };
	}
	const contact = await findContactByEmail(ctx, String(value ?? ''), {
		includeDeleted,
		itemIndex: i,
	});
	if (!contact) throw new NodeOperationError(ctx.getNode(), NO_CONTACT_EMAIL, { itemIndex: i });
	return { id: String(contact.id), notFound: NO_CONTACT_EMAIL, contact };
}

async function join(ctx: IExecuteFunctions, i: number, list: unknown, fields: IDataObject) {
	const body = compact({
		email_address: ctx.getNodeParameter('email', i),
		...contactFields(fields),
		tags: parseTags(fields.tags),
		consent: { ip: fields.consentIp, at: fields.consentAt },
	});
	return await request(
		ctx,
		'joinList',
		{ params: { list_id: listId(ctx, list, i) }, body },
		{ itemIndex: i, notFound: LIST_NOT_FOUND },
	);
}

async function getMany(ctx: IExecuteFunctions, i: number): Promise<IDataObject[]> {
	const limit = ctx.getNodeParameter('returnAll', i)
		? undefined
		: (ctx.getNodeParameter('limit', i) as number);
	const filters = ctx.getNodeParameter('filters', i, {}) as IDataObject;
	const qs: IDataObject = {};
	// The API ignores a blank filter and would return every contact, so a filter
	// the user added that resolves blank returns nothing instead.
	for (const name of ['email', 'list', 'tag']) {
		if (name in filters && isBlank(locatorValue(filters[name]))) return [];
	}
	if (filters.email !== undefined) qs.email = filters.email;
	if (filters.list !== undefined) {
		qs.list_id = listId(ctx, locatorValue(filters.list), i);
		await request(
			ctx,
			'getList',
			{ params: { id: qs.list_id as string } },
			{ itemIndex: i, notFound: LIST_NOT_FOUND },
		);
	}
	if (filters.tag !== undefined) qs.tag = String(locatorValue(filters.tag)).trim();
	if (filters.updatedSince) qs.updated_since = filters.updatedSince;
	if (filters.includeDeleted) qs.include_deleted = true;
	return await paginate(ctx, 'listContacts', qs, limit, i);
}

async function tagsCall(ctx: IExecuteFunctions, i: number, route: 'addTags' | 'removeTags') {
	const tags = parseTags(ctx.getNodeParameter('tags', i));
	if (tags.length === 0)
		throw new NodeOperationError(ctx.getNode(), 'Enter at least one tag name', { itemIndex: i });
	const { id, notFound } = await target(ctx, i);
	return await request(
		ctx,
		route,
		{ params: { contact_id: id }, body: { tags } },
		{ itemIndex: i, notFound },
	);
}

export async function contactOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'upsert': {
			const fields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
			if (fields.list !== undefined) return await join(this, i, locatorValue(fields.list), fields);
			const body = compact({
				email_address: this.getNodeParameter('email', i),
				...contactFields(fields),
				tags: parseTags(fields.tags),
			});
			return await request(this, 'upsertContact', { body }, { itemIndex: i });
		}
		case 'addToList':
			return await join(
				this,
				i,
				this.getNodeParameter('list', i, undefined, { extractValue: true }),
				this.getNodeParameter('additionalFields', i, {}) as IDataObject,
			);
		case 'get': {
			const found = await target(this, i);
			if (found.contact) return found.contact;
			return await request(
				this,
				'getContact',
				{ params: { id: found.id } },
				{ itemIndex: i, notFound: found.notFound },
			);
		}
		case 'getAll':
			return await getMany(this, i);
		case 'update': {
			const fields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
			const { id, notFound } = await target(this, i);
			const body = compact({ email_address: fields.email, ...contactFields(fields) });
			return await request(
				this,
				'updateContact',
				{ params: { id }, body },
				{ itemIndex: i, notFound },
			);
		}
		case 'erase': {
			const { id, notFound } = await target(this, i, true);
			await request(this, 'eraseContact', { params: { id } }, { itemIndex: i, notFound });
			return { deleted: true };
		}
		case 'unsubscribe':
			return await request(
				this,
				'unsubscribeAddress',
				{ body: { email_address: this.getNodeParameter('email', i) } },
				{ itemIndex: i },
			);
		case 'removeFromList': {
			const list = listId(
				this,
				this.getNodeParameter('list', i, undefined, { extractValue: true }),
				i,
			);
			const { id } = await target(this, i);
			const result = await request(
				this,
				'leaveList',
				{ params: { list_id: list, contact_id: id } },
				{ itemIndex: i, notFound: 'List or contact not found' },
			);
			return result ?? { success: true };
		}
		case 'addTags':
			return await tagsCall(this, i, 'addTags');
		case 'removeTags':
			return await tagsCall(this, i, 'removeTags');
	}
	throw new NodeOperationError(this.getNode(), `Unsupported operation: ${operation}`, {
		itemIndex: i,
	});
}
