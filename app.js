(() => {
"use strict";
const $ = id => document.getElementById(id);
const KEYS={invoices:"forushnameh.invoices.v2",products:"forushnameh.products.v1",customers:"forushnameh.customers.v1"};
const invoiceFields=["storeName","storePhone","storeAddress","customerName","customerPhone","invoiceNumber","invoiceDate","currency","notes"];
let items=[{id:1,name:"محصول نمونه",quantity:1,price:250000,productId:""},{id:2,name:"خدمات",quantity:2,price:50000,productId:""}];
let nextItemId=3, editingInvoiceId=null, editingProductId=null, editingCustomerId=null;
let products=read(KEYS.products,[]), customers=read(KEYS.customers,[]);
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
function saveInvoice(){
 const list=read(KEYS.invoices,[]),obj={id:editingInvoiceId||`inv-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,data:invoiceData(),items:items.map(x=>({name:x.name,quantity:num(x.quantity),price:num(x.price),productId:x.productId||""})),updatedAt:Date.now()};
 const i=list.findIndex(x=>x.id===obj.id);if(i>=0)list[i]=obj;else list.push(obj);
 if(write(KEYS.invoices,list,"savedStatus")){editingInvoiceId=obj.id;$("savedStatus").textContent="فاکتور ذخیره شد." ;drawInvoices()}
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
function clearProductForm(){editingProductId=null;["productName","productCode","productPrice","productStock","productMinStock","productNote"].forEach(id=>$(id).value="");$("productUnit").value="عدد";$("saveProduct").textContent="ثبت کالا";$("cancelProductEdit").hidden=true}
function saveProduct(){
 const name=$("productName").value.trim();if(!name){$("productStatus").textContent="لطفاً نام کالا را وارد کن.";return}
 const code=$("productCode").value.trim(),duplicate=products.find(p=>p.code&&code&&p.code.toLowerCase()===code.toLowerCase()&&p.id!==editingProductId);
 if(duplicate){$("productStatus").textContent="این کد کالا قبلاً ثبت شده است.";return}
 const p={id:editingProductId||`prd-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,name,code,unit:$("productUnit").value,price:num($("productPrice").value),stock:num($("productStock").value),minStock:num($("productMinStock").value),note:$("productNote").value.trim()};
 const i=products.findIndex(x=>x.id===p.id);if(i>=0)products[i]=p;else products.push(p);
 if(write(KEYS.products,products,"productStatus")){$("productStatus").textContent="کالا ذخیره شد.";clearProductForm();drawProductList();drawItems()}
}
function editProduct(id){const p=productById(id);if(!p)return;editingProductId=id;$("productName").value=p.name;$("productCode").value=p.code;$("productUnit").value=p.unit;$("productPrice").value=p.price;$("productStock").value=p.stock;$("productMinStock").value=p.minStock;$("productNote").value=p.note||"";$("saveProduct").textContent="ذخیرهٔ تغییرات";$("cancelProductEdit").hidden=false}
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
 if(write(KEYS.customers,customers,"customerStatus")){$("customerStatus").textContent="مشتری ذخیره شد.";clearCustomerForm();drawCustomerList();drawCustomerPicker()}
}
function editCustomer(id){const c=customers.find(x=>x.id===id);if(!c)return;editingCustomerId=id;$("customerRecordName").value=c.name;$("customerRecordPhone").value=c.phone;$("customerRecordEmail").value=c.email;$("customerRecordAddress").value=c.address;$("saveCustomer").textContent="ذخیرهٔ تغییرات";$("cancelCustomerEdit").hidden=false}
function backupExport(){
 const payload={app:"ForushNameh",formatVersion:1,createdAt:new Date().toISOString(),invoices:read(KEYS.invoices,[]),products,customers};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=`ForushNameh-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);$("backupStatus").textContent="فایل پشتیبان ساخته شد؛ آن را در جای امن نگه دار.";
}
async function backupImport(file){
 if(!file)return;
 try{
  const x=JSON.parse(await file.text());
  if(x.app!=="ForushNameh"||!Array.isArray(x.invoices)||!Array.isArray(x.products)||!Array.isArray(x.customers))throw Error("invalid");
  if(!confirm("بازیابی، فاکتورها، کالاها و مشتریان فعلی این مرورگر را جایگزین می‌کند. ادامه می‌دهی؟"))return;
  const ok1=write(KEYS.invoices,x.invoices,"backupStatus"),ok2=write(KEYS.products,x.products,"backupStatus"),ok3=write(KEYS.customers,x.customers,"backupStatus");
  if(ok1&&ok2&&ok3){products=x.products;customers=x.customers;drawInvoices();drawProductList();drawCustomerList();drawCustomerPicker();drawItems();$("backupStatus").textContent="بازیابی اطلاعات انجام شد."}
 }catch(e){$("backupStatus").textContent="فایل انتخاب‌شده معتبر نیست یا قابل خواندن نیست."}
 $("importData").value="";
}
function init(){
 const d=new Date();$("invoiceDate").value=$("invoiceDate").value||today();
 invoiceFields.forEach(id=>{$(id).addEventListener("input",preview);$(id).addEventListener("change",preview)});
 $("itemsEditor").addEventListener("input",e=>{const el=e.target,it=items.find(x=>x.id===Number(el.dataset.id)),f=el.dataset.field;if(!it||!f)return;if(f==="name")it.name=el.value;if(f==="quantity")it.quantity=num(el.value);if(f==="price")it.price=num(el.value);preview()});
 $("itemsEditor").addEventListener("change",e=>{const el=e.target;if(el.dataset.field==="productId"){const it=items.find(x=>x.id===Number(el.dataset.id)),p=productById(el.value);if(!it)return;it.productId=el.value;if(p){it.name=p.name;it.price=p.price;drawItems();preview()}}});
 $("itemsEditor").addEventListener("click",e=>{const b=e.target.closest("[data-remove]");if(!b||items.length===1)return;items=items.filter(x=>x.id!==Number(b.dataset.remove));drawItems();preview()});
 $("addItem").addEventListener("click",()=>{items.push({id:nextItemId++,name:"",quantity:1,price:0,productId:""});drawItems();preview()});
 $("currency").addEventListener("change",()=>{drawItems();preview()});
 $("customerPicker").addEventListener("change",()=>{const c=customers.find(x=>x.id===$("customerPicker").value);if(c){$("customerName").value=c.name;$("customerPhone").value=c.phone;$("previewCustomerName").textContent=c.name;$("previewCustomerPhone").textContent=c.phone?`تلفن: ${c.phone}`:""}});
 $("saveInvoice").addEventListener("click",saveInvoice);$("newInvoice").addEventListener("click",newInvoice);
 $("savedInvoices").addEventListener("click",e=>{const o=e.target.closest("[data-open-invoice]"),d=e.target.closest("[data-delete-invoice]");if(o){loadInvoice(o.dataset.openInvoice);return}if(d&&confirm("این فاکتور حذف شود؟")){write(KEYS.invoices,read(KEYS.invoices,[]).filter(x=>x.id!==d.dataset.deleteInvoice),"savedStatus");drawInvoices()}});
 $("saveProduct").addEventListener("click",saveProduct);$("cancelProductEdit").addEventListener("click",clearProductForm);$("productSearch").addEventListener("input",drawProductList);
 $("productsList").addEventListener("click",e=>{const edit=e.target.closest("[data-edit-product]"),del=e.target.closest("[data-delete-product]");if(edit){editProduct(edit.dataset.editProduct);return}if(del&&confirm("این کالا حذف شود؟ فاکتورهای قبلی تغییر نمی‌کنند.")){products=products.filter(p=>p.id!==del.dataset.deleteProduct);write(KEYS.products,products,"productStatus");drawProductList();drawItems()}});
 $("saveCustomer").addEventListener("click",saveCustomer);$("cancelCustomerEdit").addEventListener("click",clearCustomerForm);$("customerSearch").addEventListener("input",drawCustomerList);
 $("customersList").addEventListener("click",e=>{const edit=e.target.closest("[data-edit-customer]"),del=e.target.closest("[data-delete-customer]");if(edit){editCustomer(edit.dataset.editCustomer);return}if(del&&confirm("این مشتری حذف شود؟ فاکتورهای قبلی تغییر نمی‌کنند.")){customers=customers.filter(c=>c.id!==del.dataset.deleteCustomer);write(KEYS.customers,customers,"customerStatus");drawCustomerList();drawCustomerPicker()}});
 $("exportData").addEventListener("click",backupExport);$("importData").addEventListener("change",e=>backupImport(e.target.files[0]));
 $("downloadPng").addEventListener("click",async()=>{const btn=$("downloadPng"),status=$("statusMessage");if(typeof window.html2canvas!=="function"){status.textContent="ابزار ساخت تصویر بارگذاری نشده است؛ اتصال اینترنت را بررسی کن.";return}btn.disabled=true;status.textContent="در حال آماده‌سازی تصویر فاکتور…";try{const canvas=await window.html2canvas($("invoicePreview"),{scale:2,backgroundColor:"#fff",useCORS:true,logging:false}),a=document.createElement("a"),n=($("invoiceNumber").value.trim()||"new").replace(/[^\w\u0600-\u06FF-]/g,"_");a.download=`ForushNameh-invoice-${n}.png`;a.href=canvas.toDataURL("image/png");a.click();status.textContent="تصویر فاکتور آماده شد."}catch(e){status.textContent="ساخت تصویر انجام نشد؛ صفحه را تازه‌سازی و دوباره امتحان کن."}finally{btn.disabled=false}});
 drawItems();preview();drawInvoices();drawProductList();drawCustomerList();drawCustomerPicker();
}
init();
})();
