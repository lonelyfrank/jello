import { expect, it } from 'vitest';
import { JellyCoordinator, type JellyParticipant } from '../../src/runtime/experimental/jelly-scheduler';
import { defaultJellyParams, splitJellyParams } from '../../src/model/experimental/jelly';
import { initJellyMotion, evolveJellyMotion, jellyMotionSettled, pressJellyMotion } from '../../src/model/experimental/jelly-motion';
function fake() {
  let time=0,id=0; const callbacks=new Map<number,(t:number)=>void>();
  const coordinator=new JellyCoordinator({ now:()=>time, request:(cb)=>{ callbacks.set(++id,cb);return id; },cancel:(key)=>{callbacks.delete(key);} });
  return {coordinator,callbacks,advance:(t:number)=>{time=t;const batch=[...callbacks.values()];callbacks.clear();batch.forEach(cb=>cb(t));}};
}
it('shares exactly one RAF, stops at settle/hold and restarts for release',()=>{
  const f=fake(); expect(f.callbacks.size).toBe(0);
  const b=splitJellyParams(defaultJellyParams()).behavior;
  let s=pressJellyMotion(initJellyMotion(b),true,0);
  const a={frame:(t:number)=>{s=evolveJellyMotion(s,t);return !jellyMotionSettled(s);}};
  const other={frame:()=>false};
  f.coordinator.add(a);f.coordinator.add(other);f.coordinator.add(a);expect(f.callbacks.size).toBe(1);
  for(let t=16;t<3000;t+=16) {expect(f.callbacks.size).toBeLessThanOrEqual(1);f.advance(t);}
  expect(f.coordinator.status).toMatchObject({active:0,pending:false});
  const frames=f.coordinator.status.frames;f.advance(4000);expect(f.coordinator.status.frames).toBe(frames);
  s=pressJellyMotion(s,false,4000);f.coordinator.add(a);expect(f.callbacks.size).toBe(1);
  for(let t=4016;t<7000;t+=16) f.advance(t);
  expect(f.coordinator.status.active).toBe(0);
});
it('removes cancelled/suspended participants without destroying other owners, cleanup is idempotent',()=>{
  const f=fake();let calls=0;const a={frame:()=>{calls++;return true;}},b={frame:()=>true};
  f.coordinator.add(a);f.coordinator.add(b);f.coordinator.remove(a);f.advance(16);expect(calls).toBe(0);expect(f.coordinator.status.active).toBe(1);
  f.coordinator.remove(b);expect(f.callbacks.size).toBe(0);f.advance(600000);expect(calls).toBe(0);
  f.coordinator.add(a);f.advance(600016);expect(calls).toBe(1);
  f.coordinator.destroy();f.coordinator.destroy();f.coordinator.add(a);f.advance(600032);expect(calls).toBe(1);expect(f.callbacks.size).toBe(0);
});
it('handles destroy and removal from inside callbacks without late calls',()=>{
  const f=fake();let calls=0;const b={frame:()=>{calls++;return true;}};
  const a:JellyParticipant={frame:()=>{f.coordinator.remove(b);f.coordinator.destroy();return true;}};
  f.coordinator.add(a);f.coordinator.add(b);f.advance(16);expect(calls).toBe(0);expect(f.callbacks.size).toBe(0);
});
