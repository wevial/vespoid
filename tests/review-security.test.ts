import {test,expect} from 'bun:test';
import {serveReviewDataset} from '../src/lib/review-server';
test('dataset loader is unreachable without verified server authorization',async()=>{
 let loads=0,calls=0;const load=async()=>{loads++;return {records:['private sentinel']};};
 const verify=async(token:string)=>{calls++;if(token!=='verified')throw Error('Invalid JWT/identity');};
 for(const token of [null,'forged']){const r=await serveReviewDataset(new Headers(token?{'cf-access-jwt-assertion':token}:{}),verify,load);expect(r.status).toBe(401);expect(await r.text()).not.toContain('sentinel');}
 expect(loads).toBe(0);expect(calls).toBe(1);
 const good=await serveReviewDataset(new Headers({'cf-access-jwt-assertion':'verified'}),verify,load);expect(good.status).toBe(200);expect(loads).toBe(1);expect(good.headers.get('cache-control')).toContain('no-store');
});
test('client identity hints cannot authorize and backend failures fail closed',async()=>{
 let loaded=false;const r=await serveReviewDataset(new Headers({'cf-access-authenticated-user-email':'ko@kvial.com','authorization':'Bearer fake'}),async()=>{},async()=>{loaded=true;return {};});expect(r.status).toBe(401);expect(loaded).toBe(false);
 const failed=await serveReviewDataset(new Headers({'cf-access-jwt-assertion':'expired'}),async()=>{throw Error('backend unavailable');},async()=>{loaded=true;return {};});expect(failed.status).toBe(401);expect(loaded).toBe(false);
});
