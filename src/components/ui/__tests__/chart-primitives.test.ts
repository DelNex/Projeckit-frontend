import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BarList } from '../bar-list';
import { Sparkline } from '../sparkline';

test('BarList exposes readable values and bounded progress semantics', () => {
  const html = renderToStaticMarkup(
    React.createElement(BarList, {
      ariaLabel: 'Learner mastery',
      items: [
        { key: 'mastered', label: 'Mastered', detail: '96–100%', value: 10, percentage: 125, color: '#16845b' },
        { key: 'moving', label: 'Moving towards mastery', value: 5, percentage: 50.5, color: '#b7791f' },
      ],
    }),
  );

  assert.match(html, /aria-label="Learner mastery"/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="100"/);
  assert.match(html, /10 learners · 100\.0%/);
  assert.match(html, /aria-valuenow="51"/);
  assert.match(html, /Moving towards mastery/);
});

test('Sparkline handles empty and single-point datasets without invalid geometry', () => {
  const empty = renderToStaticMarkup(
    React.createElement(Sparkline, { values: [null, Number.NaN], ariaLabel: 'No scores yet' }),
  );
  assert.match(empty, /No trend data/);

  const single = renderToStaticMarkup(
    React.createElement(Sparkline, { values: [72], ariaLabel: 'Quarterly score trend' }),
  );
  assert.match(single, /role="img"/);
  assert.match(single, /aria-label="Quarterly score trend"/);
  assert.match(single, /<circle/);
  assert.doesNotMatch(single, /NaN|Infinity/);
});
