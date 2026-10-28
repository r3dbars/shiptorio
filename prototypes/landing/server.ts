import { resolve } from 'node:path';
const root=resolve(import.meta.dir), assets=resolve(root,'../../web/public');
const localFiles=new Map([['/','index.html'],['/index.html','index.html'],['/style.css','style.css'],['/app.js','app.js']]);
const server=Bun.serve({hostname:'127.0.0.1',port:4321,async fetch(request){const path=new URL(request.url).pathname;const page=localFiles.get(path);const asset=/^\/(brand|fonts|welcome)\/[A-Za-z0-9._-]+$/.test(path);if(!page&&!asset)return new Response('Not found',{status:404});if(!['GET','HEAD'].includes(request.method))return new Response('Read-only local preview',{status:405});const file=Bun.file(page?resolve(root,page):resolve(assets,'.'+path));if(!await file.exists())return new Response('Not found',{status:404});return new Response(request.method==='HEAD'?null:file,{headers:{'content-type':file.type,'cache-control':'no-store','x-content-type-options':'nosniff'}})}});
console.log(`Shiptorio website workshop: http://localhost:${server.port}`);
