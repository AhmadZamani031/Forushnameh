(() => {
"use strict";
const $ = id => document.getElementById(id);
const SUPABASE_URL="https://exlvtibujxklnigguzkz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_rndKASKUTndUiotNPWVxsg_GbylnlX0";
const BASE_KEYS={invoices:"forushnameh.invoices.v2",products:"forushnameh.products.v1",customers:"forushnameh.customers.v1",movements:"forushnameh.movements.v1"};
let KEYS={...BASE_KEYS};
let supabaseClient=null;
let currentUser=null;
let authMode="login";
let recoveryMode=false;
const invoiceFields=["storeName","storePhone","storeAddress","customerName","customerPhone","invoiceNumber","invoiceDate","currency","notes"];
let items=[{id:1,name:"محصول نمونه",quantity:1,price:250000,productId:""},{id:2,name:"خدمات",quantity:2,price:50000,productId:""}];
let nextItemId=3, editingInvoiceId=null, editingProductId=null, editingCustomerId=null;
let products=[], customers=[], movements=[];
function read(key,fallback){try{const x=JSON.parse(localStorage.getItem(key)||"null");return Array.isArray(x)?x:fallback}catch(e){return fallback}}
function write(key,value,statusId){try{localStorage.setItem(key,JSON.stringify(value));return true}catch(e){if(statusId)$(statusId).textContent="ذخیره انجام نشد؛ فضای ذخیره‌سازی مرورگر ممکن است کافی نباشد.";return false}}
function fa(n){return new Intl.NumberFormat("fa-IR",{maximumFractionDigits:2}).format(Number(n)||0)}
function num(v){const s=String(v??"").replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[،٬,\s]/g,"");const n=Number(s);return Number.isFinite(n)?Math.max(0,n):0}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function invoiceData(){return Object.fromEntries(invoiceFields.map(id=>[id,$(id).value.trim()]))}
function total(list=items){return list.reduce((s,it)=>s+num(it.quantity)*num(it.price),0)}
function today(){const d=new Date();return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`}
if(!$("invoiceDate").value)$("invoiceDate").value=today();
function productById(id){return products.find(p=>p.id===id)}
function drawItems(){
 const opts=products.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${p.code?" ("+esc(p.code)+")":""} — ${fa(p.price)} ${esc($("currency").value)}</option>`).join("");
 $("itemsEditor").innerHTML=items.map((it,i)=>`<div class="item-editor" data-item-id="${it.id}">
 <div class="item-editor-top"><strong>ردیف ${fa(i+1)}</strong><button type="button" class="remove-item" data-remove="${it.id}" ${items.length===1?"disabled":""}>حذف ردیف ×</button></div>
 <div class="field"><label>انتخاب از فهرست کالاها (اختیاری)</label><select data-field="productId" data-id="${it.id}"><option value="">ورود دستی / بدون انتخاب کالا</option>${opts}</select></div>
 <div class="item-fields"><div class="field"><label>نام کالا / خدمات</label><input data-field="name" data-id="${it.id}" value="${esc(it.name)}" placeholder="نام کالا"></div><div class="field"><label>تعداد</label><input data-field="quantity" data-id="${it.id}" value="${it.quantity}" inputmode="decimal" min="0" type="number"></div></div>
 <div class="item-price-row"><div class="field"><label>قیمت هر واحد</label><input data-field="price" data-id="${it.id}" value="${it.price}" inputmode="decimal" min="0" type="number"></div><div class="field"><label>مبلغ ردیف</label><input value="${fa(it.quantity*it.price)}" disabled></div></div>
 </div>`).join("");
 items.forEach(it=>{const s=$(`itemsEditor`).querySelector(`[data-field="productId"][data-id="${it.id}"]`);if(s)s.value=it.productId||""});
}
function preview(){
 const d=invoiceData();
 $("previewStoreName").textContent=d.storeName||"نام فروشگاه";$("previewStoreAddress").textContent=d.storeAddress;$("previewStorePhone").textContent=d.storePhone?`تلفن: ${d.storePhone}`:"";
 $("previewInvoiceNumber").textContent=d.invoiceNumber||"—";$("previewInvoiceDate").textContent=d.invoiceDate||"—";$("previewCustomerName").textContent=d.customerName||"مشتری گرامی";$("previewCustomerPhone").textContent=d.customerPhone?`تلفن: ${d.customerPhone}`:"";
 $("previewCurrency").textContent=d.currency||"تومان";$("previewItems").innerHTML=items.map(it=>`<tr><td>${esc(it.name||"—")}</td><td>${fa(it.quantity)}</td><td>${fa(it.price)}</td><td>${fa(it.quantity*it.price)}</td></tr>`).join("");
 $("previewTotal").textContent=fa(total());$("previewNotes").textContent=d.notes||"از خرید شما سپاسگزاریم.";$("previewNotesBlock").style.display=d.notes?"block":"none";
 items.forEach(it=>{const c=$("itemsEditor").querySelector(`[data-item-id="${it.id}"]`);if(c)c.querySelector("input[disabled]").value=fa(it.quantity*it.price)});
}
function drawInvoices(){
 const list=read(KEYS.invoices,[]).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)),host=$("savedInvoices");
 if(!list.length){host.innerHTML='<p class="helper">هنوز فاکتوری ذخیره نشده است.</p>';return}
 host.innerHTML=list.map(x=>`<div class="saved-invoice"><div class="saved-invoice-info"><strong>${esc(x.data.invoiceNumber||"بدون شماره")} — ${esc(x.data.customerName||"بدون نام مشتری")}</strong><span>${esc(x.data.invoiceDate||"بدون تاریخ")} · ${fa(total(x.items))} ${esc(x.data.currency||"تومان")}</span></div><div class="saved-invoice-actions"><button class="button button-light" data-open-invoice="${esc(x.id)}">باز کردن</button><button class="button button-danger" data-delete-invoice="${esc(x.id)}">حذف</button></div></div>`).join("");
}

function movement(kind,productId,quantity,description,reference){
 const p=productById(productId); if(!p)return;
 movements.unshift({id:`mov-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,kind,productId,productName:p.name,quantity:num(quantity),description:description||"",reference:reference||"",date:new Date().toISOString()});
}
function stockEffects(list){
 const totals={};
 list.forEach(it=>{if(it.productId)totals[it.productId]=(totals[it.productId]||0)+num(it.quantity)});
 return Object.entries(totals).map(([productId,quantity])=>({productId,quantity}));
}
function changeStock(productId,delta){
 const p=productById(productId); if(p)p.stock=Math.max(0,num(p.stock)+delta);
}
function drawMovements(){
 const host=$("movementsList"); if(!movements.length){host.innerHTML='<p class="helper">هنوز گردش انباری ثبت نشده است.</p>';return}
 host.innerHTML=movements.slice(0,100).map(m=>`<div class="record-row"><div class="record-main"><strong>${esc(m.productName||"کالای حذف‌شده")}</strong><span>${m.kind==="in"?"ورود به انبار":m.kind==="sale"?"خروج بابت فاکتور":"برگشت از فاکتور"} · ${fa(m.quantity)} · ${new Date(m.date).toLocaleString("fa-IR")} ${m.reference?" · "+esc(m.reference):""}${m.description?" · "+esc(m.description):""}</span></div></div>`).join("");
}
function receiveStock(){
 const id=$("stockProduct").value,qty=num($("stockQuantity").value),desc=$("stockDescription").value.trim(),p=productById(id);
 if(!p){$("stockStatus").textContent="ابتدا یک کالا انتخاب کن.";return}
 if(qty<=0){$("stockStatus").textContent="تعداد ورود باید بیشتر از صفر باشد.";return}
 p.stock=num(p.stock)+qty; movement("in",id,qty,desc,"");
 if(write(KEYS.products,products,"stockStatus")&&write(KEYS.movements,movements,"stockStatus")){
  $("stockQuantity").value="";$("stockDescription").value="";$("stockStatus").textContent="ورود کالا ثبت شد و موجودی افزایش یافت.";drawProductList();drawMovements();drawDashboard();
 }
}
function drawStockPicker(){
 $("stockProduct").innerHTML='<option value="">انتخاب کالا</option>'+products.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} — موجودی: ${fa(p.stock)} ${esc(p.unit)}</option>`).join("");
}
function saveInvoice(){
 const list=read(KEYS.invoices,[]),old=list.find(x=>x.id===editingInvoiceId);
 const candidateItems=items.map(x=>({name:x.name,quantity:num(x.quantity),price:num(x.price),productId:x.productId||""}));
 const effects=stockEffects(candidateItems),tempProducts=products.map(p=>({...p}));
 // Restore the previous stock impact when editing a version-4 invoice.
 if(old&&old.stockApplied&&Array.isArray(old.stockEffects)){
  old.stockEffects.forEach(e=>{const p=tempProducts.find(x=>x.id===e.productId);if(p)p.stock=num(p.stock)+num(e.quantity)});
 }
 for(const e of effects){
  const p=tempProducts.find(x=>x.id===e.productId);
  if(!p){$("savedStatus").textContent="یکی از کالاهای انتخاب‌شده دیگر در فهرست نیست؛ فاکتور را اصلاح کن.";return}
  if(num(p.stock)<e.quantity){$("savedStatus").textContent=`موجودی «${p.name}» کافی نیست. موجودی: ${fa(p.stock)}، مقدار فاکتور: ${fa(e.quantity)}.`;return}
  p.stock=num(p.stock)-e.quantity;
 }
 const obj={id:editingInvoiceId||`inv-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,data:invoiceData(),items:candidateItems,updatedAt:Date.now(),stockApplied:true,stockEffects:effects};
 if(old&&old.stockApplied&&Array.isArray(old.stockEffects)){
  old.stockEffects.forEach(e=>{const p=productById(e.productId);if(p)movement("return",e.productId,e.quantity,`اصلاح فاکتور ${obj.data.invoiceNumber}`,obj.data.invoiceNumber)});
 }
 effects.forEach(e=>movement("sale",e.productId,e.quantity,`فروش با فاکتور ${obj.data.invoiceNumber}`,obj.data.invoiceNumber));
 const previousProducts=products; products=tempProducts;
 const i=list.findIndex(x=>x.id===obj.id);if(i>=0)list[i]=obj;else list.push(obj);
 if(!write(KEYS.products,products,"savedStatus")){products=previousProducts;return}
 if(!write(KEYS.invoices,list,"savedStatus")){products=previousProducts;write(KEYS.products,products,"savedStatus");$("savedStatus").textContent="ذخیره فاکتور ناموفق بود؛ موجودی قبلی بازگردانده شد.";return}
 write(KEYS.movements,movements,"savedStatus");
 editingInvoiceId=obj.id;if(window.showForushnamehPage)window.showForushnamehPage("saved");$("savedStatus").textContent="فاکتور ذخیره شد و موجودی کالاها به‌روزرسانی شد.";drawInvoices();drawProductList();drawStockPicker();drawMovements();drawDashboard();
}
function loadInvoice(id){
 const x=read(KEYS.invoices,[]).find(a=>a.id===id);if(!x)return;
 invoiceFields.forEach(k=>{if(x.data[k]!==undefined)$(k).value=x.data[k]});
 items=x.items.map((it,i)=>({id:i+1,name:it.name||"",quantity:num(it.quantity),price:num(it.price),productId:it.productId||""}));
 if(!items.length)items=[{id:1,name:"",quantity:1,price:0,productId:""}];
 nextItemId=items.length+1;editingInvoiceId=x.id;drawItems();drawCustomerPicker();preview();$("savedStatus").textContent="فاکتور باز شد؛ پس از تغییر، دوباره ذخیره کن.";
}
function newInvoice(){
 $("customerPicker").value="";invoiceFields.forEach(k=>{if(k==="storeName")return;if(k==="currency")return;$(k).value=""});
 $("invoiceDate").value=today();$("invoiceNumber").value=String(1001+read(KEYS.invoices,[]).length);
 items=[{id:1,name:"",quantity:1,price:0,productId:""}];nextItemId=2;editingInvoiceId=null;drawItems();preview();$("savedStatus").textContent="فاکتور جدید آماده است.";
}
function drawProductList(){
 const q=($("productSearch").value||"").trim().toLowerCase(),host=$("productsList");
 const found=products.filter(p=>(p.name+" "+p.code).toLowerCase().includes(q));
 if(!found.length){host.innerHTML='<p class="helper">کالایی ثبت نشده است.</p>';return}
 host.innerHTML=found.map(p=>`<div class="record-row"><div class="record-main"><strong>${esc(p.name)}</strong><span>${esc(p.code||"بدون کد")} · ${fa(p.price)} · موجودی: ${fa(p.stock)} ${esc(p.unit)}${p.stock<=p.minStock?' · <b class="low-stock">موجودی کم</b>':""}</span></div><div class="record-actions"><button class="button button-light" data-edit-product="${esc(p.id)}">ویرایش</button><button class="button button-danger" data-delete-product="${esc(p.id)}">حذف</button></div></div>`).join("");
}
function clearProductForm(){editingProductId=null;$("productStock").disabled=false;["productName","productCode","productPrice","productStock","productMinStock","productNote"].forEach(id=>$(id).value="");$("productUnit").value="عدد";$("saveProduct").textContent="ثبت کالا";$("cancelProductEdit").hidden=true}
function saveProduct(){
 const name=$("productName").value.trim();if(!name){$("productStatus").textContent="لطفاً نام کالا را وارد کن.";return}
 const code=$("productCode").value.trim(),duplicate=products.find(p=>p.code&&code&&p.code.toLowerCase()===code.toLowerCase()&&p.id!==editingProductId);
 if(duplicate){$("productStatus").textContent="این کد کالا قبلاً ثبت شده است.";return}
 const p={id:editingProductId||`prd-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,name,code,unit:$("productUnit").value,price:num($("productPrice").value),stock:editingProductId?num(productById(editingProductId)?.stock):num($("productStock").value),minStock:num($("productMinStock").value),note:$("productNote").value.trim()};
 const i=products.findIndex(x=>x.id===p.id);if(i>=0)products[i]=p;else products.push(p);
 if(write(KEYS.products,products,"productStatus")){$("productStatus").textContent="کالا ذخیره شد.";clearProductForm();drawProductList();drawItems();drawStockPicker();drawDashboard()}
}
function editProduct(id){if(window.showForushnamehPage)window.showForushnamehPage("products");const p=productById(id);if(!p)return;editingProductId=id;$("productStock").disabled=true;$("productName").value=p.name;$("productCode").value=p.code;$("productUnit").value=p.unit;$("productPrice").value=p.price;$("productStock").value=p.stock;$("productMinStock").value=p.minStock;$("productNote").value=p.note||"";$("saveProduct").textContent="ذخیرهٔ تغییرات";$("cancelProductEdit").hidden=false}
function drawCustomerList(){
 const q=($("customerSearch").value||"").trim().toLowerCase(),host=$("customersList"),found=customers.filter(c=>(c.name+" "+c.phone).toLowerCase().includes(q));
 if(!found.length){host.innerHTML='<p class="helper">مشتری‌ای ثبت نشده است.</p>';return}
 host.innerHTML=found.map(c=>`<div class="record-row"><div class="record-main"><strong>${esc(c.name)}</strong><span>${esc(c.phone||"بدون تلفن")}${c.email?" · "+esc(c.email):""}</span></div><div class="record-actions"><button class="button button-light" data-edit-customer="${esc(c.id)}">ویرایش</button><button class="button button-danger" data-delete-customer="${esc(c.id)}">حذف</button></div></div>`).join("");
}
function drawCustomerPicker(){
 const sel=$("customerPicker"),current=sel.value;
 sel.innerHTML='<option value="">انتخاب مشتری (اختیاری)</option>'+customers.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}${c.phone?" — "+esc(c.phone):""}</option>`).join("");
 if(customers.some(c=>c.id===current))sel.value=current;
}
function clearCustomerForm(){editingCustomerId=null;["customerRecordName","customerRecordPhone","customerRecordEmail","customerRecordAddress"].forEach(id=>$(id).value="");$("saveCustomer").textContent="ثبت مشتری";$("cancelCustomerEdit").hidden=true}
function saveCustomer(){
 const name=$("customerRecordName").value.trim();if(!name){$("customerStatus").textContent="لطفاً نام مشتری را وارد کن.";return}
 const c={id:editingCustomerId||`cus-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,name,phone:$("customerRecordPhone").value.trim(),email:$("customerRecordEmail").value.trim(),address:$("customerRecordAddress").value.trim()};
 const i=customers.findIndex(x=>x.id===c.id);if(i>=0)customers[i]=c;else customers.push(c);
 if(write(KEYS.customers,customers,"customerStatus")){$("customerStatus").textContent="مشتری ذخیره شد.";clearCustomerForm();drawCustomerList();drawCustomerPicker();drawDashboard()}
}
function editCustomer(id){if(window.showForushnamehPage)window.showForushnamehPage("customers");const c=customers.find(x=>x.id===id);if(!c)return;editingCustomerId=id;$("customerRecordName").value=c.name;$("customerRecordPhone").value=c.phone;$("customerRecordEmail").value=c.email;$("customerRecordAddress").value=c.address;$("saveCustomer").textContent="ذخیرهٔ تغییرات";$("cancelCustomerEdit").hidden=false}
function backupExport(){
 const payload={app:"ForushNameh",formatVersion:1,createdAt:new Date().toISOString(),invoices:read(KEYS.invoices,[]),products,customers,movements};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=`ForushNameh-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);$("backupStatus").textContent="فایل پشتیبان ساخته شد؛ آن را در جای امن نگه دار.";
}
async function backupImport(file){
 if(!file)return;
 try{
  const x=JSON.parse(await file.text());
  if(x.app!=="ForushNameh"||!Array.isArray(x.invoices)||!Array.isArray(x.products)||!Array.isArray(x.customers))throw Error("invalid");
  if(!confirm("بازیابی، فاکتورها، کالاها و مشتریان فعلی این مرورگر را جایگزین می‌کند. ادامه می‌دهی؟"))return;
  const restoredMovements=Array.isArray(x.movements)?x.movements:[];
  const keys=[KEYS.invoices,KEYS.products,KEYS.customers,KEYS.movements],before=keys.map(k=>localStorage.getItem(k));
  try{
   const values=[x.invoices,x.products,x.customers,restoredMovements];
   keys.forEach((k,i)=>localStorage.setItem(k,JSON.stringify(values[i])));
   products=x.products;customers=x.customers;movements=restoredMovements;
   drawInvoices();drawProductList();drawCustomerList();drawCustomerPicker();drawStockPicker();drawMovements();drawItems();drawDashboard();
   $("backupStatus").textContent="بازیابی اطلاعات انجام شد.";
  }catch(storageError){
   keys.forEach((k,i)=>{if(before[i]===null)localStorage.removeItem(k);else localStorage.setItem(k,before[i])});
   $("backupStatus").textContent="ذخیرهٔ پشتیبان کامل نشد؛ اطلاعات قبلی حفظ شدند. فضای ذخیره‌سازی مرورگر را بررسی کن.";
  }
 }catch(e){$("backupStatus").textContent="فایل انتخاب‌شده معتبر نیست یا قابل خواندن نیست."}
 $("importData").value="";
}


function drawDashboard(){
 const invoices=read(KEYS.invoices,[]).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
 const sales=invoices.reduce((sum,x)=>sum+total(x.items||[]),0);
 $("dashSales").textContent=fa(sales);
 $("dashSalesCurrency").textContent=invoices[0]?.data?.currency||"تومان";
 $("dashInvoices").textContent=fa(invoices.length);
 $("dashCustomers").textContent=fa(customers.length);
 $("dashProducts").textContent=fa(products.length);
 const low=products.filter(p=>num(p.stock)<=num(p.minStock));
 $("dashLowStock").textContent=`${fa(low.length)} کالای کم‌موجود`;
 const recent=$("dashRecentInvoices");
 recent.innerHTML=invoices.length?invoices.slice(0,5).map(x=>`<div class="dash-row"><div><strong>${esc(x.data?.customerName||"بدون نام مشتری")}</strong><small>فاکتور ${esc(x.data?.invoiceNumber||"—")} · ${esc(x.data?.invoiceDate||"بدون تاریخ")}</small></div><b>${fa(total(x.items||[]))} ${esc(x.data?.currency||"تومان")}</b></div>`).join(""):'<p class="helper">هنوز فاکتوری ثبت نشده است.</p>';
 const lowHost=$("dashLowProducts");
 lowHost.innerHTML=low.length?low.slice(0,6).map(p=>`<div class="dash-row"><div><strong>${esc(p.name)}</strong><small>حد هشدار: ${fa(p.minStock)} ${esc(p.unit||"")}</small></div><b class="low-stock">${fa(p.stock)} ${esc(p.unit||"")}</b></div>`).join(""):'<p class="helper">موجودی کالاها در وضعیت مناسبی است.</p>';
}

function setupNavigation(){
 const buttons=[...document.querySelectorAll("[data-page]")],views=[...document.querySelectorAll("[data-view]")];
 function showPage(name){
  buttons.forEach(b=>{const active=b.dataset.page===name;b.classList.toggle("active",active);b.setAttribute("aria-current",active?"page":"false")});
  views.forEach(v=>v.classList.toggle("active-view",v.dataset.view===name));
  window.scrollTo({top:0,behavior:"smooth"});
 }
 buttons.forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
 window.showForushnamehPage=showPage;
}

function init(){
 setupNavigation();
 const d=new Date();$("invoiceDate").value=$("invoiceDate").value||today();
 invoiceFields.forEach(id=>{$(id).addEventListener("input",preview);$(id).addEventListener("change",preview)});
 $("itemsEditor").addEventListener("input",e=>{const el=e.target,it=items.find(x=>x.id===Number(el.dataset.id)),f=el.dataset.field;if(!it||!f)return;if(f==="name")it.name=el.value;if(f==="quantity")it.quantity=num(el.value);if(f==="price")it.price=num(el.value);preview()});
 $("itemsEditor").addEventListener("change",e=>{const el=e.target;if(el.dataset.field==="productId"){const it=items.find(x=>x.id===Number(el.dataset.id)),p=productById(el.value);if(!it)return;it.productId=el.value;if(p){it.name=p.name;it.price=p.price;drawItems();preview()}}});
 $("itemsEditor").addEventListener("click",e=>{const b=e.target.closest("[data-remove]");if(!b||items.length===1)return;items=items.filter(x=>x.id!==Number(b.dataset.remove));drawItems();preview()});
 $("addItem").addEventListener("click",()=>{items.push({id:nextItemId++,name:"",quantity:1,price:0,productId:""});drawItems();preview()});
 $("currency").addEventListener("change",()=>{drawItems();preview()});
 $("customerPicker").addEventListener("change",()=>{const c=customers.find(x=>x.id===$("customerPicker").value);if(c){$("customerName").value=c.name;$("customerPhone").value=c.phone;$("previewCustomerName").textContent=c.name;$("previewCustomerPhone").textContent=c.phone?`تلفن: ${c.phone}`:""}});
 $("saveInvoice").addEventListener("click",saveInvoice);$("newInvoice").addEventListener("click",newInvoice);
 $("savedInvoices").addEventListener("click",e=>{const o=e.target.closest("[data-open-invoice]"),d=e.target.closest("[data-delete-invoice]");if(o){loadInvoice(o.dataset.openInvoice);return}if(d&&confirm("این فاکتور حذف شود؟ در صورت ثبت گردش انبار، موجودی کالاها نیز برگردانده می‌شود.")){const all=read(KEYS.invoices,[]),target=all.find(x=>x.id===d.dataset.deleteInvoice);if(target&&target.stockApplied&&Array.isArray(target.stockEffects)){target.stockEffects.forEach(e=>{const p=productById(e.productId);if(p){p.stock=num(p.stock)+num(e.quantity);movement("return",e.productId,e.quantity,`حذف فاکتور ${target.data.invoiceNumber}`,target.data.invoiceNumber)}});write(KEYS.products,products,"savedStatus");write(KEYS.movements,movements,"savedStatus")}write(KEYS.invoices,all.filter(x=>x.id!==d.dataset.deleteInvoice),"savedStatus");drawInvoices();drawProductList();drawStockPicker();drawMovements();drawDashboard()}});
 $("saveProduct").addEventListener("click",saveProduct);$("cancelProductEdit").addEventListener("click",clearProductForm);$("productSearch").addEventListener("input",drawProductList);
 $("productsList").addEventListener("click",e=>{const edit=e.target.closest("[data-edit-product]"),del=e.target.closest("[data-delete-product]");if(edit){editProduct(edit.dataset.editProduct);return}if(del&&confirm("این کالا حذف شود؟ فاکتورهای قبلی تغییر نمی‌کنند.")){products=products.filter(p=>p.id!==del.dataset.deleteProduct);write(KEYS.products,products,"productStatus");drawProductList();drawItems();drawStockPicker();drawDashboard()}});
 $("saveCustomer").addEventListener("click",saveCustomer);$("cancelCustomerEdit").addEventListener("click",clearCustomerForm);$("customerSearch").addEventListener("input",drawCustomerList);
 $("customersList").addEventListener("click",e=>{const edit=e.target.closest("[data-edit-customer]"),del=e.target.closest("[data-delete-customer]");if(edit){editCustomer(edit.dataset.editCustomer);return}if(del&&confirm("این مشتری حذف شود؟ فاکتورهای قبلی تغییر نمی‌کنند.")){customers=customers.filter(c=>c.id!==del.dataset.deleteCustomer);write(KEYS.customers,customers,"customerStatus");drawCustomerList();drawCustomerPicker();drawDashboard()}});
 $("receiveStock").addEventListener("click",receiveStock);$("exportData").addEventListener("click",backupExport);$("importData").addEventListener("change",e=>backupImport(e.target.files[0]));
 $("downloadPng").addEventListener("click",async()=>{const btn=$("downloadPng"),status=$("statusMessage");if(typeof window.html2canvas!=="function"){status.textContent="ابزار ساخت تصویر بارگذاری نشده است؛ اتصال اینترنت را بررسی کن.";return}btn.disabled=true;status.textContent="در حال آماده‌سازی تصویر فاکتور…";try{const canvas=await window.html2canvas($("invoicePreview"),{scale:2,backgroundColor:"#fff",useCORS:true,logging:false}),a=document.createElement("a"),n=($("invoiceNumber").value.trim()||"new").replace(/[^\w\u0600-\u06FF-]/g,"_");a.download=`ForushNameh-invoice-${n}.png`;a.href=canvas.toDataURL("image/png");a.click();status.textContent="تصویر فاکتور آماده شد."}catch(e){status.textContent="ساخت تصویر انجام نشد؛ صفحه را تازه‌سازی و دوباره امتحان کن."}finally{btn.disabled=false}});
 drawItems();preview();drawInvoices();drawProductList();drawCustomerList();drawCustomerPicker();drawStockPicker();drawMovements();drawDashboard();drawDashboard();
}

function setAuthMode(mode){
 authMode=mode;
 const signup=mode==="signup",reset=mode==="reset",updatePassword=mode==="updatepassword";
 $("authTitle").textContent=signup?"ساخت حساب کاربری":reset?"بازیابی رمز عبور":updatePassword?"تعیین رمز عبور جدید":"ورود به فروش‌نامه";
 $("authDescription").textContent=signup?"برای ساخت حساب، نام، ایمیل و یک رمز عبور امن وارد کن.":reset?"ایمیل حساب خود را وارد کن تا پیوند بازیابی رمز برایت ارسال شود.":updatePassword?"یک رمز عبور تازه و امن برای حساب خود انتخاب کن.":"برای دسترسی به فضای کاری خود وارد حساب کاربری‌ات شو.";
 $("fullNameField").hidden=!signup;$("confirmPasswordField").hidden=!(signup||updatePassword);$("passwordField").hidden=reset;
 $("authPassword").required=!reset;$("authConfirmPassword").required=signup||updatePassword;
 $("authPassword").autocomplete=signup?"new-password":"current-password";
 $("authSubmit").textContent=signup?"ایجاد حساب":reset?"ارسال پیوند بازیابی":updatePassword?"ذخیرهٔ رمز جدید":"ورود";
 $("toggleAuthMode").hidden=reset||updatePassword;$("forgotPasswordButton").hidden=signup||reset||updatePassword;
 $("toggleAuthMode").textContent=signup?"قبلاً حساب ساخته‌ام؛ ورود":"ساخت حساب جدید";
 $("authStatus").textContent="";
}
function showAuthMessage(message,isError=false){const el=$("authStatus");el.textContent=message;el.classList.toggle("error",isError)}
function showAuthenticatedApp(user){
 currentUser=user;document.querySelector("main.page").hidden=false;
 KEYS=Object.fromEntries(Object.entries(BASE_KEYS).map(([k,v])=>[k,`${v}.${user.id}`]));
 products=read(KEYS.products,[]);customers=read(KEYS.customers,[]);movements=read(KEYS.movements,[]);
 $("authScreen").hidden=true;$("accountEmail").hidden=false;$("accountEmail").textContent=user.email||"حساب کاربری";$("signOutButton").hidden=false;
 if(!window.forushnamehInitialized){init();window.forushnamehInitialized=true}
 else{drawInvoices();drawProductList();drawCustomerList();drawCustomerPicker();drawStockPicker();drawMovements();drawDashboard()}
}
function showSignedOut(){
 currentUser=null;$("authScreen").hidden=false;$("authPassword").value="";$("authConfirmPassword").value="";$("accountEmail").hidden=true;$("signOutButton").hidden=true;
 document.querySelector("main.page").hidden=true;setAuthMode("login");
}
async function handleAuthSubmit(event){
 event.preventDefault();const email=$("authEmail").value.trim(),password=$("authPassword").value,name=$("authFullName").value.trim();
 if(!email){showAuthMessage("ایمیل را وارد کن.",true);return}
 if(authMode!=="reset"&&password.length<8){showAuthMessage("رمز عبور باید حداقل ۸ نویسه داشته باشد.",true);return}
 if((authMode==="signup"||authMode==="updatepassword")&&password!==$("authConfirmPassword").value){showAuthMessage("تکرار رمز عبور با رمز اصلی یکسان نیست.",true);return}
 const btn=$("authSubmit");btn.disabled=true;showAuthMessage("در حال برقراری ارتباط…");
 try{
  if(authMode==="updatepassword"){
   const {data,error}=await supabaseClient.auth.updateUser({password});if(error)throw error;showAuthenticatedApp(data.user);showAuthMessage("رمز عبور جدید ذخیره شد.");
  }else if(authMode==="signup"){
   const {data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{full_name:name},emailRedirectTo:"https://ahmadzamani031.github.io/Forushnameh/"}});if(error)throw error;
   if(data.session){showAuthenticatedApp(data.user);showAuthMessage("حساب ساخته شد و وارد شدی.")}else{showAuthMessage("حساب ساخته شد. ایمیل خود را باز کن و پیوند تأیید را بزن؛ سپس به همین سایت برگرد و وارد شو.")}
  }else if(authMode==="reset"){
   const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:"https://ahmadzamani031.github.io/Forushnameh/"});if(error)throw error;showAuthMessage("اگر حسابی با این ایمیل وجود داشته باشد، پیوند بازیابی برایت ارسال می‌شود.");
  }else{
   const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});if(error)throw error;showAuthenticatedApp(data.user);showAuthMessage("با موفقیت وارد شدی.");
  }
 }catch(error){showAuthMessage(authErrorMessage(error),true)}finally{btn.disabled=false}
}
function authErrorMessage(error){
 const m=String(error?.message||"").toLowerCase();
 if(m.includes("invalid login credentials"))return "ایمیل یا رمز عبور صحیح نیست.";
 if(m.includes("email not confirmed"))return "ابتدا ایمیل خود را تأیید کن و سپس وارد شو.";
 if(m.includes("user already registered"))return "این ایمیل قبلاً ثبت‌نام کرده است؛ وارد حساب شو.";
 if(m.includes("password should be at least"))return "رمز عبور باید حداقل ۸ نویسه داشته باشد.";
 if(m.includes("rate limit"))return "تعداد درخواست‌ها زیاد شده است؛ کمی بعد دوباره تلاش کن.";
 if(m.includes("failed to fetch"))return "ارتباط با سرور برقرار نشد؛ اینترنت و تنظیمات اتصال را بررسی کن.";
 return error?.message||"خطایی رخ داد. دوباره تلاش کن.";
}
async function startAuth(){
 document.querySelector("main.page").hidden=true;
 if(!window.supabase?.createClient){showSignedOut();showAuthMessage("کتابخانهٔ اتصال بارگذاری نشد؛ اتصال اینترنت را بررسی و صفحه را تازه‌سازی کن.",true);return}
 supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
 $("authForm").addEventListener("submit",handleAuthSubmit);
 $("toggleAuthMode").addEventListener("click",()=>setAuthMode(authMode==="signup"?"login":"signup"));
 $("forgotPasswordButton").addEventListener("click",()=>setAuthMode("reset"));
 $("signOutButton").addEventListener("click",async()=>{const {error}=await supabaseClient.auth.signOut();if(error){alert(authErrorMessage(error));return}showSignedOut()});
 supabaseClient.auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_IN"&&session?.user)showAuthenticatedApp(session.user);if(event==="SIGNED_OUT")showSignedOut();if(event==="PASSWORD_RECOVERY"){recoveryMode=true;document.querySelector("main.page").hidden=true;$("authScreen").hidden=false;setAuthMode("updatepassword");showAuthMessage("پیوند بازیابی تأیید شد؛ رمز جدیدت را وارد کن.")}});
 const {data:{session},error}=await supabaseClient.auth.getSession();
 if(error){showSignedOut();showAuthMessage(authErrorMessage(error),true);return}
 if(session?.user&&!recoveryMode){showAuthenticatedApp(session.user)}else if(!recoveryMode){showSignedOut()}
}
startAuth();
})();