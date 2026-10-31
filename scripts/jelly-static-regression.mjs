/** Compare M6.2 and M6.3 at rest in the SAME host/pixel grid. Historical catalog
 * screenshots have a different page layout and cannot prove pixel equality. */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { chromium, firefox } from '@playwright/test';
import { PNG } from 'pngjs';
const baseline='a112627c909e4710285b44d47349dd4058d03855';
const visual='src/model/experimental/jelly-m62-baseline.ts',runtime='src/runtime/experimental/jelly-m62-baseline.ts';
if(existsSync(visual)||existsSync(runtime))throw new Error('Temporary baseline path already exists');
const results=[];
try {
  writeFileSync(visual,execFileSync('git',['show',`${baseline}:src/model/experimental/jelly-visual.ts`]));
  writeFileSync(runtime,execFileSync('git',['show',`${baseline}:src/runtime/experimental/jelly.ts`],{encoding:'utf8'}).replace("'../../model/experimental/jelly-visual'","'../../model/experimental/jelly-m62-baseline'"));
  for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]) {
    const browser=await engine.launch();
    try {
      const page=await browser.newPage({viewport:{width:1400,height:1100},deviceScaleFactor:1});
      await page.goto('http://127.0.0.1:4178/tests/fixtures/jelly/');await page.waitForFunction(()=>!!window.jellyFixture);
      await page.evaluate(()=>{window.jellyFixture.stopDiagnostics();window.jellyFixture.surfaces.forEach(s=>s.destroy());});
      await page.addStyleTag({content:'#fixture > :not(#capture-scene) {display:none}'});
      for(let preset=0;preset<4;preset++)for(const geometry of ['main','small','capsule']) {
        await page.evaluate(({preset,geometry})=>{window.jellyCapture=window.jellyFixture.capture(window.jellyFixture.presets[preset].doc,geometry);},{preset,geometry});
        const current=PNG.sync.read(await page.locator('#capture-scene').screenshot());
        await page.evaluate(async(preset)=>{
          const c=window.jellyCapture;c.surface.destroy();
          const old=await import('/src/runtime/experimental/jelly-m62-baseline.ts');
          window.jellyOld=old.attachExperimentalJelly(c.host,window.jellyFixture.presets[preset].doc);
        },preset);
        const old=PNG.sync.read(await page.locator('#capture-scene').screenshot());
        let differing=0,maxDifference=0;
        for(let i=0;i<current.data.length;i++){const d=Math.abs(current.data[i]-old.data[i]);if(d)differing++;maxDifference=Math.max(maxDifference,d);}
        results.push({browser:name,preset,geometry,sameDimensions:current.width===old.width&&current.height===old.height,differingChannels:differing,maxDifference});
        await page.evaluate(()=>{window.jellyOld.destroy();window.jellyCapture.destroy();});
      }
    } finally {await browser.close();}
  }
  writeFileSync(new URL('../docs/screenshots/jelly-m63/static-regression.json',import.meta.url),JSON.stringify({baseline,method:'same DOM host and pixel grid, original renderer loaded from git object; default state',results},null,2)+'\n');
  if(results.some(r=>!r.sameDimensions||r.differingChannels))throw new Error('Static renderer pixel regression');
} finally {
  if(existsSync(visual))unlinkSync(visual);if(existsSync(runtime))unlinkSync(runtime);
}
