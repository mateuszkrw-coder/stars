// Bundles the site into one self-contained HTML file.
//
//   node tools/build.mjs                       -> dist/cosmic-clocks.html (full document)
//   node tools/build.mjs --fragment <path>     -> also writes a body-only fragment
//                                                 (for hosts that supply their own <html>/<head>)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const html = read('index.html');
const css = read('css/style.css');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const js = scripts.map((src) => `/* ---- ${src} ---- */\n${read(src)}`).join('\n');
if (/<\/script/i.test(js)) throw new Error('A script contains "</script", which would break inlining.');

const between = (a, b) => {
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0) throw new Error(`Missing marker ${a} or ${b} in index.html`);
  return html.slice(i + a.length, j).trim();
};
const body = between('<!--CC:BODY-->', '<!--CC:SCRIPTS-->');
const headStart = html.indexOf('<title>');
const headEnd = html.indexOf('<link rel="stylesheet" href="css/style.css">');
const head = html.slice(headStart, headEnd).trim();
const title = head.match(/<title>[\s\S]*?<\/title>/)[0];
const fonts = head.split('\n').filter((l) => l.includes('fonts.g')).join('\n');

const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
<style>
${css}
</style>
</head>
<body class="intro-on">
${body}
<script>
${js}
</script>
</body>
</html>
`;
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/cosmic-clocks.html'), full);
console.log(`dist/cosmic-clocks.html  ${(full.length / 1024).toFixed(0)} KB`);

const k = process.argv.indexOf('--fragment');
if (k > 0 && process.argv[k + 1]) {
  const fragment = `${title}\n${fonts}\n<style>\n${css}\n</style>\n${body}\n<script>\n${js}\n</script>\n`;
  writeFileSync(process.argv[k + 1], fragment);
  console.log(`${process.argv[k + 1]}  ${(fragment.length / 1024).toFixed(0)} KB`);
}
