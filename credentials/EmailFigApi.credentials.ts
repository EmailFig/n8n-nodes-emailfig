import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class EmailFigApi implements ICredentialType {
	name = 'emailFigApi';

	displayName = 'EmailFig API';

	icon: Icon = { light: 'file:../icons/emailfig.svg', dark: 'file:../icons/emailfig.dark.svg' };

	documentationUrl = 'https://emailfig.com/help/api/n8n';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Create one in EmailFig under Settings > API keys',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://emailfig.com/api/v1',
			required: true,
			description: 'Change this only to use a development server',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
	};

	test: ICredentialTestRequest = {
		request: { baseURL: '={{$credentials.baseUrl}}', url: '/account' },
	};
}
