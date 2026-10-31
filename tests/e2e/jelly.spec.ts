import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/jelly/');
  await page.waitForFunction(() => !!window.jellyFixture);
});

test('semantic content, hit target, static states, focus and simultaneous SVG IDs', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => { if (e.type() === 'error') errors.push(e.text()); });
  const host = page.locator('#primary-button');
  await expect(host).toHaveText('Jelly');
  const before = await host.locator('.button-content').boundingBox();
  await host.click();
  await expect(host).toHaveAttribute('data-clicks', '1');
  const hitbox = await host.boundingBox();
  for (const state of ['hover', 'pressed', 'active', 'disabled', 'default']) {
    await page.selectOption('#state', state);
    expect(await host.locator('.button-content').boundingBox()).toEqual(before);
    expect(await host.boundingBox()).toEqual(hitbox);
  }
  await host.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(host).toBeFocused();
  expect(await host.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe('solid');
  expect(await page.evaluate(() => {
    const ids = [...document.querySelectorAll('.jelly-decoration [id]')].map((e) => e.id);
    const references = [...document.querySelectorAll('.jelly-decoration *')].flatMap((e) => [...e.attributes].flatMap((a) => [...a.value.matchAll(/url\(#([^)]*)\)/g)].map((m) => m[1])));
    return { unique: new Set(ids).size === ids.length, resolved: references.every((id) => !!document.getElementById(id!)), instances: document.querySelectorAll('.jelly-decoration > svg').length };
  })).toMatchObject({ unique: true, resolved: true });
  const distributions = await page.locator('#preset-matrix .test-button').evaluateAll((hosts) => hosts.slice(0, 4).map((host) => [...host.querySelectorAll('[data-bubble-index]')].map((e) => e.getAttribute('transform'))));
  expect(distributions.every((d) => JSON.stringify(d) === JSON.stringify(distributions[0]))).toBe(true);
  expect(errors).toEqual([]);
});

test('resize and hidden/reopened host retain bubble identity and do not schedule continuously', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { primary } = window.jellyFixture;
    const get = () => [...primary.host.querySelectorAll('[data-bubble-index]')].map((e) => ({ id: e.getAttribute('data-bubble-index'), position: e.getAttribute('transform') }));
    const before = get();
    const initial = primary.surface.status;
    primary.host.style.width = '600px';
    primary.surface.resize();
    const after = get();
    const resized = primary.surface.status;
    primary.host.style.display = 'none';
    primary.surface.resize();
    const hidden = primary.surface.status;
    primary.host.style.display = '';
    primary.host.style.width = '240px';
    primary.surface.resize();
    const restored = get();
    await new Promise((r) => setTimeout(r, 120));
    const settled = primary.surface.status.updates;
    await new Promise((r) => setTimeout(r, 160));
    return { before, after, restored, initial, resized, hidden, settled, idle: primary.surface.status.updates };
  });
  expect(result.after.map((e) => e.id).slice(0, result.before.length)).toEqual(result.before.map((e) => e.id));
  expect(result.after[0]!.position).not.toBe(result.before[0]!.position);
  expect(result.resized.distributions).toBe(result.initial.distributions);
  expect(result.hidden.suspended).toBe(true);
  expect(result.hidden.bubbles).toBe(0);
  expect(result.restored).toEqual(result.before);
  expect(result.idle).toBe(result.settled);
});

test('host radius, tiny capsules, wide proportions and decorative clipping are coherent', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { attach, soft } = window.jellyFixture;
    const host = document.createElement('button');
    host.style.cssText = 'width:480px;height:24px;background:transparent;border:0;position:relative';
    host.textContent = 'Host';
    document.body.append(host);
    const capsule = { ...soft, geometry: { ...soft.geometry, shape: 'capsule' as const } };
    const surface = attach(host, capsule, { radius: 3 });
    const radius = host.querySelector<HTMLElement>('.jelly-decoration')!.style.borderRadius;
    surface.update(capsule);
    // update without new options retains host radius. An explicit empty object clears it.
    surface.update(capsule, {});
    const capsuleRadius = host.querySelector<HTMLElement>('.jelly-decoration')!.style.borderRadius;
    host.style.width = '24px'; host.style.height = '24px';
    surface.resize();
    const path = host.querySelector('clipPath path')!.getAttribute('d');
    const clip = host.querySelector('[data-jelly-bubbles]')!.parentElement!.getAttribute('clip-path');
    const overflow = getComputedStyle(host.querySelector('.jelly-decoration > svg')!).overflow;
    surface.destroy(); host.remove();
    return { radius, capsuleRadius, path, clip, overflow };
  });
  expect(result.radius).toBe('3px');
  expect(result.capsuleRadius).toBe('12px');
  expect(result.path).not.toMatch(/NaN|Infinity/);
  expect(result.clip).toMatch(/^url\(#jello-jelly-\d+-clip\)$/);
  expect(result.overflow).toBe('visible');
});

test('bubbles off removes nodes and repeated optical updates preserve the deterministic pool', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { primary, soft } = window.jellyFixture;
    const circle = primary.host.querySelector('[data-bubble-index]');
    const distributions = primary.surface.status.distributions;
    for (const value of [0.1, 0.2, 0.3]) primary.surface.update({ ...soft, material: { ...soft.material, scattering: value } });
    const reused = circle === primary.host.querySelector('[data-bubble-index]');
    const noRegeneration = distributions === primary.surface.status.distributions;
    primary.surface.update({ ...soft, bubbles: { ...soft.bubbles, enabled: 'disabled' } });
    const disabled = primary.surface.status.bubbles;
    const nodes = primary.host.querySelectorAll('[data-bubble-index]').length;
    primary.surface.update({ ...soft, bubbles: { ...soft.bubbles, density: 0 } });
    return { reused, noRegeneration, disabled, nodes, zero: primary.surface.status.bubbles };
  });
  expect(result).toEqual({ reused: true, noRegeneration: true, disabled: 0, nodes: 0, zero: 0 });
});

test('static and idle lifecycle produce no console errors, observer loops or RAF work', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => { if (e.type() === 'error') errors.push(e.text()); });
  await page.addInitScript(() => {
    const original = window.requestAnimationFrame.bind(window);
    let count = 0;
    window.requestAnimationFrame = (callback) => { count++; return original(callback); };
    Object.defineProperty(window, 'jellyRAFCount', { get: () => count });
  });
  await page.reload();
  await page.waitForFunction(() => !!window.jellyFixture);
  const before = await page.evaluate(() => Reflect.get(window, 'jellyRAFCount'));
  await page.selectOption('#geometry', 'small');
  await page.selectOption('#param-profile', 'static');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => Reflect.get(window, 'jellyRAFCount'));
  expect(before).toBe(0);
  expect(after).toBe(0);
  expect(errors).toEqual([]);
});

test('updates are atomic, preserve nodes/input and honor caps, seed zero and fallback policy', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { primary, soft } = window.jellyFixture;
    const doc = structuredClone(soft);
    const before = JSON.stringify(doc);
    const text = primary.host.querySelector('.button-content');
    const image = primary.host.querySelector('.jelly-decoration > svg');
    primary.surface.update({ ...doc, bubbles: { ...doc.bubbles, seed: 0, density: 20 }, quality: { profile: 'high' } });
    const indices = () => [...primary.host.querySelectorAll('[data-bubble-index]')].map((e) => e.getAttribute('transform'));
    const high = indices();
    primary.surface.update({ ...doc, bubbles: { ...doc.bubbles, seed: 0, density: 20 }, quality: { profile: 'low' } });
    const low = indices();
    primary.surface.update({ ...doc, material: { ...doc.material, tint: '#aabbcc' } });
    const distributions = primary.surface.status.distributions;
    const html = primary.host.innerHTML;
    let rejected = false;
    try { primary.surface.update({ ...doc, bubbles: { ...doc.bubbles, radiusMin: 10, radiusMax: 1 } }, { opaque: true }); } catch { rejected = true; }
    const atomic = html === primary.host.innerHTML && !primary.surface.status.opaque;
    primary.surface.update(doc, { svgAvailable: false });
    const fallback = primary.surface.status;
    primary.surface.update(doc, { opaque: true });
    const opaque = primary.surface.status;
    return { rejected, atomic, high, low, distributions, fallback, opaque, sameText: text === primary.host.querySelector('.button-content'), sameSVG: image === primary.host.querySelector('.jelly-decoration > svg'), unchanged: before === JSON.stringify(doc) };
  });
  expect(result.high).toHaveLength(24);
  expect(result.low).toEqual(result.high.slice(0, 4));
  expect(result).toMatchObject({ rejected: true, atomic: true, sameText: true, sameSVG: true, unchanged: true });
  expect(result.fallback).toMatchObject({ requestedBackend: 'auto', backend: 'css', bubbles: 0 });
  expect(result.opaque).toMatchObject({ backend: 'css', effectiveAlpha: 1, effectiveTransmission: 0, bubbles: 0 });
});

test('repeated mount/destroy restores host-owned content, classes and styles with no late callbacks', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { attach, soft } = window.jellyFixture;
    const host = document.createElement('button');
    host.className = 'owned';
    host.style.cssText = 'width:96px;height:48px;color:red;--jelly-foreground:blue !important';
    host.setAttribute('aria-label', 'Originale');
    host.innerHTML = '<span>Originale</span>';
    document.body.append(host);
    const original = host.outerHTML;
    let callbacks = 0;
    for (let i = 0; i < 100; i++) {
      const surface = attach(host, soft);
      surface.onStatus(() => callbacks++);
      surface.destroy();
      surface.destroy();
      surface.update(soft);
      surface.setPressed(true);
      surface.resize();
    }
    await new Promise((r) => setTimeout(r, 100));
    const preserved = host.outerHTML === original;
    const external = attach(host, soft);
    host.style.setProperty('--jelly-foreground', 'green', 'important');
    host.style.backgroundColor = 'yellow';
    host.classList.add('added-by-host');
    const extra = document.createElement('span'); extra.textContent = 'Nuovo'; host.append(extra);
    external.destroy();
    const externalPreserved = host.style.getPropertyValue('--jelly-foreground') === 'green' && host.style.backgroundColor === 'yellow' && host.classList.contains('added-by-host') && extra.parentNode === host;
    // Also tolerate an initially hidden host, then ResizeObserver's first nonzero measurement.
    host.style.display = 'none';
    const surface = attach(host, soft);
    const hidden = surface.status.suspended;
    host.style.display = '';
    host.scrollIntoView(); // M6.3 offscreen surfaces stay suspended until visible.
    await new Promise((r) => setTimeout(r, 100));
    const reopened = !surface.status.suspended;
    surface.destroy(); host.remove();
    return { callbacks, preserved, externalPreserved, hidden, reopened };
  });
  expect(result).toEqual({ callbacks: 0, preserved: true, externalPreserved: true, hidden: true, reopened: true });
});

test('CSS, opaque, reduced preferences and forced colors keep content and focus usable', async ({ page }) => {
  await page.selectOption('#param-backend', 'css');
  await expect(page.locator('#primary-button .jelly-decoration')).toHaveAttribute('data-backend', 'css');
  await page.check('#transparency');
  expect(await page.evaluate(() => window.jellyFixture.primary.surface.status)).toMatchObject({ opaque: true, transparencyReduced: true });
  await page.uncheck('#transparency');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => window.jellyFixture.primary.surface.status.motionReduced)).toBe(true);
  await page.emulateMedia({ forcedColors: 'active' });
  await expect.poll(() => page.evaluate(() => window.jellyFixture.primary.surface.status.forcedColors)).toBe(true);
  expect(await page.evaluate(() => window.jellyFixture.primary.surface.status)).toMatchObject({ backend: 'css', opaque: true, effectiveAlpha: 1, effectiveTransmission: 0, bubbles: 0 });
  await page.locator('#primary-button').focus();
  await expect(page.locator('#primary-button')).toBeFocused();
  await expect(page.locator('#primary-button .button-content')).toHaveText('Jelly');
});

test('real pointer press settles while held, releases once, preserves content/focus/hitbox and reaches idle', async ({ page }) => {
  const host=page.locator('#primary-button');
  await host.focus();
  const hitbox=await host.boundingBox(), content=await host.locator('.button-content').boundingBox();
  const path=await host.locator('clipPath path').getAttribute('d');
  await page.mouse.move(hitbox!.x+hitbox!.width*.9,hitbox!.y+hitbox!.height*.5);
  await page.mouse.down();
  await expect.poll(()=>page.evaluate(()=>window.jellyFixture.primary.surface.motion.x)).toBeGreaterThan(.01);
  expect(await host.locator('clipPath path').getAttribute('d')).not.toBe(path);
  expect(await host.boundingBox()).toEqual(hitbox);expect(await host.locator('.button-content').boundingBox()).toEqual(content);
  await expect(host).toBeFocused();
  await expect.poll(()=>page.evaluate(()=>window.jellyFixture.coordinator.status.active)).toBe(0);
  const held=await page.evaluate(()=>window.jellyFixture.primary.surface.motion);
  expect(held.pressed).toBe(true);expect(held.contact.x).toBeCloseTo(.9,2);expect(held.x).toBeCloseTo(held.target,3);
  await page.mouse.up();await expect(host).toHaveAttribute('data-clicks','1');
  await expect.poll(()=>page.evaluate(()=>window.jellyFixture.coordinator.status.active)).toBe(0);
  expect(await host.locator('clipPath path').getAttribute('d')).toBe(path);
});

test('native Space/Enter keep semantics; repeat never adds material impulses',async({page})=>{
  const host=page.locator('#primary-button');await host.focus();
  await page.keyboard.down(' ');
  await page.waitForTimeout(80);
  const before=await page.evaluate(()=>window.jellyFixture.primary.surface.motion.target);
  await page.keyboard.down(' ');await page.keyboard.down(' ');
  expect(await page.evaluate(()=>window.jellyFixture.primary.surface.motion.target)).toBe(before);
  expect(await page.evaluate(()=>window.jellyFixture.primary.surface.motion.contact)).toEqual({x:.5,y:.5});
  await page.keyboard.up(' ');await expect(host).toHaveAttribute('data-clicks','1');
  await page.keyboard.press('Enter');await expect(host).toHaveAttribute('data-clicks','2');
  await expect.poll(()=>page.evaluate(()=>window.jellyFixture.coordinator.status.active)).toBe(0);
});

test('cancel, leave/outside release, lost capture, blur and disable reset without an impulse or an action',async({page})=>{
  const host=page.locator('#primary-button');const box=(await host.boundingBox())!;
  for(const kind of ['pointercancel','lostpointercapture','pointerleave','blur','disable']) {
    await host.dispatchEvent('pointerdown',{pointerId:17,isPrimary:true,button:0,pointerType:'touch',clientX:box.x+2,clientY:box.y+20});
    await page.waitForTimeout(40);
    expect(await page.evaluate(()=>window.jellyFixture.primary.surface.motion.pressed)).toBe(true);
    if(kind==='disable') await host.evaluate((e:HTMLButtonElement)=>{e.disabled=true;});
    else await host.dispatchEvent(kind,{pointerId:17});
    await expect.poll(()=>page.evaluate(()=>window.jellyFixture.primary.surface.motion.x)).toBe(0);
    expect(await page.evaluate(()=>window.jellyFixture.primary.surface.motion)).toMatchObject({v:0,target:0,pressed:false});
    await page.dispatchEvent('body','pointerup',{pointerId:17});
    expect(await host.getAttribute('data-clicks')).toBeNull();
    await host.evaluate((e:HTMLButtonElement)=>{e.disabled=false;});
  }
  await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();
  await page.mouse.move(box.x+box.width+80,box.y+20);await page.mouse.up();
  expect(await page.evaluate(()=>window.jellyFixture.primary.surface.motion)).toMatchObject({x:0,v:0,target:0,pressed:false});
  expect(await host.getAttribute('data-clicks')).toBeNull();
});

test('additional pointers are ignored and touch feedback leaves native scrolling available',async({page,browserName})=>{
  const host=page.locator('#primary-button');
  await host.dispatchEvent('pointerdown',{pointerId:1,isPrimary:true,button:0,pointerType:'touch',clientX:300,clientY:260});
  await host.dispatchEvent('pointerdown',{pointerId:2,isPrimary:false,button:0,pointerType:'touch'});
  await page.dispatchEvent('body','pointerup',{pointerId:2});
  expect(await page.evaluate(()=>window.jellyFixture.primary.surface.motion.pressed)).toBe(true);
  await page.dispatchEvent('body','pointercancel',{pointerId:1});
  expect(await page.evaluate(()=>window.jellyFixture.primary.surface.motion.pressed)).toBe(false);
  expect(await host.evaluate(e=>getComputedStyle(e).touchAction)).toBe('auto');
  expect(await host.evaluate(e=>e.hasPointerCapture(1))).toBe(false);
  if(browserName==='chromium') {
    const session=await page.context().newCDPSession(page);
    const box=(await host.boundingBox())!,x=box.x+20,y=box.y+30;
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=8;i++) await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*25}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(0);
    expect(await page.evaluate(()=>window.jellyFixture.primary.surface.motion.pressed)).toBe(false);
  } else {
    // Native wheel scrolling and PointerEvent touch/cancel are verified separately in Firefox.
    await page.mouse.wheel(0,400);await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(0);
  }
});

test('backend/static/reduced-motion transitions stop active dynamics immediately and keep static cues',async({page})=>{
  for(const mode of ['css','opaque','static','reduce','forced']) {
    await page.evaluate(()=>{const {primary,soft}=window.jellyFixture;primary.surface.update(soft,{});primary.surface.setPressed(true);});
    await page.waitForTimeout(40);
    if(mode==='reduce') await page.emulateMedia({reducedMotion:'reduce'});
    else if(mode==='forced') await page.emulateMedia({forcedColors:'active'});
    else await page.evaluate((value)=>{const{primary,soft}=window.jellyFixture;primary.surface.update(value==='css'?{...soft,target:{...soft.target,backend:'css'}}:value==='static'?{...soft,quality:{profile:'static'}}:soft,value==='opaque'?{opaque:true}:{});},mode);
    await expect.poll(()=>page.evaluate(()=>window.jellyFixture.coordinator.status.active)).toBe(0);
    expect(await page.evaluate(()=>window.jellyFixture.primary.surface.motion)).toMatchObject({x:0,v:0});
    if(mode==='opaque') await expect(page.locator('#primary-button .jelly-decoration')).toHaveAttribute('data-pressed','true');
    await page.emulateMedia({reducedMotion:'no-preference',forcedColors:'none'});
    await page.evaluate(()=>window.jellyFixture.primary.surface.cancelPress());
  }
});

test('controlled renderer time preserves x/v on resize, smoothly retargets contact and resets suspension',async({page})=>{
  const result=await page.evaluate(()=>{
    const c=window.jellyFixture.capture();
    let broadcasts=0;c.surface.onStatus(()=>broadcasts++);
    c.surface.setPressed(true,{x:.1,y:.5});const beforeFrame=broadcasts;c.advance(80);const quietFrames=broadcasts===beforeFrame;
    const moving=c.surface.motion, node=c.host.querySelector('[data-bubble-index]');
    c.host.style.width='96px';c.surface.resize();const resized=c.surface.motion;
    c.surface.setPressed(false);c.advance(95);
    const before=c.surface.motion, path=c.host.querySelector('clipPath path')!.getAttribute('d');
    c.surface.setPressed(true,{x:.9,y:.1});const retargeted=c.surface.motion;
    const continuous=path===c.host.querySelector('clipPath path')!.getAttribute('d');
    c.advance(111);const smoothed=c.surface.motion;
    c.surface.setSuspended(true);const suspended=c.surface.motion;
    c.advance(600000);c.surface.setSuspended(false);c.advance(600016);const resumed=c.surface.motion;
    const sameNode=node===c.host.querySelector('[data-bubble-index]');
    c.surface.setPressed(true);c.host.style.display='none';c.surface.resize();c.advance(630016);
    c.host.style.display='';c.surface.resize();const zeroSizeResume=c.surface.motion;c.destroy();
    return {moving,resized,before,retargeted,continuous,smoothed,suspended,resumed,sameNode,zeroSizeResume,quietFrames};
  });
  expect(result.quietFrames).toBe(true);
  expect(result.resized.x).toBe(result.moving.x);expect(result.resized.v).toBe(result.moving.v);expect(result.sameNode).toBe(true);
  expect(result.retargeted.x).toBe(result.before.x);expect(result.retargeted.v).toBe(result.before.v);expect(result.continuous).toBe(true);
  expect(result.smoothed.contact.x).toBeGreaterThan(.1);expect(result.smoothed.contact.x).toBeLessThan(.9);
  expect(result.suspended).toMatchObject({x:0,v:0,pressed:false});expect(result.resumed).toMatchObject({x:0,v:0,pressed:false});
  expect(result.zeroSizeResume).toMatchObject({x:0,v:0,pressed:false,time:630016});
});

test('offscreen and zero-size suspend, visible resume rests, visibility loss cancels input',async({page})=>{
  await page.evaluate(()=>window.jellyFixture.primary.surface.setPressed(true));await page.waitForTimeout(40);
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await expect.poll(()=>page.evaluate(()=>window.jellyFixture.primary.surface.status.suspended)).toBe(true);
  expect(await page.evaluate(()=>window.jellyFixture.primary.surface.motion)).toMatchObject({x:0,v:0,pressed:false});
  await page.evaluate(()=>window.scrollTo(0,0));
  await expect.poll(()=>page.evaluate(()=>window.jellyFixture.primary.surface.status.suspended)).toBe(false);
  await page.evaluate(()=>{const{primary}=window.jellyFixture;primary.surface.setPressed(true);primary.host.style.display='none';primary.surface.resize();});
  expect(await page.evaluate(()=>window.jellyFixture.primary.surface.motion.scheduler.active)).toBe(0);
  await page.evaluate(()=>{const{primary}=window.jellyFixture;primary.host.style.display='';primary.surface.resize();});
  // Deterministic document visibility event, exercising the same lifecycle callback.
  await page.evaluate(()=>{
    const{primary}=window.jellyFixture;primary.surface.setPressed(true);
    Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(()=>window.jellyFixture.primary.surface.motion)).toMatchObject({x:0,v:0,pressed:false});
  await page.evaluate(()=>{Reflect.deleteProperty(document,'hidden');document.dispatchEvent(new Event('visibilitychange'));});
});

test('multiple moving instances share one request and destroy removes input/listeners with no late DOM writes',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const result=await page.evaluate(async()=>{
    const {primary,coordinator,surfaces}=window.jellyFixture;
    primary.surface.setPressed(true);const second=surfaces[1]!;second.setPressed(true);
    const shared=coordinator.status;
    const initial=primary.surface.motion.updates;
    primary.surface.destroy();const html=primary.host.innerHTML;
    primary.host.dispatchEvent(new PointerEvent('pointerdown',{isPrimary:true,button:0,pointerId:1}));
    primary.host.dispatchEvent(new KeyboardEvent('keydown',{key:' '}));
    window.dispatchEvent(new Event('blur'));
    await new Promise(r=>setTimeout(r,100));
    const remaining=coordinator.status.active;
    second.cancelPress();
    return {shared,remaining,unchanged:html===primary.host.innerHTML,noLateFrames:initial===primary.surface.motion.updates,after:coordinator.status};
  });
  expect(result.shared).toMatchObject({active:2,pending:true});expect(result.remaining).toBe(0); // window blur cancels second input as well
  expect(result).toMatchObject({unchanged:true,noLateFrames:true,after:{active:0,pending:false}});expect(errors).toEqual([]);
});

test('transformed host input maps viewport coordinates to local border-box fractions',async({page})=>{
  const host=page.locator('#primary-button');await host.evaluate((e:HTMLElement)=>{e.style.transform='translate(15px, 7px) scale(1.2, .8)';});
  const box=(await host.boundingBox())!;
  await page.mouse.move(box.x+box.width*.8,box.y+box.height*.25);await page.mouse.down();
  const contact=await page.evaluate(()=>window.jellyFixture.primary.surface.motion.contact);
  expect(contact.x).toBeCloseTo(.8,2);expect(contact.y).toBeCloseTo(.25,2);
  await page.mouse.up();
});

test('actual SVG outlines stay simple at extreme sizes, both motion signs and all edge contacts',async({page})=>{
  const result=await page.evaluate(()=>{
    const failures:string[]=[];
    const cross=(a:DOMPoint,b:DOMPoint,c:DOMPoint)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    for(const [width,height] of [[240,64],[96,48],[180,56],[24,24],[480,24]]) {
      const soft=window.jellyFixture.soft;
      const doc={...soft,geometry:{...soft.geometry,shape:width===180?'capsule' as const:'rounded' as const},behavior:{...soft.behavior,dampingRatio:.15,pressStrength:1,maxDeformation:.15,releaseImpulse:1}};
      for(const contact of [{x:.5,y:.5},{x:0,y:.5},{x:1,y:.5},{x:.5,y:0},{x:.5,y:1}]) {
        const c=window.jellyFixture.capture(doc);c.host.style.width=`${width}px`;c.host.style.height=`${height}px`;c.surface.resize();c.surface.setPressed(true,contact);
        for(const t of [80,180,230,280,340]) {
          c.advance(t);if(t===180)c.surface.setPressed(false);
          const path=c.host.querySelector<SVGPathElement>('clipPath path')!,length=path.getTotalLength();
          const points=Array.from({length:120},(_,i)=>path.getPointAtLength(length*i/120));
          for(let i=0;i<points.length;i++)for(let j=i+2;j<points.length;j++) {
            if(i===0&&j===points.length-1)continue;
            const a=points[i]!,b=points[(i+1)%points.length]!,d=points[j]!,e=points[(j+1)%points.length]!;
            if(cross(a,b,d)*cross(a,b,e)<-1e-8&&cross(d,e,a)*cross(d,e,b)<-1e-8)failures.push(`${width}x${height}@${t}`);
          }
          if(!Number.isFinite(length))failures.push('non-finite');
        }
        c.destroy();
      }
    }
    return failures;
  });
  expect(result).toEqual([]);
});

test('repeated adapter mount/destroy releases feedback listeners and tolerates destruction in status callback',async({page})=>{
  const result=await page.evaluate(async()=>{
    const api=window.jellyFixture,host=document.createElement('button');host.style.cssText='position:fixed;top:0;left:0;width:96px;height:48px';host.textContent='Test';document.body.append(host);
    let calls=0;
    for(let i=0;i<40;i++) {
      const surface=api.attach(host,api.soft,{},api.coordinator);api.bind(host,surface);
      const press=surface.setPressed.bind(surface);surface.setPressed=(...args)=>{calls++;press(...args);};
      surface.setPressed(true);
      surface.destroy();
    }
    const before=calls,frames=api.coordinator.status.frames;
    host.dispatchEvent(new PointerEvent('pointerdown',{isPrimary:true,button:0,pointerId:7}));
    host.dispatchEvent(new KeyboardEvent('keydown',{key:' '}));window.dispatchEvent(new PointerEvent('pointerup',{pointerId:7}));
    const surface=api.attach(host,api.soft,{},api.coordinator);
    surface.onStatus(()=>surface.destroy());surface.setPressed(true);
    const html=host.innerHTML;
    await new Promise(r=>setTimeout(r,100));
    const unchanged=host.innerHTML===html;
    host.remove();return {calls,before,unchanged,frames:api.coordinator.status.frames-frames,active:api.coordinator.status.active};
  });
  expect(result.calls).toBe(result.before);expect(result).toMatchObject({unchanged:true,frames:0,active:0});
});
