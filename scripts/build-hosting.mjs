import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const outputDirectory = join(root, 'hosting-dist');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const html = `<!doctype html>
<html lang="en-IN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Demo_Ecom — local shop release marker</title>
    <meta
      name="description"
      content="A release marker for Demo_Ecom. The shop itself is a Node.js and PostgreSQL application you run on your own machine."
    />
    <style>
      :root {
        --ink: #1d1b16;
        --paper: #f7f1e7;
        --surface: #fffdf8;
        --saffron: #d96c2f;
        --green: #1f5c4a;
        --muted: #6b6358;
        --hairline: #ded4c4;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--paper);
        color: var(--ink);
        font-family: "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
        line-height: 1.55;
      }
      main {
        width: min(760px, calc(100% - 40px));
        margin: 0 auto;
        padding: 56px 0 72px;
      }
      .tag {
        display: inline-block;
        margin: 0 0 20px;
        padding: 5px 12px;
        border-radius: 2px;
        background: var(--saffron);
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        font-size: clamp(38px, 7vw, 58px);
        line-height: 1.05;
        letter-spacing: -0.01em;
      }
      .lede {
        margin: 16px 0 0;
        font-size: 19px;
        color: var(--muted);
      }
      .note {
        margin: 32px 0;
        padding: 20px 22px;
        background: var(--surface);
        border: 1px solid var(--hairline);
        border-left: 4px solid var(--green);
        border-radius: 8px;
      }
      .note strong { color: var(--green); }
      h2 {
        margin: 40px 0 12px;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 26px;
        line-height: 1.2;
      }
      ol { margin: 0; padding-left: 22px; }
      li { margin: 10px 0; }
      code {
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--surface);
        border: 1px solid var(--hairline);
        font-size: 0.92em;
      }
      .foot {
        margin-top: 44px;
        padding-top: 18px;
        border-top: 1px dashed var(--hairline);
        font-size: 13px;
        color: var(--muted);
      }
      a { color: var(--green); }
    </style>
  </head>
  <body>
    <main>
      <p class="tag">Release marker</p>
      <h1>Demo_Ecom</h1>
      <p class="lede">A small, honest Indian shop that runs from one repository on your machine.</p>

      <div class="note">
        <p><strong>This page is a release marker, not the shop.</strong></p>
        <p>
          The shop is a Node.js 20 and PostgreSQL 15 application. It has no hosted
          storefront, cloud database or customer accounts on this site. This page carries
          no catalogue, customer or order data.
        </p>
      </div>

      <h2>Run the shop locally</h2>
      <ol>
        <li>Copy the repository to your machine and open a terminal in its root.</li>
        <li><code>cp .env.example .env</code> and fill in every value.</li>
        <li>Start PostgreSQL 15 or later and point <code>DATABASE_URL</code> at your database.</li>
        <li><code>npm ci</code></li>
        <li><code>npm run migrate</code></li>
        <li><code>npm run seed</code></li>
        <li><code>npm run dev</code>, then open <code>http://localhost:3000</code>.</li>
      </ol>

      <p>
        For a production-mode run, use <code>npm run build</code> then
        <code>npm start</code>. The README lists the prerequisites and the full path.
      </p>

      <p class="foot">
        ${pkg.name} ${pkg.version} · This marker is published by the release pipeline for
        verification. The shop itself is not hosted.
      </p>
    </main>
  </body>
</html>
`;

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, 'index.html'), html, 'utf8');
console.log(`release marker written to ${outputDirectory}`);
