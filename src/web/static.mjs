// R-05 (#3, #97): the read-only web shell. Its static files, read once at startup and served with a strict
// Content-Security-Policy: scripts, styles, fonts and API calls only from this origin, no inline code, no framing.
// The fonts are the mockup's, hosted here under their open licenses (V-B3, D-1; src/web/fonts/README.md).
import {readFileSync} from 'node:fs';

export const WEB_SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/assets/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/assets/persistence.js': ['persistence.js', 'text/javascript; charset=utf-8'],
  '/assets/app.css': ['app.css', 'text/css; charset=utf-8'],
  ...Object.fromEntries(['manrope-latin-wght', 'barlow-condensed-latin-700', 'barlow-condensed-latin-800', 'jetbrains-mono-latin-wght']
    .map(name => [`/assets/fonts/${name}.woff2`, [`fonts/${name}.woff2`, 'font/woff2']])),
};
const ASSETS = new Map(Object.entries(FILES).map(([path, [file, type]]) => [path, {type, body: readFileSync(new URL(file, import.meta.url))}]));

// True when the request was a web-shell path and has been answered.
export function serveWeb(req, res, url) {
  const asset = ASSETS.get(url.pathname);
  if (!asset) return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, {'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD', ...WEB_SECURITY_HEADERS});
    res.end('Solo GET');
    return true;
  }
  res.writeHead(200, {'Content-Type': asset.type, 'Content-Length': asset.body.length, ...WEB_SECURITY_HEADERS});
  res.end(req.method === 'HEAD' ? undefined : asset.body);
  return true;
}
