import fs from 'node:fs'; import path from 'node:path';
// M6.4.2: static import graph of src/ (cycles; what the production runtime reaches). Run from the repository root: node docs/m642/tools/import-graph.mjs
const root='src'; const files=[];
(function walk(d){for(const f of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,f.name);f.isDirectory()?walk(p):/\.(ts|tsx)$/.test(f.name)&&files.push(p)}})(root);
const resolve=(from,spec)=>{ if(!spec.startsWith('.'))return null; const b=path.normalize(path.join(path.dirname(from),spec)); for(const c of [b+'.ts',b+'.tsx',path.join(b,'index.ts'),path.join(b,'index.tsx'),b]) if(files.includes(c)) return c; return null;};
const stat={}, dyn={}; 
for(const f of files){const s=fs.readFileSync(f,'utf8'); stat[f]=[];dyn[f]=[];
 for(const m of s.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gms)){const r=resolve(f,m[1]); if(r)stat[f].push(r);}
 for(const m of s.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)){const r=resolve(f,m[1]); if(r)stat[f].push(r);}
 for(const m of s.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)){const r=resolve(f,m[1]); if(r)dyn[f].push(r);}
}
// cycles (static, value imports) via Tarjan
let idx=0;const st=[],on=new Set(),ix={},low={},cyc=[];
function sc(v){ix[v]=low[v]=idx++;st.push(v);on.add(v);for(const w of stat[v]||[]){if(ix[w]===undefined){sc(w);low[v]=Math.min(low[v],low[w])}else if(on.has(w))low[v]=Math.min(low[v],ix[w])}
 if(low[v]===ix[v]){const c=[];let w;do{w=st.pop();on.delete(w);c.push(w)}while(w!==v);if(c.length>1)cyc.push(c)}}
for(const f of files) if(ix[f]===undefined) sc(f);
console.log('CYCLES',cyc.length); cyc.forEach(c=>console.log(c.join('\n  '),'\n'));
// reachability of experimental from runtime entry points (static)
function reach(entry){const seen=new Set([entry]),q=[entry];while(q.length){const v=q.pop();for(const w of stat[v]||[])if(!seen.has(w)){seen.add(w);q.push(w)}}return seen}
for(const e of ['src/runtime/index.ts','src/runtime/react.tsx','src/runtime/vanilla.ts'].filter(x=>files.includes(x))){const r=[...reach(e)];console.log(e,'reaches',r.length,'files; experimental/jelly:',r.filter(x=>/experimental|jelly/i.test(x)))}
console.log(files.filter(f=>/runtime\/[^/]+$/.test(f)).join(' '));
// who imports experimental statically
for(const f of files){ const bad=(stat[f]||[]).filter(x=>/experimental|catalog/.test(x)); if(bad.length && !/experimental|lab\//.test(f)) console.log('STATIC->exp/catalog',f,bad)}
