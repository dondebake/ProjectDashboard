import {defineConfig} from 'vite';
// Lettertypen als data-URL opnemen, zodat de offline HTML geen bijbestanden nodig heeft.
export default defineConfig({build:{assetsInlineLimit:Infinity}});
