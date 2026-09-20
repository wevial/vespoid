import {chromium} from '@playwright/test';
import {prepareDataset,exportState} from '../src/lib/review-core';
import assert from 'node:assert/strict';
const base=process.env.REVIEW_BASE||'http://127.0.0.1:4317';const live=base.startsWith('https');
const headers={'CF-Access-Client-Id':process.env.VESPOID_CF_ACCESS_CLIENT_ID!,'CF-Access-Client-Secret':process.env.VESPOID_CF_ACCESS_CLIENT_SECRET!};
const broker=await fetch('https://jobs.weevil.sh/api/auth/convex-token',{headers,redirect:'manual'});assert.equal(broker.status,200);const {token}=await broker.json();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000},extraHTTPHeaders:live?headers:{'cf-access-jwt-assertion':token},acceptDownloads:true});
let writes=0,blockedTelemetry=0;await context.route('**/*',route=>{if(route.request().method()!=='GET'&&route.request().method()!=='HEAD'){if(new URL(route.request().url()).pathname==='/cdn-cgi/rum')blockedTelemetry++;else writes++;return route.abort();}return route.continue();});
const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
const progress=async(n:number)=>{await page.getByText(`${n} / 84 reviewed`,{exact:true}).waitFor();};
try{
 const r=await page.goto(base+'/review');assert.equal(r?.status(),200);await progress(0);
 const response=await context.request.get(base+'/api/review/dataset');assert.equal(response.status(),200);assert.match(response.headers()['cache-control'],/no-store/);
 const dataset=await prepareDataset(await response.json());assert.equal(dataset.records.length,84);assert.equal(dataset.sample_fingerprint,'692bde5f842cff69f187cf955d8ee16b5988a981b03f9241ec0a499665be1da9');
 assert(await page.getByLabel('Full stored description').textContent().then(t=>t?.includes(dataset.records[0].description)));
 await page.keyboard.press('ArrowLeft');await progress(1);await page.keyboard.press('ArrowUp');await progress(2);await page.keyboard.press('ArrowDown');await progress(3);await page.keyboard.press('z');await progress(2);await page.keyboard.press('ArrowDown');await progress(3);await page.keyboard.press('ArrowRight');await progress(4);
 await page.reload();await progress(4);
 const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON',exact:true}).click();const download=await dl;const path=await download.path();const feedback=await Bun.file(path!).json();assert.deepEqual(feedback.labels.slice(0,5).map((x:any)=>[x.status,x.label]),[['labeled','not_good_fit'],['labeled','neutral'],['skipped',null],['labeled','good_fit'],['unlabeled',null]]);
 await page.getByRole('article').focus();await page.keyboard.down('ArrowRight');await page.keyboard.down('ArrowRight');await page.keyboard.up('ArrowRight');await progress(5);await page.keyboard.press('Control+ArrowLeft');await progress(5);
 await page.evaluate(()=>{const input=document.createElement('input');input.id='qa-input';document.querySelector('main')!.append(input);input.focus();});await page.keyboard.press('ArrowRight');await page.keyboard.press('z');await progress(5);await page.evaluate(()=>document.querySelector('#qa-input')!.remove());
 page.on('dialog',d=>d.accept());await page.getByLabel('Import review JSON').setInputFiles({name:'resume.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(feedback))});await progress(4);
 const complete=exportState(dataset,dataset.records.map((row,i)=>({type:'skip',sample_id:row.sample_id,event_id:`completion-${i}`,timestamp:new Date().toISOString()})));
 await page.getByLabel('Import review JSON').setInputFiles({name:'completion.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(complete))});await progress(84);await page.keyboard.press('z');await progress(83);await page.getByRole('button',{name:/Skip \/ can’t judge/}).click();await progress(84);
 await page.getByLabel('Import review JSON').setInputFiles({name:'resume.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(feedback))});await progress(4);
 for(const width of [1440,320]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${process.env.REVIEW_EVIDENCE_DIR||process.env.TMPDIR}/vespoid-review-${live?'live':'local'}-${width}.png`,fullPage:true});}
 await page.evaluate(()=>localStorage.clear());await context.close();
 const failure=await browser.newContext({extraHTTPHeaders:live?headers:{'cf-access-jwt-assertion':token}});await failure.route('**/*',route=>route.request().method()==='GET'?route.continue():route.abort());await failure.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('QA quota','QuotaExceededError');};});const fp=await failure.newPage();await fp.goto(base+'/review');await fp.getByText('0 / 84 reviewed',{exact:true}).waitFor();await fp.getByText('Memory-only — export before leaving.').waitFor();await fp.keyboard.press('ArrowDown');await fp.getByText('1 / 84 reviewed',{exact:true}).waitFor();let confirm=false;fp.on('dialog',async d=>{confirm=true;await d.dismiss();});await fp.getByRole('link',{name:'Dashboard',exact:true}).click();assert(confirm);assert.equal(new URL(fp.url()).pathname,'/review');await failure.close();
 assert.equal(writes,0);assert.deepEqual(errors,[]);console.log(JSON.stringify({base,count:84,fingerprint:dataset.sample_fingerprint,keyboardSkipUndoReloadExportImportCompletion:true,repeatEditableGuards:true,storageFailureNavigationGuard:true,widths:[1440,320],appWrites:writes,blockedTelemetry,errors},null,2));
}finally{await browser.close();}
