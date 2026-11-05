// ============================================================
//  Technamooz AI — scripts/webhook.mjs
//  Author: Amir Parsa (امیر پارسا)
//  Register Telegram webhook from CLI
//  Usage: npm run webhook
// ============================================================

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = decodeURIComponent(new URL('..', import.meta.url).pathname);

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
}

async function main() {
  console.log('\n🔗 Technamooz AI — Webhook Register\n');

  let secret;
  try {
    const out = run('npx wrangler secret list 2>&1');
    // We can't read secret values, just check if token exists
    console.log('   Secret list retrieved.');
  } catch {
    console.log('   ⚠️ Cannot list secrets; continuing anyway.');
  }

  const urlOut = run('npx wrangler deploy --dry-run 2>&1 || npx wrangler status 2>&1');
  const m = urlOut.match(/https:\/\/[a-z0-9\-]+\.workers\.dev/);
  const workerUrl = m ? m[0] : '';
  if (!workerUrl) {
    console.error('❌ نتوانستیم آدرس Worker پیدا کنیم.');
    process.exit(1);
  }

  console.log('   Worker URL: ' + workerUrl);

  const base = workerUrl.replace(/\/$/, '');
  console.log('\n   مسیر وبهوک: ' + base + '/telegram/webhook/<secret>');
  console.log('\n   مراحل:');
  console.log('   1. توکن ربات را در پنل ادمین (/admin → تلگرام) ذخیره کنید.');
  console.log('   2. secret وبهوک را در پنل ادمین generating کنید.');
  console.log('   3. دکمهٔ «ثبت وبهوک» را بزنید.');
  console.log('\n   یا به‌صورت دستی با curl:');
  console.log('   curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \\');
  console.log('     -d url=' + base + '/telegram/webhook/<SECRET> \\');
  console.log('     -d secret_token=<SECRET>');
  console.log('\n✅ انجام شد.\n');
}

main().catch((e) => {
  console.error('❌', String(e.message || e).slice(0, 500));
  process.exit(1);
});
