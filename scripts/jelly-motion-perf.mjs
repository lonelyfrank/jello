/** Isolated real-RAF scene. Catalog destroyed, diagnostics stopped. Dev Vite build.
 * CPU callback time is measured separately from browser frame interval/paint. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import { chromium, firefox } from '@playwright/test';
const dir=new URL('../docs/screenshots/jelly-m63/',import.meta.url);mkdirSync(dir,{recursive:true});
const results=[];
for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]) {
  const browser=await engine.launch();const page=await browser.newPage({viewport:{width:1400,height:1100},deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:4178/tests/fixtures/jelly/');await page.waitForFunction(()=>!!window.jellyFixture);
  const cases=[];
  for(const count of [1,12]) cases.push(await page.evaluate(async(count)=>{
    const api=window.jellyFixture;api.stopDiagnostics();api.surfaces.forEach(s=>s.destroy());
    document.getElementById('fixture').style.display='none';
    const scene=document.createElement('section');scene.style.cssText='display:grid;grid-template-columns:repeat(4,260px);gap:20px;padding:50px';document.body.prepend(scene);
    const surfaces=[];for(let i=0;i<count;i++) {
      const host=document.createElement('button');host.className='test-button';host.innerHTML='<span class="button-content">Jelly</span>';scene.append(host);
      surfaces.push(api.attach(host,api.presets[2].doc,{},api.coordinator));
    }
    await new Promise(r=>setTimeout(r,100));
    let inFrame=false,layoutReads=0;const durations=[],intervals=[],longTasks=[];
    const original=Element.prototype.getBoundingClientRect, originalOffsetWidth=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'offsetWidth'), originalOffsetHeight=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'offsetHeight');
    Element.prototype.getBoundingClientRect=function(){if(inFrame)layoutReads++;return original.call(this);};
    for(const [key,descriptor] of [['offsetWidth',originalOffsetWidth],['offsetHeight',originalOffsetHeight]]) Object.defineProperty(HTMLElement.prototype,key,{...descriptor,get(){if(inFrame)layoutReads++;return descriptor.get.call(this);}});
    const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));
    const longTaskSupported=PerformanceObserver.supportedEntryTypes.includes('longtask');if(longTaskSupported)observer.observe({type:'longtask'});
    const framesBefore=api.coordinator.status.frames, idleStart=performance.now();
    await new Promise(r=>setTimeout(r,300));
    const idleFrames=api.coordinator.status.frames-framesBefore,idleDuration=performance.now()-idleStart;
    let previous=null;
    // Wrap the coordinator participant entry, not requestAnimationFrame itself.
    for(const s of surfaces) {
      const frame=s.frame.bind(s);
      s.frame=(time)=>{const start=performance.now();inFrame=true;try{return frame(time);}finally{inFrame=false;durations.push(performance.now()-start);if(previous!==time){if(previous!==null)intervals.push(time-previous);previous=time;}}};
    }
    const before=api.coordinator.status, start=performance.now();surfaces.forEach(s=>s.setPressed(true));
    const maximum=api.coordinator.status.active;
    await new Promise(r=>setTimeout(r,450));surfaces.forEach(s=>s.setPressed(false));
    while(api.coordinator.status.active && performance.now()-start<4000)await new Promise(r=>setTimeout(r,20));
    const elapsed=performance.now()-start,after=api.coordinator.status;
    const framesAtRest=after.frames;await new Promise(r=>setTimeout(r,250));const idleAfter=api.coordinator.status.frames-framesAtRest;
    observer.disconnect();Element.prototype.getBoundingClientRect=original;
    Object.defineProperty(HTMLElement.prototype,'offsetWidth',originalOffsetWidth);Object.defineProperty(HTMLElement.prototype,'offsetHeight',originalOffsetHeight);
    const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*p)]??0;};
    const result={count,elapsedMs:elapsed,idleDurationMs:idleDuration,idleFrames,idleAfter,maximumActive:maximum,frames:after.frames-before.frames,updates:durations.length,totalUpdateMs:durations.reduce((a,b)=>a+b,0),updateP95Ms:percentile(durations,.95),updateMaxMs:Math.max(...durations),frameIntervalP95Ms:percentile(intervals,.95),layoutReads,longTaskSupported,longTasks,final:after};
    surfaces.forEach(s=>s.destroy());scene.remove();return result;
  },count));
  results.push({browser:name,version:browser.version(),viewport:'1400×1100',dpr:1,cases});await browser.close();
}
writeFileSync(new URL('performance.json',dir),JSON.stringify({date:'2026-10-31',build:'Vite development (not production bundled)',platform:platform(),kernel:release(),cpu:cpus()[0]?.model,results},null,2)+'\n');
