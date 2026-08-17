import { describe, expect, it } from 'vitest';
import { readJson } from '../core/http';

describe('readJson', () => {
  it('parses a bounded JSON request', async () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      body: JSON.stringify({ value: 'ok' }),
    });

    await expect(readJson<{ value: string }>(request)).resolves.toEqual({ value: 'ok' });
  });

  it('rejects a declared body larger than the endpoint limit', async () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      headers: { 'Content-Length': '1024' },
      body: '{}',
    });

    await expect(readJson(request, 32)).rejects.toMatchObject({
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('enforces the limit when Content-Length is absent', async () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      body: JSON.stringify({ value: 'x'.repeat(128) }),
    });
    request.headers.delete('Content-Length');

    await expect(readJson(request, 32)).rejects.toMatchObject({
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('preserves the invalid JSON error contract', async () => {
    const request = new Request('https://example.test', { method: 'POST', body: '{' });

    await expect(readJson(request)).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_JSON',
    });
  });
});
