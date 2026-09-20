import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { database } from './database.mjs';

const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_MODULE ? require(process.env.PLAYWRIGHT_MODULE) : require('playwright');
const env = await database();
let failSaves = false;
const server = createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      if (failSaves && req.method === 'PUT') { res.writeHead(503, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'Test connection interrupted.'})); return; }
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const response = await worker.fetch(new Request('http://localhost' + req.url, {
        method: req.method, headers: req.headers,
        ...(!['GET','HEAD'].includes(req.method) ? {body: Buffer.concat(chunks)} : {})
      }), env);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
    } else {
      const name = req.url === '/' ? 'index.html' : req.url.slice(1).split('?')[0];
      if (!['index.html','journeys.js','journeys.css','privacy.html'].includes(name)) {res.writeHead(404);res.end();return;}
      res.writeHead(200, {'Content-Type': name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'});
      res.end(readFileSync(new URL('../public/' + name, import.meta.url)));
    }
  } catch(e) {res.writeHead(500);res.end(e.message);}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({headless:true, ...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {})});
try {
  const context = await browser.newContext({viewport:{width:390,height:844}, acceptDownloads:true});
  await context.addInitScript(() => localStorage.setItem('sessionToken','alice'));
  await context.route('https://challenges.cloudflare.com/**', route => route.abort());
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const base = 'http://127.0.0.1:' + server.address().port;
  await page.goto(base);
  await page.getByRole('button',{name:'Prayer Guide',exact:true}).click();
  await page.getByRole('button',{name:'Begin New Prayer'}).click();
  await page.getByLabel('A name for this prayer').fill('Trusting God with my family');
  await page.getByLabel('What problem am I facing?').fill('A difficult decision');
  await page.getByLabel('A platform for God').check();
  await page.getByLabel('Rewrite the problem').fill('How can I respond with love?');
  await page.getByRole('radio',{name:'No',exact:true}).check();
  await page.getByRole('button',{name:'Save now',exact:true}).click();
  await page.getByText('Saved to your account',{exact:true}).waitFor();
  const shotDir = new URL('../../../outputs/', import.meta.url);
  mkdirSync(shotDir,{recursive:true});
  await page.screenshot({path:new URL('prayer-guide-mobile.png',shotDir).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('heading',{name:'Abide in the Word',exact:true}).waitFor();
  const sets = page.locator('#journeyRoot fieldset');
  for (let i=0;i<3;i++) await sets.nth(i).getByRole('radio',{name:'Yes',exact:true}).check();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('What is the Scripture?').fill('John 15:7');
  await page.getByLabel('How do I think this Scripture').fill('Remain in Christ.');
  await page.getByRole('button',{name:'Save now',exact:true}).click();
  await page.reload();
  await page.getByRole('button',{name:'Prayer Guide',exact:true}).click();
  await page.getByRole('button',{name:'Continue Prayer',exact:true}).click();
  assert.equal(await page.getByLabel('What is the Scripture?').inputValue(),'John 15:7');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  assert.equal(await page.getByRole('radio',{name:'Yes',exact:true}).first().isChecked(),true);
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByText('Having reflected on').waitFor();
  await page.getByLabel('What is my specific request?').fill('Please guide our decision.');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('What do I believe').fill('God will give us wisdom.');
  await page.getByRole('radio',{name:'Yes',exact:true}).check();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('What action(s) will I take').fill('Listen and act in love.');
  await page.getByLabel('Date submitted to God').fill('2026-09-01');
  await page.getByLabel('Journey status').selectOption('waiting');
  await page.getByRole('button',{name:'Save & Close'}).click();
  await page.getByText('Waiting',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Review / Record an Answer'}).click();
  failSaves = true;
  await page.getByLabel('What action(s) did God take').fill('He opened a new opportunity.');
  await page.getByRole('button',{name:'Save now',exact:true}).click();
  await page.getByText(/Test connection interrupted/).waitFor();
  assert.equal(await page.getByLabel('What action(s) did God take').inputValue(),'He opened a new opportunity.');
  failSaves = false;
  await page.getByLabel('What else do I need to do?').fill('Give thanks and follow through.');
  await page.getByLabel('Date answered').fill('2026-09-20');
  await page.getByLabel('Journey status').selectOption('answered');
  await page.getByRole('button',{name:'Save & Close'}).click();
  await page.getByText('Answered',{exact:true}).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#exportDataBtn').click();
  const download = await downloadEvent;
  const exported = JSON.parse(readFileSync(await download.path(),'utf8'));
  assert.equal(exported.prayerJourneys[0].data.godActions,'He opened a new opportunity.');
  await page.setViewportSize({width:1280,height:900});
  await page.screenshot({path:new URL('prayer-journeys-desktop.png',shotDir).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  await page.locator('#signOutBtn').click();
  assert.equal(await page.locator('#journeyRoot').textContent(),'');
  await page.evaluate(() => localStorage.setItem('sessionToken','bob'));
  // Override initial alice token in this separate signed-in context.
  const bobContext = await browser.newContext({viewport:{width:320,height:740}});
  await bobContext.addInitScript(() => localStorage.setItem('sessionToken','bob'));
  await bobContext.route('https://challenges.cloudflare.com/**', route => route.abort());
  const bob = await bobContext.newPage(); await bob.goto(base);
  await bob.getByRole('button',{name:'Prayer Guide',exact:true}).click();
  await bob.getByText('Your prayer journeys will appear here.',{exact:false}).waitFor();
  assert.equal(await bob.getByText('Trusting God with my family').count(),0);
  assert.equal(await bob.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile six-step flow, Back, save/resume, failed-save retry, answered follow-up, export, sign-out, account isolation, 320px/390px layouts, desktop screenshot.');
} finally { await browser.close(); server.close(); env.sqlite.close(); }
