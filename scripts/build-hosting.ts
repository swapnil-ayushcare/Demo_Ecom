import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface PackageJson {
  version?: string;
  engines?: { node?: string };
}

const root = process.cwd();
const outputDirectory = join(root, 'hosting-dist');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as PackageJson;
const version = pkg.version ?? '0.0.0';
const nodeRange = pkg.engines?.node ?? '20.x';

const page = `<!doctype html>
<html lang="en-IN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Demo_Ecom — release marker</title>
    <meta
      name="description"
      content="This is the Demo_Ecom release marker. The shop itself runs locally with Node.js and PostgreSQL."
    />
    <style>
      :root {
        color-scheme: light;
        --ink: #1d1b16;
        --paper: #f7f1e7;
        --surface: #fffdf8;
        --muted: #6b6358;
        --hairline: #ded4c4;
        --saffron: #d96c2f;
        --green: #1f5c4a;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--paper);
        color: var(--ink);
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        line-height: 1.55;
      }
      main {
        max-width: 760px;
        margin: 0 auto;
        padding: 48px 22px 64px;
      }
      .eyebrow {
        margin: 0 0 10px;
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--saffron);
        font-weight: 700;
      }
      h1 {
        margin: 0;
        font-family: Georgia, 'Times New Roman', serif;
        font-size: clamp(32px, 6vw, 48px);
        line-height: 1.08;
        letter-spacing: -0.02em;
      }
      .lede {
        margin: 18px 0 0;
        max-width: 62ch;
        font-size: 17px;
        color: #403b32;
      }
      .card {
        margin-top: 30px;
        background: var(--surface);
        border: 1px solid var(--hairline);
        border-radius: 10px;
        padding: 24px;
      }
      h2 {
        margin: 0 0 12px;
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 22px;
      }
      ol { margin: 0; padding-left: 22px; }
      li { margin: 8px 0; }
      code {
        background: var(--paper);
        border: 1px solid var(--hairline);
        border-radius: 4px;
        padding: 1px 6px;
        font-size: 14px;
      }
      .note {
        margin: 22px 0 0;
        font-size: 14px;
        color: var(--muted);
      }
      a { color: var(--green); }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">Release marker · v${version}</p>
      <h1>Demo_Ecom runs on your own machine.</h1>
      <p class="lede">
        This page is the release marker, not the shop. It carries no catalogue, customer or order
        data. The shop is a Node.js server and a PostgreSQL database that you run yourself.
      </p>

      <section class="card" aria-labelledby="install">
        <h2 id="install">Run the shop locally</h2>
        <ol>
          <li>Install Node.js ${nodeRange} and PostgreSQL 15 or later.</li>
          <li>Copy the repository and run <code>npm ci</code>.</li>
          <li>Copy <code>.env.example</code> to <code>.env</code> and fill in every value.</li>
          <li>Create the database, then run <code>npm run migrate</code> and <code>npm run seed</code>.</li>
          <li>Run <code>npm run dev</code> for development, or <code>npm run build &amp;&amp; npm start</code> for a production-mode run.</li>
        </ol>
        <p class="note">
          The repository README holds the full install, test and distribution path, including the
          smoke test that proves a short customer journey completes locally.
        </p>
      </section>

      <p class="note">
        Demo_Ecom · prices in Indian rupees (INR) · the shop itself is never hosted.
      </p>
    </main>
  </body>
</html>
`;

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, 'index.html'), page, 'utf8');
writeFileSync(join(outputDirectory, '404.html'), page, 'utf8');

console.log(`build:hosting wrote ${outputDirectory} (release marker v${version})`);
