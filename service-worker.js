"use strict";
const CACHE_NAME="forushnameh-shell-v14";
const APP_SHELL=[
 "./","./index.html","./about.html","./contact.html","./faq.html",
 "./privacy.html","./terms.html","./styles.css?v=24","./app.js?v=25",
 "./site.js?v=2","./logo-forushnameh.svg","./logo-forushnameh-dark.svg",
 "./hero-dashboard.svg","./hero-dashboard-dark.svg","./manifest.webmanifest","./offline.html"
];
const scopeURL=new URL(self.registration.scope);
const scoped=path=>new URL(path,scopeURL).href;
async function cachedPage(request){
 const keys=[request,scoped("./"),scoped("./index.html"),scoped("./offline.html")];
 for(const key of keys){
  try{const found=await caches.match(key,{ignoreSearch:true});if(found)return found}catch(_){}
 }
 return Response.error();
}
self.addEventListener("install",event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  // Cache files independently: one missing CDN/static asset must not abort installation.
  await Promise.allSettled(APP_SHELL.map(async path=>{
   const url=scoped(path);
   const response=await fetch(new Request(url,{cache:"reload"}));
   if(response.ok)await cache.put(url,response);
  }));
  await self.skipWaiting();
 })());
});
self.addEventListener("activate",event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  const hasApp=!!(await cache.match(scoped("./index.html"))||await cache.match(scoped("./")));
  // Retain the previous working cache if the new shell did not obtain an app page.
  if(hasApp){
   const keys=await caches.keys();
   await Promise.all(keys.filter(key=>key.startsWith("forushnameh-shell-")&&key!==CACHE_NAME).map(key=>caches.delete(key)));
  }
  await self.clients.claim();
 })());
});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 if(/\/(?:rest\/v1|auth\/v1|functions\/v1)\//.test(url.pathname))return;
 if(request.mode==="navigate"){
  event.respondWith((async()=>{
   try{
    const response=await fetch(request,{cache:"no-store"});
    if(response.ok){
     const cache=await caches.open(CACHE_NAME);
     await cache.put(request,response.clone()).catch(()=>{});
     return response;
    }
    if(response.status>=500)return (await cachedPage(request))||response;
    return response;
   }catch(_){
    const fallback=await cachedPage(request);
    return fallback.type==="error"?new Response("اتصال به سرور برقرار نشد. لطفاً دوباره تلاش کنید.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}}):fallback;
   }
  })());
  return;
 }
 event.respondWith((async()=>{
  const cached=await caches.match(request,{ignoreSearch:true});
  if(cached)return cached;
  const response=await fetch(request);
  if(response.ok){const cache=await caches.open(CACHE_NAME);await cache.put(request,response.clone()).catch(()=>{});}
  return response;
 })());
});
