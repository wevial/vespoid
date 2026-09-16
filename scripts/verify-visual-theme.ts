// Run against an isolated production build on 127.0.0.1:3197 with
// NEXT_PUBLIC_CONVEX_URL=https://fixture.invalid. All API and listing traffic is
// intercepted below; unexpected external requests fail closed. Never point this
// harness at a live app. Run: bun run scripts/verify-visual-theme.ts
// Override screenshot destination with VISUAL_EVIDENCE_DIR.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const out = process.env.VISUAL_EVIDENCE_DIR || '/srv/dev/hermes-scratch/vespoid-retroma-evidence/consistency';
await mkdir(out, {recursive:true});
const browser = await chromium.launch({headless:true});
const context = await browser.newContext({viewport:{width:1440,height:1100}});
const jobs = [
 { _id:'fixture-fern',title:'Senior Product Engineer',company:'Fern Studio',location:'Remote, US',source:'company_board',salaryRange:'$180,000–$220,000',remoteStatus:'Remote',fitScore:92,personalizedScore:95,fitReasons:['Product engineering','Salary match'],preferenceReasons:['Small, thoughtful team'],descriptionPreview:'Build useful tools with a small team that cares about the details. Own the experience from first sketch to a considered, dependable product.'},
 { _id:'fixture-orbit',title:'Design Systems Engineer',company:'Orbit Works',location:'San Francisco, CA',source:'yc',salaryRange:'$175,000–$210,000',remoteStatus:'Hybrid',fitScore:88,personalizedScore:90,fitReasons:['Frontend systems'],preferenceReasons:['Craft-led product'],descriptionPreview:'Help a growing design team make complex software feel simple. Work across accessible components, thoughtful interactions, and developer experience.'},
 { _id:'fixture-meadow',title:'Staff Software Engineer',company:'Meadow Labs',location:'Seattle, WA',source:'hn',salaryRange:'$200,000–$250,000',remoteStatus:'Remote',fitScore:85,personalizedScore:88,fitReasons:['Platform engineering'],preferenceReasons:[],descriptionPreview:'Build the foundations for a calmer, more connected workday. A hands-on role spanning platform architecture and product delivery.'}
].map(j=>({...j,url:'https://listing.fixture.invalid/'+j._id,isActive:true,discoveredAt:'2026-09-14T12:00:00Z'}));
let application = {status:'saved', notes:''};
const requests: {path:string; args:Record<string, unknown>}[]=[];const errors:string[]=[];
await context.route('**/*',async route=>{
 const u=new URL(route.request().url());
 if(u.pathname==='/api/auth/convex-token')return route.fulfill({json:{token:'fixture-only-not-a-credential'}});
 if(u.hostname==='fixture.invalid'){
  const body=route.request().postDataJSON();requests.push(body);
  let value:unknown;
  if(body.path==='jobs:statusCounts')value={unread:18,totalApplications:12,applied:7,screen:2,interview:1};
  else if(body.path==='jobs:listRecentJobCards')value=jobs.map((job,index)=>({...job,applicationStatus:index===0?'saved':null}));
  else if(body.path==='jobs:listWeeklyRecommendations')value=[{area:'remote',label:'Remote',jobs:jobs.slice(0,2)},{area:'seattle',label:'Seattle',jobs:jobs.slice(2)}];
  else if(body.path==='jobs:listJobCards')value={page:body.args.paginationOpts.cursor?[]:jobs,isDone:!!body.args.paginationOpts.cursor,continueCursor:body.args.paginationOpts.cursor?'':'fixture-page-2'};
  else if(body.path==='applications:setStatus'){application={...application,status:body.args.status};value=null;}
  else if(body.path==='applications:updateNotes'){application={...application,notes:body.args.notes};value=null;}
  else if(body.path==='jobs:getJobWithApplication')value={job:{...jobs[0],title:'Forward Deployed Engineer (FDE) – Seattle',description:jobs[0].descriptionPreview.repeat(20),availabilityCheckedAt:new Date().toISOString(),availabilityStatus:'open'},application};
  else throw new Error('Unmocked Convex path '+body.path);
  return route.fulfill({json:{status:'success',value}});
 }
 if(u.hostname==='listing.fixture.invalid')return route.fulfill({contentType:'text/html',body:'<body style="font-family:system-ui;padding:24px;background:#e0f8fa;color:#30264d"><h2>Fixture listing</h2><p>Local preview only. No live employer page or data.</p></body>'});
 if(u.hostname==='127.0.0.1' && u.port==='3197' && !u.pathname.startsWith('/api/'))return route.continue();
 errors.push('Blocked external request '+u.origin+u.pathname);return route.abort();
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
async function label(){await page.addStyleTag({content:'nextjs-portal { display: none !important; }'});await page.evaluate(()=>{const b=document.createElement('div');b.textContent='FIXTURE PREVIEW · synthetic listings · no live data';b.style.cssText='position:fixed;bottom:10px;left:10px;z-index:9999;background:#382d38;color:#fff;padding:8px 12px;border-radius:8px;font:12px system-ui;pointer-events:none';document.body.append(b);});}
async function tones() {
 const values = await page.locator('.vespoid-status').evaluateAll(els=>els.map(el=>{
  const style=getComputedStyle(el);
  const probe=document.createElement('span');probe.style.backgroundColor=style.getPropertyValue('--status-tone');document.body.append(probe);
  const expected=getComputedStyle(probe).backgroundColor;probe.remove();
  return {status:el.getAttribute('data-status'),actual:style.backgroundColor,expected};
 }));
 expect(values.length).toBeGreaterThan(0);
 for(const value of values){expect(value.actual).toBe(value.expected);expect(value.actual).not.toBe('rgba(0, 0, 0, 0)');}
}
async function detailChecks() {
 await tones();
 const colors=await page.locator('aside .vespoid-status').evaluateAll(els=>els.map(el=>getComputedStyle(el).backgroundColor));
 expect(new Set(colors).size).toBe(7);
 const link=page.getByRole('link',{name:'Open listing ↗',exact:true});
 const line=await link.evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);return {lines:r.getClientRects().length,nowrap:getComputedStyle(el).whiteSpace,right:el.getBoundingClientRect().right};});
 expect(line.lines).toBe(1);expect(line.nowrap).toBe('nowrap');expect(line.right).toBeLessThanOrEqual(await page.evaluate(()=>innerWidth));
 const layers=await page.evaluate(()=>['body','.vespoid-detail','.vespoid-inset','.vespoid-tag'].map(s=>getComputedStyle(document.querySelector(s)!).backgroundColor));
 expect(new Set(layers).size).toBe(4);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(()=>innerWidth));
 const selected=page.locator('aside [aria-pressed="true"]');await expect(selected).toHaveCount(1);
 const marker=await selected.evaluate(el=>({content:getComputedStyle(el,'::before').content,shadow:getComputedStyle(el).boxShadow}));
 expect(marker.content).toContain('✓');expect(marker.shadow).toContain('inset');
 await page.keyboard.press('Tab');await selected.focus();expect(await selected.evaluate(el=>getComputedStyle(el).outlineWidth)).toBe('3px');
}
const phase=process.argv[2]||'after';
await page.goto('http://127.0.0.1:3197/');await page.getByText('Recommendations').waitFor();await tones();await expect(page.locator('[data-status="saved"][aria-pressed="true"]')).toHaveCount(1);await label();await page.screenshot({path:`${out}/${phase}-dashboard-desktop.png`,fullPage:true});
await page.goto('http://127.0.0.1:3197/jobs');await page.getByText('Senior Product Engineer',{exact:true}).waitFor();await label();await page.screenshot({path:`${out}/${phase}-jobs-desktop.png`,fullPage:true});
if(phase==='after'){
 await tones();
 await page.getByRole('link',{name:'Vespoid home',exact:true}).focus();
 const navFocus=await page.getByRole('link',{name:'Vespoid home',exact:true}).evaluate(el=>({width:getComputedStyle(el).outlineWidth,color:getComputedStyle(el).outlineColor}));
 if(navFocus.width!=='3px'||navFocus.color!=='rgb(37, 27, 60)')throw new Error('Nav focus contrast mismatch: '+JSON.stringify(navFocus));
 console.log('Verified navigation focus:',navFocus);
 await page.getByRole('textbox',{name:'Search',exact:true}).focus();
 const focus=await page.getByRole('textbox',{name:'Search',exact:true}).evaluate(el=>({width:getComputedStyle(el).outlineWidth,color:getComputedStyle(el).outlineColor}));
 if(focus.width!=='3px')throw new Error('Input focus not visible: '+JSON.stringify(focus));
 await page.getByRole('combobox',{name:'Source',exact:true}).selectOption('yc');
 await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('unread');
 await page.getByRole('textbox',{name:'Working style',exact:true}).fill('remote');
 await page.getByRole('textbox',{name:'Search',exact:true}).fill('Engineer');
 await page.getByRole('combobox',{name:'Sort jobs'}).selectOption('date-desc');
 await page.waitForFunction(()=>location.search.includes('q=Engineer'));
 await page.getByRole('button',{name:'Preview',exact:true}).first().click();await page.getByRole('button',{name:'Close preview panel'}).waitFor();await page.waitForFunction(()=>{const r=document.getElementById('job-preview-panel')!.getBoundingClientRect();return Math.abs(r.right-innerWidth)<2;});await page.screenshot({path:`${out}/after-job-preview-desktop.png`,fullPage:true});await page.getByRole('button',{name:'Close preview panel'}).click();
 await page.getByRole('button',{name:/Load 25 more/}).click();await page.getByRole('button',{name:/Load 25 more/}).waitFor({state:'detached'});
 await page.getByRole('combobox',{name:'Filter by area'}).selectOption('seattle');await page.waitForFunction(()=>location.search.includes('area=seattle'));
 await page.getByRole('button',{name:'Save',exact:true}).first().click();await page.getByText('Senior Product Engineer',{exact:true}).waitFor({state:'detached'});
 for(const action of ['Applied','Archive']) {await page.getByRole('button',{name:action,exact:true}).first().click();}
 for(const status of ['saved','applied','archived'])if(!requests.some(r=>r.path==='applications:setStatus'&&r.args.status===status))throw new Error(status+' payload not preserved');
 if(!requests.some(r=>r.path==='jobs:listJobCards'&&r.args.search==='Engineer'&&r.args.source==='yc'&&r.args.status==='unread'&&r.args.remoteStatus==='remote'))throw new Error('Filter payload not preserved');
 await page.goto('http://127.0.0.1:3197/jobs/fixture-fern');await page.getByText('Pipeline status',{exact:true}).waitFor();
 await detailChecks();
 await page.getByRole('button',{name:'Interview',exact:true}).click();await expect(page.getByText('Current: Interview',{exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'Notes',exact:true}).fill('Fixture interview notes');await page.getByRole('button',{name:'Save notes',exact:true}).click();
 await expect(page.getByRole('button',{name:'Save notes',exact:true})).toBeEnabled();
 expect(requests.some(r=>r.path==='applications:updateNotes'&&r.args.notes==='Fixture interview notes')).toBe(true);
 await page.getByRole('button',{name:'See more',exact:true}).click();await expect(page.getByRole('button',{name:'See less',exact:true})).toBeVisible();await page.getByRole('button',{name:'See less',exact:true}).click();
 await label();await page.screenshot({path:`${out}/after-detail-desktop.png`,fullPage:true});
 for(const width of [320,390,768,1024,1320]){await page.setViewportSize({width,height:900});await detailChecks();}
 await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:3197/');await page.getByText('Recommendations').waitFor();await label();await page.screenshot({path:`${out}/after-dashboard-mobile.png`,fullPage:true});
 await page.goto('http://127.0.0.1:3197/jobs');await page.getByText('Senior Product Engineer',{exact:true}).waitFor();await label();await page.screenshot({path:`${out}/after-jobs-mobile.png`,fullPage:true});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Mobile horizontal overflow');
 await page.getByText('Senior Product Engineer',{exact:true}).click();await page.getByText('Pipeline status',{exact:true}).waitFor();await detailChecks();await label();await page.screenshot({path:`${out}/after-detail-mobile.png`,fullPage:true});
}
console.log(JSON.stringify({phase,out,requests:requests.map(r=>({path:r.path,args:r.args})),errors},null,2));await browser.close();if(errors.length)process.exitCode=1;
