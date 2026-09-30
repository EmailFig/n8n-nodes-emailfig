import type { INodeProperties, INodePropertyMode } from 'n8n-workflow';

import { idRegex, type IdPrefix } from './api';

export function idValidation(prefix: IdPrefix, noun: string): INodePropertyMode['validation'] {
	return [
		{
			type: 'regex',
			properties: { regex: idRegex(prefix), errorMessage: `Not a valid ${noun} ID` },
		},
	];
}

export function limitFields(resource: string, returnAllHint?: string): INodeProperties[] {
	const show = { resource: [resource], operation: ['getAll'] };
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			...(returnAllHint ? { hint: returnAllHint } : {}),
			displayOptions: { show },
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 50,
			description: 'Max number of results to return',
			displayOptions: { show: { ...show, returnAll: [false] } },
		},
	];
}
