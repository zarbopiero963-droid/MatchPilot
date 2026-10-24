// Builds the single-file MatchPilot web app: webapp/dist/matchpilot-webapp.html (no external resource).
import {readFileSync, writeFileSync} from 'node:fs';
const src = f => readFileSync(new URL(`./src/${f}`, import.meta.url), 'utf8');
const font = (family, weight, file) => `@font-face{font-family:"${family}";src:url(data:font/woff2;base64,${readFileSync(new URL(`../src/web/fonts/${file}`, import.meta.url)).toString('base64')}) format("woff2");font-weight:${weight};font-display:swap}`;
const fonts = [font('Manrope', '200 800', 'manrope-latin-wght.woff2'), font('Barlow Condensed', '700', 'barlow-condensed-latin-700.woff2'),
  font('Barlow Condensed', '800', 'barlow-condensed-latin-800.woff2'), font('JetBrains Mono', '100 800', 'jetbrains-mono-latin-wght.woff2')].join('\n');
const js = ['core.js', 'demo.js', 'api.js', 'shell.js', 'views-a.js', 'views-b.js', 'views-c.js', 'views-d.js', 'specs.js', 'boot.js'].map(src).join('\n');
const html = src('head.html').replace('/*FONTS*/', fonts) + js.replace(/<\/script/gi, '<\\/script') + '\n</script>\n</body>\n</html>\n';
const out = new URL('./dist/matchpilot-webapp.html', import.meta.url);
writeFileSync(out, html);
console.log(`${out.pathname} ${(html.length / 1024).toFixed(0)} KB`);
