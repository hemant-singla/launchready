// The hash router keeps the workspace query on every link.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { href, parseHash } from '../src/app/lib/router';

test('href merges a path query with the workspace query (no second "?")', () => {
  const h = href('/app/supply?chipset=Volga-X', 'w=abc');
  assert.equal(h, '#/app/supply?w=abc&chipset=Volga-X');
  const r = parseHash(h);
  assert.deepEqual(r.segments, ['app', 'supply']);
  assert.equal(r.query.get('chipset'), 'Volga-X');
  assert.equal(r.query.get('w'), 'abc');
});

test('path keys win, and plain paths keep the query as is', () => {
  assert.equal(href('/app/issues?state=all', 'state=open&w=x'), '#/app/issues?state=all&w=x');
  assert.equal(href('/app/launches', 'w=x'), '#/app/launches?w=x');
  assert.equal(href('/app/launches', ''), '#/app/launches');
});
