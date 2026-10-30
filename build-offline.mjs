import {readFile,writeFile,rm} from 'node:fs/promises';
const root=new URL('./dist/',import.meta.url);
let html=await readFile(new URL('index.html',root),'utf8');
const script=html.match(/<script[^>]*src="([^"]+)"[^>]*><\/script>/);
const css=html.match(/<link[^>]*href="([^"]+\.css)"[^>]*>/);
if(!script||!css)throw Error('Build mist JavaScript of CSS.');
const js=await readFile(new URL(script[1].replace(/^\//,''),root),'utf8');
html=html.replace(script[0],()=>`<script type="module">${js.replace(/<\/script/gi,'<\\/script')}</script>`);
html=html.replace(css[0],()=>`<style>${''}</style>`);
const style=await readFile(new URL(css[1].replace(/^\//,''),root),'utf8');
html=html.replace('<style></style>',()=>`<style>${style}</style>`);
const fontLicense=await readFile(new URL('./node_modules/@fontsource/cabin/LICENSE',import.meta.url),'utf8');
html=html.replace('<head>',()=>`<head>\n<!-- Cabin font license\n${fontLicense.replace(/-->/g,'-- >')}\n-->`);
await writeFile(new URL('Project Planner.html',root),html);
await writeFile(new URL('Project Planner - Alleen lezen.html',root),html.replace('<head>','<head><meta name="planner-access" content="read">'));
// Alleen de twee zelfstandige HTML-bestanden blijven over; de Vite-tussenbestanden zijn ingebouwd.
await rm(new URL('assets/',root),{recursive:true,force:true});
await rm(new URL('index.html',root),{force:true});
console.log('Offline gereed: dist/Project Planner.html (openen met een dubbelklik)');
