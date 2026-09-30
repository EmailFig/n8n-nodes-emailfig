import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { verifySignature } from '../nodes/EmailFig/shared/signature';

const key = Buffer.from('0123456789abcdef0123456789abcdef');
const secret = `whsec_${key.toString('base64')}`;
const now = 1_790_000_000_000;
const ts = String(now / 1000);
const raw = Buffer.from('[ {"id":"evt_1"} ]');

const sign = (body: Buffer, id = 'msg_1', timestamp = ts, signingKey = key) =>
	`v1,${createHmac('sha256', signingKey).update(`${id}.${timestamp}.`).update(body).digest('base64')}`;

const headers = (signature: string, timestamp = ts) => ({
	'webhook-id': 'msg_1',
	'webhook-timestamp': timestamp,
	'webhook-signature': signature,
});

describe('verifySignature', () => {
	it('accepts a body signed with the stored secret, verified over the raw bytes', () => {
		expect(verifySignature(secret, headers(sign(raw)), raw, now)).toBe(true);
	});

	it('accepts any matching entry among several', () => {
		expect(
			verifySignature(
				secret,
				headers(`v1,${Buffer.alloc(32).toString('base64')} ${sign(raw)}`),
				raw,
				now,
			),
		).toBe(true);
	});

	it('refuses a wrong secret, a tampered body and a re-serialized body', () => {
		expect(
			verifySignature(
				secret,
				headers(sign(raw, 'msg_1', ts, Buffer.from('other-key-other-key-other-key-00'))),
				raw,
				now,
			),
		).toBe(false);
		expect(verifySignature(secret, headers(sign(raw)), Buffer.from('[{"id":"evt_2"}]'), now)).toBe(
			false,
		);
		expect(
			verifySignature(
				secret,
				headers(sign(raw)),
				Buffer.from(JSON.stringify(JSON.parse(raw.toString()))),
				now,
			),
		).toBe(false);
	});

	it('refuses a timestamp more than 5 minutes away', () => {
		const old = String(now / 1000 - 360);
		expect(verifySignature(secret, headers(sign(raw, 'msg_1', old), old), raw, now)).toBe(false);
	});

	it('refuses everything malformed without throwing', () => {
		expect(verifySignature(undefined, headers(sign(raw)), raw, now)).toBe(false);
		expect(verifySignature(secret, {}, raw, now)).toBe(false);
		expect(verifySignature(secret, headers(sign(raw)), undefined, now)).toBe(false);
		expect(verifySignature(secret, headers('v1,c2hvcnQ='), raw, now)).toBe(false);
		expect(verifySignature(secret, headers(sign(raw).replace('v1,', 'v2,')), raw, now)).toBe(false);
		expect(verifySignature(secret, headers(sign(raw), 'soon'), raw, now)).toBe(false);
		expect(verifySignature(secret, headers('v1'), raw, now)).toBe(false);
	});
});
