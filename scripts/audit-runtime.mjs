import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url)),problems=[],files=[];
async function walk(path){for(const name of await readdir(path)){const p=resolve(path,name);if((await stat(p)).isDirectory())await walk(p);else if(/\.(js|mjs|html|css)$/.test(name))files.push(p);}}
await walk(resolve(root,'src'));await walk(resolve(root,'public'));files.push(resolve(root,'index.html'));
for(const file of files){
  const text=await readFile(file,'utf8'),name=relative(root,file);
  if(/(?:\/Users\/|\/private\/tmp\/|[A-Z]:\\Users\\)/.test(text))problems.push(`${name}: local machine path`);
  if(/(?:\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\s*\(|\bEventSource\s*\(|\.sendBeacon\s*\(|\.serviceWorker\b)/.test(text))problems.push(`${name}: network or persistent-worker API`);
  if(/(?:from\s*|import\s*\(?)["'](?:https?:)?\/\//.test(text))problems.push(`${name}: remote module`);
  if(/url\(\s*["']?(?:https?:)?\/\//.test(text))problems.push(`${name}: remote CSS asset`);
  for(const tag of text.matchAll(/<(?:script|link|img|audio|video|source|iframe)\b[^>]*>/gi))if(/(?:src|href)\s*=\s*["'](?:https?:)?\/\//.test(tag[0]))problems.push(`${name}: remote asset tag`);
}
const dist=resolve(root,'dist'),html=await readFile(resolve(dist,'index.html'),'utf8');
for(const match of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)=["']([^"']+)["']/gi)){
  const target=match[1];if(target.startsWith('data:'))continue;
  if(!target.startsWith('./'))problems.push(`dist/index.html: non-relative asset ${target}`);
  else {try{await stat(resolve(dist,target));}catch{problems.push(`dist/index.html: missing ${target}`);}}
}
for(const name of ['model.html','MODEL.md','THIRD_PARTY_LICENSES/three-LICENSE.txt']){try{await stat(resolve(dist,name));}catch{problems.push(`dist: missing ${name}`);}}
const result={pass:problems.length===0,runtimeSourceFiles:files.length,problems,scope:'Static first-party runtime source, required delivery files and entry asset references. Browser offline exercise is separate.'};
console.log(JSON.stringify(result,null,2));if(!result.pass)process.exitCode=1;
