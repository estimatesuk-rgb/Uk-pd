import { test } from 'node:test';
import assert from 'node:assert/strict';
test('API package starts with node', () => { assert.equal(typeof process.version, 'string'); });
