import { describe, expect, it } from 'vitest';
import { defaultJellyParams, splitJellyParams } from '../../src/model/experimental/jelly';
import { configureJellyMotion, evolveJellyMotion as step, impulseJellyMotion, initJellyMotion as init, jellyMotionSettled, oscillator, pressJellyMotion as press, resetJellyMotion, targetJellyMotion } from '../../src/model/experimental/jelly-motion';
const defaults = splitJellyParams(defaultJellyParams()).behavior;
const energy = (s: { x: number; v: number }, response = defaults.responseMs) => s.v*s.v+(2*Math.PI/(response/1000))**2*s.x*s.x;

describe('Jelly pure oscillator', () => {
  it.each([0.15, 0.4, 0.65, 0.999999, 1-1e-12, 1, 1+1e-12, 1.000001, 1.05, 2])('matches independent RK4 reference at zeta=%s', (zeta) => {
    let p = { x: 0.02, v: -0.3 };
    const w = 2*Math.PI/0.36, target = 0.04, dt = 0.00001;
    const f = (x: number, v: number) => ({ x: v, v: -2*zeta*w*v-w*w*(x-target) });
    for (let i = 0; i < 20000; i++) {
      const a=f(p.x,p.v), b=f(p.x+a.x*dt/2,p.v+a.v*dt/2), c=f(p.x+b.x*dt/2,p.v+b.v*dt/2), d=f(p.x+c.x*dt,p.v+c.v*dt);
      p={ x:p.x+dt*(a.x+2*b.x+2*c.x+d.x)/6, v:p.v+dt*(a.v+2*b.v+2*c.v+d.v)/6 };
    }
    const actual=oscillator({ x:0.02,v:-0.3 },target,360,zeta,0.2);
    expect(actual.x).toBeCloseTo(p.x,9); expect(actual.v).toBeCloseTo(p.v,8);
  });
  it('has known critical and undamped solutions and identity at dt zero', () => {
    const p={x:1,v:0}, w=2*Math.PI;
    expect(oscillator(p,0,1000,0,0.25).x).toBeCloseTo(0,12);
    expect(oscillator(p,0,1000,0,0.25).v).toBeCloseTo(-w,12);
    expect(oscillator(p,0,1000,1,0.25).x).toBeCloseTo((1+w*0.25)*Math.exp(-w*0.25),12);
    expect(oscillator(p,0,360,0.6,0)).toEqual(p);
  });
  it('rejects invalid inputs, safely handles backwards/zero deltas and long gaps', () => {
    const s=init(defaults,10);
    expect(step(s,10)).toBe(s); expect(step(s,0)).toBe(s);
    for (const t of [NaN,Infinity,-Infinity]) expect(()=>step(s,t)).toThrow();
    expect(()=>init({...defaults,responseMs:0})).toThrow();
    expect(()=>init({...defaults,maxDeformation:NaN})).toThrow();
    expect(()=>oscillator({x:NaN,v:0},0,360,1,0)).toThrow();
    expect(()=>oscillator({x:0,v:0},0,360,1,-1)).toThrow();
    expect(()=>impulseJellyMotion(s,Infinity,20)).toThrow();
    expect(()=>targetJellyMotion(s,NaN,20)).toThrow();
    const long=step(press(s,true,10),1e12);
    expect(long.x).toBe(long.target); expect(long.v).toBe(0);
  });
  it('rests, settles on the pressed target, preserves momentum and makes release idempotent', () => {
    let s=init(defaults);
    expect(step(s,1000)).toMatchObject({x:0,v:0});
    s=press(s,true,0); s=step(s,40);
    const moving=s;
    expect(press(s,true,40)).toEqual(s);
    s=press(s,false,40);
    expect(s.x).toBe(moving.x);
    expect(s.v).toBeCloseTo(moving.v-defaults.releaseImpulse*2*Math.PI/(defaults.responseMs/1000)*defaults.maxDeformation,12);
    expect(press(s,false,40)).toEqual(s);
    expect(press(s,true,40).v).toBe(s.v);
    const held=step(press(init(defaults),true,0),2000);
    expect(jellyMotionSettled(held)).toBe(true); expect(held.x).toBeCloseTo(held.target,8);
    expect(jellyMotionSettled({...held,x:held.target+0.01,v:0})).toBe(false);
    expect(resetJellyMotion(moving,40)).toMatchObject({x:0,v:0,pressed:false,target:0});
  });
  it('dissipates energy with no input and bounds rapid alternating input', () => {
    let s=impulseJellyMotion(init(defaults),-1,0), previous=energy(s);
    for (let t=1;t<3000;t++) { s=step(s,t); const e=energy(s); expect(e).toBeLessThanOrEqual(previous+1e-12); previous=e; }
    for (let t=3000;t<6000;t++) { s=press(s,t%2===0,t); expect(Math.abs(s.x)).toBeLessThanOrEqual(defaults.maxDeformation); expect(Math.abs(s.v)).toBeLessThanOrEqual(2*2*Math.PI/(defaults.responseMs/1000)*defaults.maxDeformation); }
  });
  it('defines zero deformation, zero strength, disabled behavior and atomic limit reduction', () => {
    for (const patch of [{maxDeformation:0},{pressStrength:0},{press:'disabled' as const}]) {
      const b={...defaults,...patch}; let s=press(init(b),true,0); s=step(s,100); s=press(s,false,100); s=step(s,500);
      expect(s).toMatchObject({x:0,v:0,target:0});
    }
    let s=step(press(init(defaults),true,0),80);
    const before={...s}; expect(()=>configureJellyMotion(s,{...defaults,dampingRatio:NaN},80)).toThrow(); expect(s).toEqual(before);
    s=configureJellyMotion(s,{...defaults,maxDeformation:0.001},80);
    expect(s.x).toBe(0.001); expect(s.v).toBe(0); expect(s.target).toBeCloseTo(0.00065,12);
  });
  it.each([0.15,1,1.000001,2])('is observation-independent with real limit impacts at zeta=%s', (dampingRatio) => {
    const b={...defaults,dampingRatio,pressStrength:1,releaseImpulse:1,maxDeformation:0.15,responseMs:80};
    const events=[{t:0,p:true},{t:37.25,p:false},{t:53.125,p:true},{t:81.375,p:false},{t:215.75,p:true},{t:310.5,p:false}];
    function run(cadence:number[]) {
      let s=init(b), event=0, frame=0, touched=false; const observations=[];
      for (const end of [40,80,120,220,400,1000]) {
        while (s.time<end) {
          const et=events[event]?.t ?? Infinity, ft=cadence[frame] ?? Infinity;
          if (et<=ft && et<=end) { s=press(s,events[event]!.p,et); event++; }
          else if (ft<end) { s=step(s,ft); frame++; }
          else { s=step(s,end); break; }
          if (Math.abs(s.x)>=b.maxDeformation-1e-10) touched=true;
        }
        observations.push([s.x,s.v]);
      }
      return {observations,touched};
    }
    const reference=run(Array.from({length:1000},(_,i)=>i+1));
    if(dampingRatio===0.15) expect(reference.touched).toBe(true);
    for (const cadence of [30,60,120]) {
      const result=run(Array.from({length:cadence},(_,i)=>(i+1)*1000/cadence));
      result.observations.forEach((p,i)=>p.forEach((n,j)=>expect(Math.abs(n-reference.observations[i]![j]!)).toBeLessThan(1e-10)));
    }
    const irregular=run([3.7,18,71.3,78,201,400.8,900]);
    expect(irregular.observations).toEqual(reference.observations);
  });
});
