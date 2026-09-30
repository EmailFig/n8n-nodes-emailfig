import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';

import { paginate } from '../shared/api';
import { limitFields } from '../shared/properties';

export const tagProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['tag'] } },
		default: 'getAll',
		options: [{ name: 'Get Many', value: 'getAll', action: 'Get many tags' }],
	},
	...limitFields('tag'),
];

export async function tagOperation(
	this: IExecuteFunctions,
	_operation: string,
	i: number,
): Promise<IDataObject[]> {
	const limit = this.getNodeParameter('returnAll', i)
		? undefined
		: (this.getNodeParameter('limit', i) as number);
	return await paginate(this, 'listTags', {}, limit, i);
}
