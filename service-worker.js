const CACHE_NAME="forushnameh-shell-v9";
const APP_SHELL=[
 "./",
 "./index.html",
 "./about.html",
 "./contact.html",
 "./faq.html",
 "./privacy.html",
 "./terms.html",
 "./styles.css?v=20",
 "./app.js?v=20",
 "./site.js?v=2",
 "./favicon.svg",
 "./app-icon.svg",
 "./logo-forushnameh.svg",
 "./logo-forushnameh-dark.svg",
 "./hero-dashboard.svg",
 "./hero-dashboard-dark.svg",
 "./manifest.webmanifest",
 "./offline.html"
];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("forushnameh-shell-")&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 if(url.pathname.includes("/rest/v1/")||url.pathname.includes("/auth/v1/")||url.pathname.includes("/functions/v1/"))return;
 if(request.mode==="navigate"){
  event.respondWith(fetch(request).then(response=>{
   if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy))}
   return response;
  }).catch(async()=>{
   const cached=await caches.match(request)||await caches.match("./index.html");
   return await caches.match("./offline.html");
  }));
  return;
 }
 event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
  if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy))}
  return response;
 })));
});
