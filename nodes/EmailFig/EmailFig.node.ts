import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type JsonObject,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';

import { contactOperation, contactProperties } from './resources/contact';
import { listOperation, listProperties } from './resources/list';
import { tagOperation, tagProperties } from './resources/tag';
import { getCustomFields, searchLists, searchTagNames } from './shared/methods';

type Operation = (
	this: IExecuteFunctions,
	operation: string,
	i: number,
) => Promise<IDataObject | IDataObject[]>;

const OPERATIONS: Record<string, Operation> = {
	contact: contactOperation,
	list: listOperation,
	tag: tagOperation,
};

export class EmailFig implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'EmailFig',
		name: 'emailFig',
		icon: { light: 'file:../../icons/emailfig.svg', dark: 'file:../../icons/emailfig.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Manage contacts, lists and tags in EmailFig',
		defaults: { name: 'EmailFig' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'emailFigApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				default: 'contact',
				options: [
					{ name: 'Contact', value: 'contact' },
					{ name: 'List', value: 'list' },
					{ name: 'Tag', value: 'tag' },
				],
			},
			...contactProperties,
			...listProperties,
			...tagProperties,
		],
	};

	methods = {
		listSearch: { searchLists, searchTagNames },
		loadOptions: { getCustomFields },
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const output: INodeExecutionData[] = [];
		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const result = await OPERATIONS[resource].call(this, operation, i);
				output.push(
					...this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result), {
						itemData: { item: i },
					}),
				);
			} catch (error) {
				if (!this.continueOnFail()) {
					// Both constructors return an error of their own class as is.
					if (error instanceof NodeApiError)
						throw new NodeApiError(this.getNode(), error as unknown as JsonObject);
					throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
				}
				output.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
			}
		}
		return [output];
	}
}
