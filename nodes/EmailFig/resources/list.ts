import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';

import { request } from '../shared/api';
import { limitFields } from '../shared/properties';

export const listProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['list'] } },
		default: 'getAll',
		options: [{ name: 'Get Many', value: 'getAll', action: 'Get many lists' }],
	},
	...limitFields('list'),
];

export async function listOperation(
	this: IExecuteFunctions,
	_operation: string,
	i: number,
): Promise<IDataObject[]> {
	const lists = await request<IDataObject[]>(this, 'listLists', {}, { itemIndex: i });
	return this.getNodeParameter('returnAll', i)
		? lists
		: lists.slice(0, this.getNodeParameter('limit', i) as number);
}
