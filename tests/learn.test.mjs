import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

for (const locale of ['', 'ca/', 'es/', 'fr/']) {
  test(`help entry ${locale || 'en'} preserves query and section`, () => {
    const html = readFileSync(new URL(`../learn/${locale}index.html`, import.meta.url), 'utf8');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script);
    let destination;
    vm.runInNewContext(script, { window: { location: {
      search: '?q=references', hash: '#steps', replace: value => { destination = value; },
    } } });
    assert.equal(destination, `/Gnosi/learn/${locale}?q=references#steps`);
    assert.ok(html.includes(`href="/Gnosi/learn/${locale}"`), 'No-JavaScript link is available');
  });
}

for (const [suffix, path] of [['', ''], ['.ca', 'ca/'], ['.es', 'es/']]) {
  for (const stem of ['index', 'changelog', 'download/index']) {
    test(`${stem}${suffix} links to the matching help language`, () => {
      const html = readFileSync(new URL(`../${stem}${suffix}.html`, import.meta.url), 'utf8');
      assert.ok(html.includes(`href="/learn/${path}"`));
    });
  }
}
