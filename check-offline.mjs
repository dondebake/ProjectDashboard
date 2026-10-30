import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
for(const name of ['Project Planner.html','Project Planner - Alleen lezen.html']) {
const html=await readFile(new URL(`./dist/${name}`,import.meta.url),'utf8');
assert.equal(html.includes('name="planner-access" content="read"'),name.includes('Alleen lezen'),'Kijk- en bewerkversie hebben de verkeerde toegangsmodus');
assert.ok(!/<script[^>]+src=|<link[^>]+href=/i.test(html),'HTML mag geen externe scripts of stylesheets laden');
assert.ok(html.includes('<script type="module">'),'Ingebouwde JavaScript ontbreekt');
assert.ok(html.includes('<style>'),'Ingebouwde CSS ontbreekt');
assert.ok(!/https?:\/\//.test(html.match(/<style>([\s\S]*?)<\/style>/)?.[1]||''),'CSS mag geen netwerkbestanden laden');
const css=html.match(/<style>([\s\S]*?)<\/style>/)?.[1]||'';
assert.ok(/font-family:\s*["']?Cabin/.test(css),'HKV Cabin-lettertype ontbreekt');
for(const url of css.matchAll(/url\(([^)]+)\)/g)) assert.ok(/^['"]?data:/.test(url[1]),'Alle fonts en CSS-assets moeten in de HTML ingebouwd zijn');
assert.ok(html.includes('SIL OPEN FONT LICENSE'),'Cabin-lettertypelicentie ontbreekt');
console.log(`${name}: zelfstandig offline HTML-bestand gecontroleerd (${Math.round(Buffer.byteLength(html)/1024)} kB).`);
}
