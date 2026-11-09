// First: pnpm build && pnpm preview --port 5174
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{});
try {
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const base=(process.env.PWA_BASE_URL || 'http://127.0.0.1:5174').replace(/\/$/,'');
 await page.goto(base+'/');
 await page.evaluate(()=>Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Service worker no disponible')),15000))]));
 await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
 const cached=await page.evaluate(async()=>{const names=await caches.keys();const c=await caches.open(names.find(n=>n.startsWith('cordoba-shell-')));return (await c.keys()).map(r=>r.url)});
 assert(cached.some(u=>u.includes('/assets/')&&u.endsWith('.js')),'JavaScript no precargado');
 assert.equal(cached.filter(u=>u.includes('/fonts/')&&u.endsWith('.woff2')).length,4,'Las fuentes locales deben estar precargadas');
 assert(cached.every(u=>u.startsWith(base+'/')),'La caché debe contener solo recursos del frontend');
 await context.setOffline(true);await page.reload();
 await page.getByRole('button',{name:'Explorar demostración'}).click();
 await page.getByRole('heading',{name:/Hola,/}).waitFor();
 await page.evaluate(()=>document.fonts.ready);
 assert(await page.evaluate(()=>document.fonts.check('400 16px Mulish')&&document.fonts.check('400 16px "JetBrains Mono"')),'Las fuentes deben cargar sin conexión');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log(`OK PWA: ${cached.length} recursos públicos, recarga sin conexión y sin errores JavaScript.`);
}finally{await browser.close()}
