/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mediaUrl } from './media.ts';

test('an absolute http(s) url is passed through', () => {
  const url = 'https://youtube.com/watch?v=abc';
  assert.equal(mediaUrl(url), url);
  assert.equal(mediaUrl('http://x:8002/media/a.jpg'), 'http://x:8002/media/a.jpg');
});

test('a bundled asset/file uri is passed through', () => {
  assert.equal(mediaUrl('asset:/exercises/a.jpg'), 'asset:/exercises/a.jpg');
  assert.equal(mediaUrl('file:///var/mobile/a.jpg'), 'file:///var/mobile/a.jpg');
});

test('a bare relative path has no server to resolve against', () => {
  assert.equal(mediaUrl('/media/exercises/x/0.jpg'), undefined);
  assert.equal(mediaUrl('media/a.jpg'), undefined);
});

test('nothing to resolve stays nothing', () => {
  assert.equal(mediaUrl(null), undefined);
  assert.equal(mediaUrl(undefined), undefined);
  assert.equal(mediaUrl(''), undefined);
});
