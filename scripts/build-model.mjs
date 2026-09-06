import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
const markdown=await readFile(new URL('../MODEL.md',import.meta.url),'utf8');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const inline=s=>escape(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g,'<a href="$2">$1</a>');
let fenced=false,list=false;const html=[];
for(const line of markdown.split('\n')){
  if(line.startsWith('```')){if(list){html.push('</ul>');list=false;}html.push(fenced?'</code></pre>':'<pre><code>');fenced=!fenced;continue;}
  if(fenced){html.push(escape(line)+'\n');continue;}
  if(line.startsWith('- ')){if(!list){html.push('<ul>');list=true;}html.push(`<li>${inline(line.slice(2))}</li>`);continue;}
  if(list){html.push('</ul>');list=false;}
  if(!line.trim())continue;
  const heading=line.match(/^(#{1,3}) (.*)/);
  html.push(heading?`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`:`<p>${inline(line)}</p>`);
}
if(list)html.push('</ul>');
if(fenced)throw new Error('Unclosed model code fence');
await mkdir(new URL('../public/',import.meta.url),{recursive:true});
await copyFile(new URL('../docs/assets/countercurrent.png',import.meta.url),new URL('../public/preview.png',import.meta.url));
await copyFile(new URL('../docs/assets/countercurrent-demo-v2.mp4',import.meta.url),new URL('../public/demo.mp4',import.meta.url));
await writeFile(new URL('../public/MODEL.md',import.meta.url),markdown);
await writeFile(new URL('../public/model.html',import.meta.url),`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#eeeae2"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='10' fill='%23234d51'/%3E%3C/svg%3E"><title>The model — Countercurrent</title>
<style>body{margin:0;background:#eeeae2;color:#273c3b;font:16px/1.8 Georgia,serif}main{max-width:800px;margin:60px auto;padding:0 26px 80px}nav{font:12px Arial,sans-serif;display:flex;justify-content:space-between;margin-bottom:55px}a{color:inherit;text-underline-offset:4px}h1{font-weight:normal;font-size:64px;letter-spacing:-.05em;line-height:1.1}h2{font-weight:normal;font-size:30px;margin-top:45px}h3{font-size:22px}code{font:13px/1.65 monospace;background:#e0e0d5;padding:2px 4px;border-radius:3px}pre{overflow:auto;background:#e0e0d5;padding:20px}pre code{padding:0}li{margin:12px 0}footer{border-top:1px solid #bcc6b7;padding-top:25px;margin-top:50px;font:12px/1.7 Arial,sans-serif}@media(max-width:600px){main{margin-top:30px}h1{font-size:48px}nav{margin-bottom:35px}}</style>
<main><nav><a href="./">← Countercurrent</a><a href="./MODEL.md">Markdown source</a></nav>${html.join('\n')}<footer>Arkhē · ARSENAL · Countercurrent<br>Built with Astra in Codex. A bounded computational experiment.</footer></main></html>\n`);
console.log('Generated model.html and MODEL.md from the controlling model source.');
