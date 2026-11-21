/** @type {import('next').NextConfig} */

/* Security headers for every response. The studio calls OpenAlex, Crossref,
   Open Library and Wikipedia straight from the browser, so those are allowed
   in connect-src, as is PDF storage (R2, or Cloudinary), which the browser
   uploads to and reads from with signed links; Polar's checkout opens on its own site. */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.openalex.org https://api.crossref.org https://openlibrary.org https://covers.openlibrary.org https://*.wikipedia.org https://*.r2.cloudflarestorage.com https://api.cloudinary.com",
  "frame-src 'self' https://*.polar.sh",
  "frame-ancestors 'none'",
  "form-action 'self' https://*.polar.sh https://accounts.google.com https://github.com",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  // PDF.js reads PDFs on the server (the reader's text processing); loaded from
  // node_modules as is, so its worker file is found at run time. linkedom (the
  // assistant reading web pages) is too, so its optional "canvas" isn't bundled,
  // and so are the assistant's document builders (pdfmake with its fonts, docx).
  // Charts (vega, resvg) and picture edits (sharp) are loaded the same way.
  serverExternalPackages: ['pdfjs-dist', 'linkedom', 'pdfmake', 'docx', 'pptxgenjs', 'exceljs', 'vega', 'vega-lite', '@resvg/resvg-js', 'sharp'],
  // the reader's PDF.js worker is read from node_modules by its route
  outputFileTracingIncludes: { '/api/reader/worker': ['./node_modules/pdfjs-dist/build/pdf.worker.min.mjs'] },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
