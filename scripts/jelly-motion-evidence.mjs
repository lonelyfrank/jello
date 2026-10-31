/** Actual M6.3 SVG renderer captures at injected times; browser video uses live RAF.
 * Requires Vite on localhost:4178. No generated animation or alternate renderer. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import { chromium, firefox } from '@playwright/test';
const dir = new URL('../docs/screenshots/jelly-m63/', import.meta.url);
mkdirSync(dir,{recursive:true});
const results=[];
for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]) {
  const browser=await engine.launch();
  const context=await browser.newContext({viewport:{width:1400,height:1100},deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  await page.goto('http://127.0.0.1:4178/tests/fixtures/jelly/');await page.waitForFunction(()=>!!window.jellyFixture);
  const staticCapture=await page.locator('#preset-matrix').screenshot();
  writeFileSync(new URL(`${name}-static-baseline.png`,dir),staticCapture);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.evaluate(()=>{window.jellyFixture.stopDiagnostics();for(const s of window.jellyFixture.surfaces)s.destroy();});
  await page.addStyleTag({content:'#fixture > :not(#capture-scene) { display:none } #capture-scene { width:320px;height:140px; }'});
  const times=[0,80,240,450,530,610,690,1800];
  const sequences=[];
  for(const preset of [0,2]) for(const geometry of ['main','small']) {
    const rows=[];
    for(const contact of [{x:.5,y:.5},{x:.95,y:.25}]) {
      await page.evaluate(({preset,geometry})=>{window.jellyCapture=window.jellyFixture.capture(window.jellyFixture.presets[preset].doc,geometry);},{preset,geometry});
      const frames=[],samples=[];
      for(const t of times) {
        const motion=await page.evaluate(({t,contact})=>{
          const c=window.jellyCapture;c.advance(t);
          if(t===450)c.surface.setPressed(false);
          return c.surface.motion;
        },{t,contact});
        frames.push((await page.locator('#capture-scene').screenshot()).toString('base64'));
        samples.push({t,x:motion.x,v:motion.v,target:motion.target});
        if(t===0)await page.evaluate(contact=>window.jellyCapture.surface.setPressed(true,contact),contact);
      }
      rows.push({contact,frames});sequences.push({preset,geometry,contact,samples});
      await page.evaluate(()=>window.jellyCapture.destroy());
    }
    const sheet=await browser.newPage({viewport:{width:2560,height:340},deviceScaleFactor:1});
    await sheet.setContent(`<body style="margin:0;background:#eee;font:12px system-ui"><div style="display:grid;grid-template-columns:repeat(8,320px)">${rows.map(row=>row.frames.map((data,i)=>`<div style="height:170px;background:white"><div style="padding:4px">${preset===0?'Soft':'Candy'} ${geometry==='main'?'240×64':'96×48'} · ${times[i]}ms · contact ${row.contact.x},${row.contact.y}</div><img width="320" height="140" src="data:image/png;base64,${data}"></div>`).join('')).join('')}</div>`);
    await sheet.screenshot({path:new URL(`${name}-${preset===0?'soft':'candy'}-${geometry}-filmstrip.png`,dir).pathname});await sheet.close();
  }
  // Static preferences are captured from the same SVG/CSS renderer and same timing API.
  const fallbacks=[];
  for(const mode of ['reduced','static','css','opaque']) {
    await page.emulateMedia({reducedMotion:mode==='reduced'?'reduce':'no-preference'});
    await page.evaluate(mode=>{
      const doc=structuredClone(window.jellyFixture.soft);
      if(mode==='static')doc.quality.profile='static';if(mode==='css')doc.target.backend='css';if(mode==='opaque')doc.target.fallback='opaque';
      window.jellyCapture=window.jellyFixture.capture(doc);window.jellyCapture.surface.setPressed(true);window.jellyCapture.advance(240);
    },mode);
    fallbacks.push({mode,motion:await page.evaluate(()=>window.jellyCapture.surface.motion),status:await page.evaluate(()=>window.jellyCapture.surface.status)});
    await page.locator('#capture-scene').screenshot({path:new URL(`${name}-${mode}.png`,dir).pathname});
    await page.evaluate(()=>window.jellyCapture.destroy());
  }
  await page.emulateMedia({reducedMotion:'no-preference'});
  // A continuous real-time 60Hz browser recording, including repeated lateral contact.
  await context.close();
  const videoContext=await browser.newContext({viewport:{width:1400,height:1100},deviceScaleFactor:1,recordVideo:{dir:dir.pathname,size:{width:700,height:550}}});
  const live=await videoContext.newPage();
  live.on('pageerror',e=>errors.push(e.message));live.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  await live.goto('http://127.0.0.1:4178/tests/fixtures/jelly/');await live.waitForFunction(()=>!!window.jellyFixture);
  await live.addStyleTag({content:'#fixture > :not(.workbench) { display:none } #controls,#status,#error {display:none} .workbench {display:block}'});
  await live.evaluate(()=>window.jellyFixture.primary.surface.update(window.jellyFixture.presets[2].doc));
  const host=live.locator('#primary-button'),box=await host.boundingBox();
  await live.mouse.move(box.x+box.width/2,box.y+box.height/2);await live.mouse.down();await live.waitForTimeout(450);await live.mouse.up();await live.waitForTimeout(160);
  await live.mouse.move(box.x+box.width*.92,box.y+box.height*.3);await live.mouse.down();await live.waitForTimeout(90);await live.mouse.up();await live.waitForTimeout(1200);
  const video=live.video();await videoContext.close();await video.saveAs(new URL(`${name}-live.webm`,dir).pathname);await video.delete();
  results.push({browser:name,version:browser.version(),viewport:'1400×1100',dpr:1,build:'Vite development, local installed dependencies',sequences,fallbacks,errors});
  await browser.close();
}
writeFileSync(new URL('evidence.json',dir),JSON.stringify({platform:platform(),kernel:release(),cpu:cpus()[0]?.model,results},null,2)+'\n');
