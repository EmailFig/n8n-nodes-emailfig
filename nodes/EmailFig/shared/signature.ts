import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IDataObject } from 'n8n-workflow';

const TOLERANCE_SECONDS = 5 * 60;

function header(headers: IDataObject, name: string): string {
	const value = headers[name];
	return String((Array.isArray(value) ? value[0] : value) ?? '');
}

// Standard Webhooks v1 (standardwebhooks.com). EmailFig signs each attempt as
// it sends it, so a retried delivery carries a fresh timestamp.
export function verifySignature(
	secret: unknown,
	headers: IDataObject,
	rawBody: unknown,
	nowMs: number,
): boolean {
	if (typeof secret !== 'string' || !secret.startsWith('whsec_') || !Buffer.isBuffer(rawBody))
		return false;
	const id = header(headers, 'webhook-id');
	const timestamp = header(headers, 'webhook-timestamp');
	const signatures = header(headers, 'webhook-signature');
	if (!id || !/^\d+$/.test(timestamp) || !signatures) return false;
	if (Math.abs(nowMs / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false;

	const expected = createHmac('sha256', Buffer.from(secret.slice('whsec_'.length), 'base64'))
		.update(`${id}.${timestamp}.`)
		.update(rawBody)
		.digest();
	return signatures.split(' ').some((entry) => {
		const [version, encoded] = entry.split(',');
		if (version !== 'v1' || !encoded) return false;
		const given = Buffer.from(encoded, 'base64');
		// timingSafeEqual throws on unequal lengths.
		return given.length === expected.length && timingSafeEqual(given, expected);
	});
}
