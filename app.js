(() => {
"use strict";
const $ = id => document.getElementById(id);
const SUPABASE_URL="https://exlvtibujxklnigguzkz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_rndKASKUTndUiotNPWVxsg_GbylnlX0";
const BASE_KEYS={invoices:"forushnameh.invoices.v2",products:"forushnameh.products.v1",customers:"forushnameh.customers.v1",movements:"forushnameh.movements.v1"};
let KEYS=Object.fromEntries(Object.entries(BASE_KEYS).map(([k,v])=>[k,`${v}.signed-out`]));
let supabaseClient=null;
let currentUser=null;
let authMode="login";
let recoveryMode=false;
const invoiceFields=["storeName","storePhone","storeAddress","customerName","customerPhone","invoiceNumber","invoiceDate","currency","discountAmount","taxAmount","notes"];
let items=[{id:1,name:"محصول نمونه",quantity:1,price:250000,productId:""},{id:2,name:"خدمات",quantity:2,price:50000,productId:""}];
let nextItemId=3, editingInvoiceId=null, editingProductId=null, editingCustomerId=null;
let products=[], customers=[], movements=[], cloudInvoices=[], businessSettings=null;
let selectedPaymentInvoiceId=null;
let invoiceFilterState={query:"",payment:"all",from:"",to:""};
let currentReportRows=[];
function read(key,fallback){try{const x=JSON.parse(localStorage.getItem(key)||"null");return Array.isArray(x)?x:fallback}catch(e){return fallback}}
function write(key,value,statusId){try{localStorage.setItem(key,JSON.stringify(value));return true}catch(e){if(statusId)$(statusId).textContent="ذخیره انجام نشد؛ فضای ذخیره‌سازی مرورگر ممکن است کافی نباشد.";return false}}
function fa(n){return new Intl.NumberFormat("fa-IR",{maximumFractionDigits:2}).format(Number(n)||0)}
function num(v){const s=String(v??"").replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[،٬,\s]/g,"");const n=Number(s);return Number.isFinite(n)?Math.max(0,n):0}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function invoiceData(){return Object.fromEntries(invoiceFields.map(id=>[id,$(id).value.trim()]))}
function total(list=items){return list.reduce((s,it)=>s+num(it.quantity)*num(it.price),0)}
const persianCalendarFormatter=new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn",{year:"numeric",month:"2-digit",day:"2-digit",timeZone:"UTC"});
const jalaliYearCache=new Map();
function normalizeDigits(value){return String(value??"").replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[.\-]/g,"/").trim()}
function persianDateParts(date){const parts=persianCalendarFormatter.formatToParts(date),get=t=>Number(parts.find(x=>x.type===t)?.value);return {year:get("year"),month:get("month"),day:get("day")}}
function toPersianDigits(value){return String(value).replace(/\d/g,d=>"۰۱۲۳۴۵۶۷۸۹"[Number(d)])}
function formatJalaliDate(iso){if(!iso)return "";const m=String(iso).slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return String(iso);const p=persianDateParts(new Date(Date.UTC(+m[1],+m[2]-1,+m[3],12)));return toPersianDigits(p.year+"/"+String(p.month).padStart(2,"0")+"/"+String(p.day).padStart(2,"0"))}
function jalaliYearMap(jy){if(jalaliYearCache.has(jy))return jalaliYearCache.get(jy);const map=new Map(),start=Date.UTC(jy+621,2,19,12),end=Date.UTC(jy+622,2,23,12);for(let t=start;t<=end;t+=86400000){const d=new Date(t),p=persianDateParts(d);if(p.year===jy)map.set(p.month+"/"+p.day,d.toISOString().slice(0,10))}jalaliYearCache.set(jy,map);return map}
function jalaliToGregorian(value){const raw=normalizeDigits(value),m=raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);if(!m)return null;const y=+m[1],month=+m[2],day=+m[3];if(month<1||month>12||day<1||day>31)return null;return jalaliYearMap(y).get(month+"/"+day)||null}
function today(){const p=persianDateParts(new Date());return toPersianDigits(p.year+"/"+String(p.month).padStart(2,"0")+"/"+String(p.day).padStart(2,"0"))}
if(!$("invoiceDate").value)$("invoiceDate").value=today();
function productById(id){return products.find(p=>p.id===id)}
function mapCloudProduct(row){return {id:row.id,name:row.name,code:row.sku||"",unit:row.unit||"عدد",price:Number(row.sale_price)||0,stock:Number(row.stock_on_hand)||0,minStock:Number(row.min_stock)||0,note:row.note||"",isActive:row.is_active!==false}}
function mapCloudCustomer(row){return {id:row.id,name:row.name,phone:row.phone||"",email:row.email||"",address:row.address||"",note:row.note||"",isActive:row.is_active!==false}}
function cloudError(error){return error?.message||"ارتباط با پایگاه داده برقرار نشد."}
async function loadCloudData(){
 const requestedUserId=currentUser?.id;
 if(!supabaseClient||!requestedUserId)return;
 const [pr,cr,mr]=await Promise.all([
  supabaseClient.from("products").select("id,name,sku,unit,sale_price,stock_on_hand,min_stock,note,is_active,created_at,updated_at").eq("is_active",true).order("name"),
  supabaseClient.from("customers").select("id,name,phone,email,address,note,is_active,created_at,updated_at").eq("is_active",true).order("name"),
  supabaseClient.from("inventory_movements").select("id,product_id,movement_type,quantity_delta,description,reference,occurred_at").order("occurred_at",{ascending:false}).limit(100)
 ]);
 // A slower response from a previous account must never overwrite the active account's state.
 if(currentUser?.id!==requestedUserId)return false;
 if(pr.error)throw pr.error;if(cr.error)throw cr.error;if(mr.error)throw mr.error;
 const nextProducts=(pr.data||[]).map(mapCloudProduct),nextCustomers=(cr.data||[]).map(mapCloudCustomer);
 const nextMovements=(mr.data||[]).map(m=>{const p=nextProducts.find(x=>x.id===m.product_id);return {id:m.id,kind:m.movement_type==="purchase"||m.movement_type==="opening"?"in":m.movement_type==="sale"?"sale":"return",productId:m.product_id,productName:p?.name||"کالای غیرفعال",quantity:Math.abs(Number(m.quantity_delta)||0),description:m.description||"",reference:m.reference||"",date:m.occurred_at}});
 // Recheck immediately before committing the fetched data to shared application state.
 if(currentUser?.id!==requestedUserId)return false;
 products=nextProducts;customers=nextCustomers;movements=nextMovements;
 drawProductList();drawCustomerList();drawCustomerPicker();drawStockPicker();drawMovements();
 await loadCloudInvoices(requestedUserId);
 if(currentUser?.id!==requestedUserId)return false;
 try{await loadBusinessSettings(requestedUserId)}catch(settingsError){$("businessSettingsStatus").textContent="بارگذاری تنظیمات انجام نشد: "+cloudError(settingsError)}
 if(currentUser?.id!==requestedUserId)return false;
 drawDashboard();drawReports();
 return true;
}
async function loadCloudInvoices(requestedUserId=currentUser?.id){
 if(!supabaseClient||!requestedUserId)return false;
 const invoiceColumns="id,invoice_number,invoice_date,status,currency,business_name_snapshot,business_phone_snapshot,business_address_snapshot,customer_name_snapshot,customer_phone_snapshot,notes,subtotal,discount_amount,tax_amount,total_amount,created_at";
 const itemColumns="id,invoice_id,product_id,description,quantity,unit,unit_price,sort_order";
 const paymentColumns="id,invoice_id,payment_type,amount,payment_method,paid_at,reference,note,reversal_of,created_at";
 const rows=[];let from=0;const pageSize=1000;
 while(true){
  const {data,error}=await supabaseClient.from("invoices").select(invoiceColumns).order("created_at",{ascending:false}).order("id",{ascending:false}).range(from,from+pageSize-1);
  if(currentUser?.id!==requestedUserId)return false;if(error)throw error;
  const batch=data||[];rows.push(...batch);if(batch.length<pageSize)break;from+=pageSize;
 }
 const ids=rows.map(x=>x.id),itemRows=[],paymentRows=[];
 for(let i=0;i<ids.length;i+=100){
  const idBatch=ids.slice(i,i+100);let itemFrom=0;
  while(true){
   const {data,error}=await supabaseClient.from("invoice_items").select(itemColumns).in("invoice_id",idBatch).order("invoice_id").order("sort_order").order("id").range(itemFrom,itemFrom+pageSize-1);
   if(currentUser?.id!==requestedUserId)return false;if(error)throw error;
   const batch=data||[];itemRows.push(...batch);if(batch.length<pageSize)break;itemFrom+=pageSize;
  }
  let paymentFrom=0;
  while(true){
   const {data,error}=await supabaseClient.from("invoice_payments").select(paymentColumns).in("invoice_id",idBatch).order("paid_at",{ascending:false}).order("id",{ascending:false}).range(paymentFrom,paymentFrom+pageSize-1);
   if(currentUser?.id!==requestedUserId)return false;if(error)throw error;
   const batch=data||[];paymentRows.push(...batch);if(batch.length<pageSize)break;paymentFrom+=pageSize;
  }
 }
 const grouped=new Map(),paymentGroups=new Map();
 itemRows.forEach(row=>{if(!grouped.has(row.invoice_id))grouped.set(row.invoice_id,[]);grouped.get(row.invoice_id).push({id:row.id,name:row.description||"",quantity:Number(row.quantity)||0,price:Number(row.unit_price)||0,productId:row.product_id||"",unit:row.unit||"عدد"})});
 paymentRows.forEach(row=>{if(!paymentGroups.has(row.invoice_id))paymentGroups.set(row.invoice_id,[]);paymentGroups.get(row.invoice_id).push({id:row.id,type:row.payment_type,amount:Number(row.amount)||0,method:row.payment_method,paidAt:row.paid_at,reference:row.reference||"",note:row.note||"",reversalOf:row.reversal_of||""})});
 cloudInvoices=rows.map(row=>{
  const payments=paymentGroups.get(row.id)||[],reversedIds=new Set(payments.filter(p=>p.type==="reversal").map(p=>p.reversalOf));
  const paidAmount=payments.reduce((sum,p)=>sum+(p.type==="receipt"?p.amount:-p.amount),0);
  const totalAmount=Number(row.total_amount)||0,balance=Math.max(0,totalAmount-paidAmount);
  return {id:row.id,status:row.status,subtotal:Number(row.subtotal)||0,discountAmount:Number(row.discount_amount)||0,taxAmount:Number(row.tax_amount)||0,totalAmount,paidAmount,balance,paymentStatus:balance<=0.005?"paid":paidAmount>0?"partial":"unpaid",payments:payments.map(p=>({...p,reversed:reversedIds.has(p.id)})),data:{invoiceNumber:row.invoice_number||"",invoiceDate:formatJalaliDate(row.invoice_date),invoiceDateISO:row.invoice_date||"",currency:row.currency||"تومان",storeName:row.business_name_snapshot||"",storePhone:row.business_phone_snapshot||"",storeAddress:row.business_address_snapshot||"",customerName:row.customer_name_snapshot||"",customerPhone:row.customer_phone_snapshot||"",discountAmount:String(Number(row.discount_amount)||0),taxAmount:String(Number(row.tax_amount)||0),notes:row.notes||""},items:grouped.get(row.id)||[],createdAt:row.created_at};
 });
 drawInvoices();if(selectedPaymentInvoiceId)drawPaymentPanel();return true;
}

async function loadBusinessSettings(requestedUserId=currentUser?.id){
 if(!supabaseClient||!requestedUserId)return false;
 const {data,error}=await supabaseClient.from("business_settings")
  .select("user_id,business_name,phone,address,default_currency,invoice_prefix,next_invoice_number")
  .eq("user_id",requestedUserId).maybeSingle();
 if(currentUser?.id!==requestedUserId)return false;
 if(error)throw error;
 if(!data)throw new Error("تنظیمات کسب‌وکار برای این حساب پیدا نشد.");
 businessSettings=data;
 $("businessName").value=data.business_name||"";
 $("businessPhone").value=data.phone||"";
 $("businessAddress").value=data.address||"";
 $("businessCurrency").value=data.default_currency||"تومان";
 $("businessInvoicePrefix").value=data.invoice_prefix||"";
 $("businessNextNumber").textContent=fa(data.next_invoice_number);
 $("storeName").value=data.business_name||"";
 $("storePhone").value=data.phone||"";
 $("storeAddress").value=data.address||"";
 $("currency").value=data.default_currency||"تومان";
 drawItems();preview();
 return true;
}
async function saveBusinessSettings(){
 const requestedUserId=currentUser?.id;
 if(!supabaseClient||!requestedUserId)return;
 const business_name=$("businessName").value.trim();
 const phone=$("businessPhone").value.trim();
 const address=$("businessAddress").value.trim();
 const default_currency=$("businessCurrency").value;
 const invoice_prefix=$("businessInvoicePrefix").value.trim();
 if(!business_name||!default_currency){
  $("businessSettingsStatus").textContent="نام کسب‌وکار و واحد پول پیش‌فرض را مشخص کن.";return;
 }
 if(invoice_prefix.length>20){$("businessSettingsStatus").textContent="پیشوند شماره فاکتور حداکثر می‌تواند ۲۰ نویسه باشد.";return}
 const btn=$("saveBusinessSettings");btn.disabled=true;
 $("businessSettingsStatus").textContent="در حال ذخیرهٔ تنظیمات در فضای ابری…";
 try{
  const {data,error}=await supabaseClient.from("business_settings")
   .update({business_name,phone,address,default_currency,invoice_prefix})
   .eq("user_id",requestedUserId)
   .select("user_id,business_name,phone,address,default_currency,invoice_prefix,next_invoice_number")
   .single();
  if(error)throw error;
  if(currentUser?.id!==requestedUserId)return;
  businessSettings=data;
  $("businessNextNumber").textContent=fa(data.next_invoice_number);
  $("storeName").value=data.business_name;$("storePhone").value=data.phone;
  $("storeAddress").value=data.address;$("currency").value=data.default_currency;
  drawItems();preview();
  $("businessSettingsStatus").textContent="تنظیمات کسب‌وکار با موفقیت در فضای ابری ذخیره شد و در فاکتورهای جدید استفاده می‌شود.";
 }catch(error){
  if(currentUser?.id===requestedUserId)$("businessSettingsStatus").textContent="ذخیرهٔ تنظیمات انجام نشد: "+cloudError(error);
 }finally{
  if(currentUser?.id===requestedUserId)btn.disabled=false;
 }
}

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
 $("previewCurrency").textContent=d.currency||"تومان";$("previewCurrencyTotal").textContent=d.currency||"تومان";$("previewItems").innerHTML=items.map(it=>`<tr><td>${esc(it.name||"—")}</td><td>${fa(it.quantity)}</td><td>${fa(it.price)}</td><td>${fa(it.quantity*it.price)}</td></tr>`).join("");
 const subtotal=total(),discount=num(d.discountAmount),tax=num(d.taxAmount),grand=Math.max(0,subtotal-discount+tax);
 $("previewSubtotal").textContent=fa(subtotal);$("previewDiscount").textContent=fa(discount);$("previewTax").textContent=fa(tax);$("previewTotal").textContent=fa(grand);$("previewNotes").textContent=d.notes||"از خرید شما سپاسگزاریم.";$("previewNotesBlock").style.display=d.notes?"block":"none";
 items.forEach(it=>{const c=$("itemsEditor").querySelector(`[data-item-id="${it.id}"]`);if(c)c.querySelector("input[disabled]").value=fa(it.quantity*it.price)});
}
function invoiceMatchesFilters(invoice){
 const q=String(invoiceFilterState.query||"").trim().toLocaleLowerCase("fa");
 if(q){
  const haystack=[invoice.data.invoiceNumber,invoice.data.customerName,invoice.data.customerPhone].join(" ").toLocaleLowerCase("fa");
  if(!haystack.includes(q))return false;
 }
 if(invoiceFilterState.payment!=="all"&&invoice.paymentStatus!==invoiceFilterState.payment)return false;
 const date=invoice.data.invoiceDateISO||"";
 if(invoiceFilterState.from&&date<invoiceFilterState.from)return false;
 if(invoiceFilterState.to&&date>invoiceFilterState.to)return false;
 return true;
}
function readInvoiceFilters(){
 invoiceFilterState.query=$("invoiceSearch").value||"";
 invoiceFilterState.payment=$("invoicePaymentFilter").value||"all";
 const fromText=$("invoiceDateFrom").value.trim(),toText=$("invoiceDateTo").value.trim();
 const from=fromText?jalaliToGregorian(fromText):"",to=toText?jalaliToGregorian(toText):"";
 const status=$("invoiceFilterStatus");
 if(fromText&&!from){status.textContent="تاریخ شروع معتبر نیست؛ نمونه: ۱۴۰۵/۰۱/۰۱";return false}
 if(toText&&!to){status.textContent="تاریخ پایان معتبر نیست؛ نمونه: ۱۴۰۵/۱۲/۲۹";return false}
 if(from&&to&&from>to){status.textContent="تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد.";return false}
 invoiceFilterState.from=from;invoiceFilterState.to=to;return true;
}
function drawInvoices(){
 const host=$("savedInvoices"),status=$("invoiceFilterStatus");
 if(!cloudInvoices.length){host.innerHTML='<p class="helper">هنوز فاکتوری در فضای ابری ثبت نشده است.</p>';status.textContent="";return}
 const filtered=cloudInvoices.filter(invoiceMatchesFilters);
 status.textContent=fa(filtered.length)+" فاکتور از "+fa(cloudInvoices.length)+" فاکتور";
 if(!filtered.length){host.innerHTML='<p class="helper">فاکتوری با این معیارها پیدا نشد. فیلترها را تغییر بده یا پاک کن.</p>';return}
 host.innerHTML=filtered.map(x=>{
  const paymentStatus=x.paymentStatus==="paid"?"تسویه‌شده":x.paymentStatus==="partial"?"پرداخت جزئی":"پرداخت‌نشده";
  return '<div class="saved-invoice"><div class="saved-invoice-info"><strong>'+esc(x.data.invoiceNumber||"بدون شماره")+' — '+esc(x.data.customerName||"بدون نام مشتری")+'</strong><span>'+esc(x.data.invoiceDate||"بدون تاریخ")+' · '+fa(x.totalAmount)+' '+esc(x.data.currency||"تومان")+' · '+(x.status==="issued"?"صادرشده":esc(x.status||""))+'</span><span>وضعیت پرداخت: '+paymentStatus+' · دریافتی: '+fa(x.paidAmount)+' · مانده: '+fa(x.balance)+' '+esc(x.data.currency||"تومان")+'</span></div><div class="saved-invoice-actions"><button class="button button-light" data-open-invoice="'+esc(x.id)+'">جزئیات و چاپ</button><button class="button button-light" data-payment-invoice="'+esc(x.id)+'">'+(x.balance>0?"ثبت دریافت":"سوابق دریافت")+'</button></div></div>';
 }).join("");
}
function applyInvoiceFilters(){
 if(!readInvoiceFilters())return;
 drawInvoices();
}
function clearInvoiceFilters(){
 $("invoiceSearch").value="";$("invoicePaymentFilter").value="all";$("invoiceDateFrom").value="";$("invoiceDateTo").value="";
 invoiceFilterState={query:"",payment:"all",from:"",to:""};drawInvoices();
}

function paymentMethodLabel(method){return ({cash:"نقدی",card:"کارت‌خوان",bank_transfer:"واریز بانکی",other:"سایر"})[method]||"سایر"}
function drawPaymentPanel(){
 const panel=$("paymentPanel"),invoice=cloudInvoices.find(x=>x.id===selectedPaymentInvoiceId);
 if(!panel||!invoice){if(panel)panel.hidden=true;return}
 panel.hidden=false;$("paymentPanelTitle").textContent="دریافت‌های فاکتور "+(invoice.data.invoiceNumber||"");
 $("paymentInvoiceSummary").textContent="مبلغ فاکتور: "+fa(invoice.totalAmount)+" · دریافتی: "+fa(invoice.paidAmount)+" · مانده: "+fa(invoice.balance)+" "+(invoice.data.currency||"تومان");
 $("paymentAmount").max=String(invoice.balance);$("savePayment").disabled=invoice.balance<=0.005;
 if(invoice.balance>0.005&&(!$("paymentAmount").value||Number($("paymentAmount").value)>invoice.balance))$("paymentAmount").value=invoice.balance.toFixed(2);
 if(invoice.balance<=0.005)$("paymentAmount").value="";
 const history=$("paymentHistory");
 if(!invoice.payments.length){history.innerHTML='<p class="helper">هنوز دریافتی برای این فاکتور ثبت نشده است.</p>';return}
 history.innerHTML=invoice.payments.map(p=>{
  const reversal=p.type==="reversal",action=!reversal&&!p.reversed?'<button class="button button-danger" data-reverse-payment="'+esc(p.id)+'">برگشت دریافت</button>':"";
  return '<div class="record-row"><div class="record-main"><strong>'+(reversal?"برگشت دریافت":"دریافت")+' · '+fa(p.amount)+' '+esc(invoice.data.currency||"تومان")+'</strong><span>'+paymentMethodLabel(p.method)+' · '+new Date(p.paidAt).toLocaleString("fa-IR")+(p.reference?" · پیگیری: "+esc(p.reference):"")+(p.note?" · "+esc(p.note):"")+'</span></div><div class="record-actions">'+action+'</div></div>';
 }).join("");
}
function openPaymentPanel(invoiceId){
 const invoice=cloudInvoices.find(x=>x.id===invoiceId);if(!invoice)return;
 selectedPaymentInvoiceId=invoiceId;$("paymentAmount").value=invoice.balance>0?invoice.balance.toFixed(2):"";
 $("paymentMethod").value="cash";$("paymentReference").value="";$("paymentNote").value="";$("paymentStatus").textContent="";
 drawPaymentPanel();$("paymentPanel").scrollIntoView({behavior:"smooth",block:"nearest"});
}
async function savePayment(){
 const requestedUserId=currentUser?.id,invoice=cloudInvoices.find(x=>x.id===selectedPaymentInvoiceId);if(!requestedUserId||!invoice)return;
 const amount=Number($("paymentAmount").value),method=$("paymentMethod").value;
 if(!Number.isFinite(amount)||amount<=0){$("paymentStatus").textContent="مبلغ دریافتی باید بیشتر از صفر باشد.";return}
 if(amount>invoice.balance+0.005){$("paymentStatus").textContent="مبلغ دریافتی نمی‌تواند از مانده فاکتور بیشتر باشد.";return}
 const btn=$("savePayment");btn.disabled=true;$("paymentStatus").textContent="در حال ثبت دریافت…";
 try{
  const {error}=await supabaseClient.from("invoice_payments").insert({user_id:requestedUserId,invoice_id:invoice.id,payment_type:"receipt",amount,payment_method:method,paid_at:new Date().toISOString(),reference:$("paymentReference").value.trim(),note:$("paymentNote").value.trim()});
  if(error)throw error;if(currentUser?.id!==requestedUserId)return;
  $("paymentAmount").value="";$("paymentReference").value="";$("paymentNote").value="";
  await loadCloudInvoices(requestedUserId);if(currentUser?.id!==requestedUserId)return;
  $("paymentStatus").textContent="دریافت با موفقیت ثبت شد.";
 }catch(error){if(currentUser?.id===requestedUserId)$("paymentStatus").textContent="ثبت دریافت انجام نشد: "+cloudError(error)}
 finally{if(currentUser?.id===requestedUserId)btn.disabled=false}
}
async function reversePayment(paymentId){
 const requestedUserId=currentUser?.id,invoice=cloudInvoices.find(x=>x.id===selectedPaymentInvoiceId),payment=invoice?.payments.find(x=>x.id===paymentId);
 if(!requestedUserId||!invoice||!payment||payment.type!=="receipt"||payment.reversed)return;
 if(!confirm("این دریافت برگشت داده شود؟ سابقه اصلی حفظ خواهد شد."))return;
 $("paymentStatus").textContent="در حال ثبت برگشت دریافت…";
 try{
  const {error}=await supabaseClient.from("invoice_payments").insert({user_id:requestedUserId,invoice_id:invoice.id,payment_type:"reversal",amount:payment.amount,payment_method:payment.method,paid_at:new Date().toISOString(),reference:payment.reference,note:"برگشت دریافت"+(payment.note?": "+payment.note:""),reversal_of:payment.id});
  if(error)throw error;if(currentUser?.id!==requestedUserId)return;
  await loadCloudInvoices(requestedUserId);if(currentUser?.id!==requestedUserId)return;
  $("paymentStatus").textContent="برگشت دریافت ثبت شد؛ سابقه اصلی حذف یا ویرایش نشد.";
 }catch(error){if(currentUser?.id===requestedUserId)$("paymentStatus").textContent="برگشت دریافت انجام نشد: "+cloudError(error)}
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
async function receiveStock(){
 const id=$("stockProduct").value,qty=num($("stockQuantity").value),desc=$("stockDescription").value.trim(),p=productById(id);
 if(!p){$("stockStatus").textContent="ابتدا یک کالا انتخاب کن.";return}
 if(qty<=0){$("stockStatus").textContent="تعداد ورود باید بیشتر از صفر باشد.";return}
 const requestedUserId=currentUser?.id;if(!requestedUserId)return;
 const btn=$("receiveStock");btn.disabled=true;$("stockStatus").textContent="در حال ثبت ورود کالا…";
 try{
  const {error}=await supabaseClient.rpc("forushnameh_record_stock_movement",{p_product_id:id,p_movement_type:"purchase",p_quantity_delta:qty,p_description:desc,p_reference:"",p_occurred_at:new Date().toISOString()});
  if(error)throw error;
  if(currentUser?.id!==requestedUserId)return;
  $("stockQuantity").value="";$("stockDescription").value="";await loadCloudData();if(currentUser?.id!==requestedUserId)return;$("stockStatus").textContent="ورود کالا در پایگاه داده ثبت شد و موجودی به‌روزرسانی شد.";
 }catch(error){if(currentUser?.id===requestedUserId)$("stockStatus").textContent="ثبت ورود کالا انجام نشد: "+cloudError(error)}finally{if(currentUser?.id===requestedUserId)btn.disabled=false}
}
function drawStockPicker(){
 $("stockProduct").innerHTML='<option value="">انتخاب کالا</option>'+products.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} — موجودی: ${fa(p.stock)} ${esc(p.unit)}</option>`).join("");
}
async function saveInvoice(){
 const requestedUserId=currentUser?.id;
 if(!supabaseClient||!requestedUserId){$("savedStatus").textContent="برای صدور فاکتور ابتدا وارد حساب کاربری شو.";return}
 if(editingInvoiceId){$("savedStatus").textContent="این فاکتور قبلاً صادر شده و امکان ویرایش مستقیم آن وجود ندارد. برای صدور فاکتور تازه، «فاکتور جدید» را بزن.";return}
 const dateRaw=normalizeDigits($("invoiceDate").value);
 const invoiceDateISO=jalaliToGregorian(dateRaw);
 if(!invoiceDateISO){$("savedStatus").textContent="تاریخ شمسی معتبر نیست؛ تاریخ را به‌شکل سال/ماه/روز وارد کن.";return}
 if(!items.length||items.some(it=>!String(it.name||"").trim()||num(it.quantity)<=0||num(it.price)<0)){$("savedStatus").textContent="همهٔ ردیف‌ها باید شرح، تعداد بیشتر از صفر و قیمت معتبر داشته باشند.";return}
 const subtotal=total(),discount=num($("discountAmount").value),tax=num($("taxAmount").value);
 if(discount>subtotal){$("savedStatus").textContent="مبلغ تخفیف نمی‌تواند از جمع اقلام بیشتر باشد.";return}
 const payload={customer_id:$("customerPicker").value||null,customer_name:$("customerName").value.trim(),customer_phone:$("customerPhone").value.trim(),invoice_date:invoiceDateISO,currency:$("currency").value||"تومان",notes:$("notes").value.trim(),discount_amount:discount,tax_amount:tax,items:items.map(it=>({product_id:it.productId||null,description:String(it.name||"").trim(),unit:productById(it.productId)?.unit||"عدد",quantity:num(it.quantity),unit_price:num(it.price)}))};
 const btn=$("saveInvoice");btn.disabled=true;$("savedStatus").textContent="در حال صدور فاکتور و بررسی موجودی در پایگاه داده…";
 try{
  const {data,error}=await supabaseClient.rpc("forushnameh_issue_invoice",{p_invoice:payload});if(error)throw error;
  if(currentUser?.id!==requestedUserId)return;
  if(!data?.invoice_id||!data?.invoice_number)throw new Error("پاسخ صدور فاکتور از سرور کامل نیست.");
  $("invoiceNumber").value=data.invoice_number;editingInvoiceId=data.invoice_id;setInvoiceReadOnly(true);
  await loadCloudData();if(currentUser?.id!==requestedUserId)return;
  $("savedStatus").textContent="فاکتور "+data.invoice_number+" با موفقیت صادر و در فضای ابری ثبت شد. موجودی کالاهای انتخاب‌شده نیز به‌روزرسانی شد.";
 }catch(error){if(currentUser?.id===requestedUserId)$("savedStatus").textContent="صدور فاکتور انجام نشد: "+cloudError(error)}
 finally{if(currentUser?.id===requestedUserId)btn.disabled=Boolean(editingInvoiceId)}
}
function setInvoiceReadOnly(readOnly){
 invoiceFields.forEach(id=>$(id).disabled=readOnly);
 $("customerPicker").disabled=readOnly;$("addItem").disabled=readOnly;$("saveInvoice").disabled=readOnly;
 $("itemsEditor").querySelectorAll("input,select,button").forEach(control=>control.disabled=readOnly);
}
function loadInvoice(id){
 const x=cloudInvoices.find(a=>a.id===id);if(!x)return;
 invoiceFields.forEach(k=>{if(x.data[k]!==undefined)$(k).value=x.data[k]});$("customerPicker").value="";
 items=x.items.map((it,i)=>({id:i+1,name:it.name||"",quantity:num(it.quantity),price:num(it.price),productId:it.productId||""}));
 if(!items.length)items=[{id:1,name:"",quantity:1,price:0,productId:""}];
 nextItemId=items.length+1;editingInvoiceId=x.id;drawItems();setInvoiceReadOnly(true);preview();
 $("savedStatus").textContent="فاکتور صادرشده فقط برای مشاهده باز شده است؛ برای صدور فاکتور دیگر، «فاکتور جدید» را بزن.";
 if(window.showForushnamehPage)window.showForushnamehPage("invoice");
}
function newInvoice(){
 setInvoiceReadOnly(false);$("customerPicker").value="";invoiceFields.forEach(k=>{if(k==="storeName"||k==="currency")return;$(k).value=""});
 $("invoiceDate").value=today();$("invoiceNumber").value="";
 if(businessSettings){$("storeName").value=businessSettings.business_name||"";$("storePhone").value=businessSettings.phone||"";$("storeAddress").value=businessSettings.address||"";$("currency").value=businessSettings.default_currency||"تومان"}
 items=[{id:1,name:"",quantity:1,price:0,productId:""}];nextItemId=2;editingInvoiceId=null;drawItems();preview();$("savedStatus").textContent="فاکتور جدید آماده است.";
}

function drawProductList(){
 const q=($("productSearch").value||"").trim().toLowerCase(),host=$("productsList");
 const found=products.filter(p=>p.isActive!==false&&(p.name+" "+p.code).toLowerCase().includes(q));
 if(!found.length){host.innerHTML='<p class="helper">کالایی ثبت نشده است.</p>';return}
 host.innerHTML=found.map(p=>`<div class="record-row"><div class="record-main"><strong>${esc(p.name)}</strong><span>${esc(p.code||"بدون کد")} · ${fa(p.price)} · موجودی: ${fa(p.stock)} ${esc(p.unit)}${p.stock<=p.minStock?' · <b class="low-stock">موجودی کم</b>':""}</span></div><div class="record-actions"><button class="button button-light" data-edit-product="${esc(p.id)}">ویرایش</button><button class="button button-danger" data-delete-product="${esc(p.id)}">حذف</button></div></div>`).join("");
}
function clearProductForm(){editingProductId=null;$("productStock").disabled=false;["productName","productCode","productPrice","productStock","productMinStock","productNote"].forEach(id=>$(id).value="");$("productUnit").value="عدد";$("saveProduct").textContent="ثبت کالا";$("cancelProductEdit").hidden=true}
async function saveProduct(){
 const name=$("productName").value.trim();if(!name){$("productStatus").textContent="لطفاً نام کالا را وارد کن.";return}
 const code=$("productCode").value.trim(),duplicate=products.find(p=>p.code&&code&&p.code.toLowerCase()===code.toLowerCase()&&p.id!==editingProductId);
 if(duplicate){$("productStatus").textContent="این کد کالا قبلاً ثبت شده است.";return}
 const requestedUserId=currentUser?.id;if(!requestedUserId)return;
 const initialStock=editingProductId?0:num($("productStock").value);
 const payload={name,sku:code||null,unit:$("productUnit").value,sale_price:num($("productPrice").value),min_stock:num($("productMinStock").value),note:$("productNote").value.trim(),is_active:true};
 const btn=$("saveProduct");btn.disabled=true;$("productStatus").textContent="در حال ذخیره کالا در فضای ابری…";
 try{
  if(editingProductId){
   const {error}=await supabaseClient.from("products").update(payload).eq("id",editingProductId).select("id").single();
   if(error)throw error;
  }else{
   const {data,error}=await supabaseClient.rpc("forushnameh_create_product",{p_product:payload,p_initial_stock:initialStock});
   if(error)throw error;
   if(!data?.product_id)throw new Error("پاسخ ثبت کالا از سرور کامل نیست.");
  }
  if(currentUser?.id!==requestedUserId)return;
  clearProductForm();await loadCloudData();if(currentUser?.id!==requestedUserId)return;
  $("productStatus").textContent="کالا"+(initialStock>0&&!editingProductId?" و موجودی اولیه":"")+" با موفقیت و به‌صورت یکپارچه در پایگاه داده ثبت شد.";
 }catch(error){if(currentUser?.id===requestedUserId)$("productStatus").textContent="ذخیره کالا انجام نشد: "+cloudError(error)}finally{if(currentUser?.id===requestedUserId)btn.disabled=false}
}
function editProduct(id){if(window.showForushnamehPage)window.showForushnamehPage("products");const p=productById(id);if(!p)return;editingProductId=id;$("productStock").disabled=true;$("productName").value=p.name;$("productCode").value=p.code;$("productUnit").value=p.unit;$("productPrice").value=p.price;$("productStock").value=p.stock;$("productMinStock").value=p.minStock;$("productNote").value=p.note||"";$("saveProduct").textContent="ذخیرهٔ تغییرات";$("cancelProductEdit").hidden=false}
function drawCustomerList(){
 const q=($("customerSearch").value||"").trim().toLowerCase(),host=$("customersList"),found=customers.filter(c=>c.isActive!==false&&(c.name+" "+c.phone).toLowerCase().includes(q));
 if(!found.length){host.innerHTML='<p class="helper">مشتری‌ای ثبت نشده است.</p>';return}
 host.innerHTML=found.map(c=>`<div class="record-row"><div class="record-main"><strong>${esc(c.name)}</strong><span>${esc(c.phone||"بدون تلفن")}${c.email?" · "+esc(c.email):""}</span></div><div class="record-actions"><button class="button button-light" data-edit-customer="${esc(c.id)}">ویرایش</button><button class="button button-danger" data-delete-customer="${esc(c.id)}">حذف</button></div></div>`).join("");
}
function drawCustomerPicker(){
 const sel=$("customerPicker"),current=sel.value;
 sel.innerHTML='<option value="">انتخاب مشتری (اختیاری)</option>'+customers.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}${c.phone?" — "+esc(c.phone):""}</option>`).join("");
 if(customers.some(c=>c.id===current))sel.value=current;
}
function clearCustomerForm(){editingCustomerId=null;["customerRecordName","customerRecordPhone","customerRecordEmail","customerRecordAddress"].forEach(id=>$(id).value="");$("saveCustomer").textContent="ثبت مشتری";$("cancelCustomerEdit").hidden=true}
async function saveCustomer(){
 const name=$("customerRecordName").value.trim();if(!name){$("customerStatus").textContent="لطفاً نام مشتری را وارد کن.";return}
 const requestedUserId=currentUser?.id;if(!requestedUserId)return;
 const payload={name,phone:$("customerRecordPhone").value.trim(),email:$("customerRecordEmail").value.trim(),address:$("customerRecordAddress").value.trim(),is_active:true};
 const btn=$("saveCustomer");btn.disabled=true;$("customerStatus").textContent="در حال ذخیره مشتری در فضای ابری…";
 try{
  if(editingCustomerId){const {error}=await supabaseClient.from("customers").update(payload).eq("id",editingCustomerId);if(error)throw error}
  else{const {error}=await supabaseClient.from("customers").insert({...payload,user_id:requestedUserId});if(error)throw error}
  if(currentUser?.id!==requestedUserId)return;
  clearCustomerForm();await loadCloudData();if(currentUser?.id!==requestedUserId)return;$("customerStatus").textContent="مشتری با موفقیت در پایگاه داده ابری ذخیره شد.";
 }catch(error){if(currentUser?.id===requestedUserId)$("customerStatus").textContent="ذخیره مشتری انجام نشد: "+cloudError(error)}finally{if(currentUser?.id===requestedUserId)btn.disabled=false}
}
function editCustomer(id){if(window.showForushnamehPage)window.showForushnamehPage("customers");const c=customers.find(x=>x.id===id);if(!c)return;editingCustomerId=id;$("customerRecordName").value=c.name;$("customerRecordPhone").value=c.phone;$("customerRecordEmail").value=c.email;$("customerRecordAddress").value=c.address;$("saveCustomer").textContent="ذخیرهٔ تغییرات";$("cancelCustomerEdit").hidden=false}
async function backupExport(){
 const requestedUserId=currentUser?.id;
 if(!supabaseClient||!requestedUserId){$("backupStatus").textContent="برای تهیهٔ پشتیبان ابتدا وارد حساب کاربری شو.";return}
 const btn=$("exportData");btn.disabled=true;
 $("backupStatus").textContent="در حال دریافت همهٔ اطلاعات از فضای ابری…";
 try{
  async function fetchAll(table,columns,identityColumn="id"){
   const result=[];let from=0;const pageSize=1000;
   while(true){
    const {data,error}=await supabaseClient.from(table).select(columns).order("created_at",{ascending:true}).order(identityColumn,{ascending:true}).range(from,from+pageSize-1);
    if(error)throw error;
    const batch=data||[];result.push(...batch);
    if(batch.length<pageSize)break;
    from+=pageSize;
   }
   return result;
  }
  const [productRows,customerRows,movementRows,invoiceRows,itemRows,paymentRows,settingsRows,profileRows]=await Promise.all([
   fetchAll("products","id,name,sku,unit,sale_price,stock_on_hand,min_stock,note,is_active"),
   fetchAll("customers","id,name,phone,email,address,note,is_active"),
   fetchAll("inventory_movements","id,product_id,movement_type,quantity_delta,description,reference,occurred_at"),
   fetchAll("invoices","id,invoice_number,invoice_date,status,currency,business_name_snapshot,business_phone_snapshot,business_address_snapshot,customer_name_snapshot,customer_phone_snapshot,notes,subtotal,discount_amount,tax_amount,total_amount,created_at"),
   fetchAll("invoice_items","id,invoice_id,product_id,description,quantity,unit,unit_price,sort_order"),
   fetchAll("invoice_payments","id,invoice_id,payment_type,amount,payment_method,paid_at,reference,note,reversal_of,created_at"),
   fetchAll("business_settings","user_id,business_name,phone,address,default_currency,invoice_prefix,next_invoice_number,created_at","user_id"),
   fetchAll("profiles","id,full_name,created_at")
  ]);
  if(currentUser?.id!==requestedUserId)return;
  const allProducts=productRows.map(mapCloudProduct);
  const allCustomers=customerRows.map(mapCloudCustomer);
  const itemGroups=new Map();
  itemRows.forEach(row=>{if(!itemGroups.has(row.invoice_id))itemGroups.set(row.invoice_id,[]);itemGroups.get(row.invoice_id).push({id:row.id,name:row.description||"",quantity:Number(row.quantity)||0,price:Number(row.unit_price)||0,productId:row.product_id||"",unit:row.unit||"عدد"})});
  const allInvoices=invoiceRows.map(row=>({id:row.id,status:row.status,totalAmount:Number(row.total_amount)||0,data:{invoiceNumber:row.invoice_number||"",invoiceDate:row.invoice_date||"",currency:row.currency||"تومان",storeName:row.business_name_snapshot||"",storePhone:row.business_phone_snapshot||"",storeAddress:row.business_address_snapshot||"",customerName:row.customer_name_snapshot||"",customerPhone:row.customer_phone_snapshot||"",discountAmount:String(Number(row.discount_amount)||0),taxAmount:String(Number(row.tax_amount)||0),notes:row.notes||""},items:itemGroups.get(row.id)||[],createdAt:row.created_at}));
  const allMovements=movementRows.map(m=>{
   const p=allProducts.find(x=>x.id===m.product_id);
   return {id:m.id,kind:m.movement_type==="purchase"||m.movement_type==="opening"?"in":m.movement_type==="sale"?"sale":"return",productId:m.product_id,productName:p?.name||"کالای حذف‌شده",quantity:Math.abs(Number(m.quantity_delta)||0),description:m.description||"",reference:m.reference||"",date:m.occurred_at};
  });
  const payload={app:"ForushNameh",formatVersion:5,createdAt:new Date().toISOString(),profile:profileRows[0]||null,businessSettings:settingsRows[0]||null,invoices:allInvoices,invoiceItems:itemRows,invoicePayments:paymentRows,products:allProducts,customers:allCustomers,movements:allMovements};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=`ForushNameh-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  $("backupStatus").textContent="فایل پشتیبان از کالاها، مشتریان، فاکتورها، دریافت‌ها، برگشت‌ها و گردش‌های انبار ساخته شد.";
 }catch(error){
  if(currentUser?.id===requestedUserId)$("backupStatus").textContent="تهیهٔ پشتیبان کامل انجام نشد: "+cloudError(error);
 }finally{
  if(currentUser?.id===requestedUserId)btn.disabled=false;
 }
}
async function backupImport(file){
 if(!file)return;
 $("backupStatus").textContent="بازیابی پشتیبان در فضای ابری در مرحلهٔ بعد اضافه می‌شود؛ در حال حاضر فقط خروجی گرفتن فعال است.";
 $("importData").value="";
 return;
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
 const invoices=cloudInvoices.filter(x=>x.status==="issued");
 const sales=invoices.reduce((sum,x)=>sum+(Number(x.totalAmount)||0),0);
 $("dashSales").textContent=fa(sales);
 $("dashSalesCurrency").textContent=invoices[0]?.data?.currency||"تومان";
 $("dashInvoices").textContent=fa(invoices.length);
 $("dashCustomers").textContent=fa(customers.length);
 $("dashProducts").textContent=fa(products.length);
 const low=products.filter(p=>num(p.stock)<=num(p.minStock));
 $("dashLowStock").textContent=`${fa(low.length)} کالای کم‌موجود`;
 const recent=$("dashRecentInvoices");
 recent.innerHTML=invoices.length?invoices.slice(0,5).map(x=>`<div class="dash-row"><div><strong>${esc(x.data?.customerName||"بدون نام مشتری")}</strong><small>فاکتور ${esc(x.data?.invoiceNumber||"—")} · ${esc(x.data?.invoiceDate||"بدون تاریخ")}</small></div><b>${fa(x.totalAmount)} ${esc(x.data?.currency||"تومان")}</b></div>`).join(""):'<p class="helper">هنوز فاکتوری ثبت نشده است.</p>';
 const lowHost=$("dashLowProducts");
 lowHost.innerHTML=low.length?low.slice(0,6).map(p=>`<div class="dash-row"><div><strong>${esc(p.name)}</strong><small>حد هشدار: ${fa(p.minStock)} ${esc(p.unit||"")}</small></div><b class="low-stock">${fa(p.stock)} ${esc(p.unit||"")}</b></div>`).join(""):'<p class="helper">موجودی کالاها در وضعیت مناسبی است.</p>';
 drawReports();
}

function parseInvoiceDate(value){const raw=String(value||"").slice(0,10),m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;const y=Number(m[1]),month=Number(m[2]),day=Number(m[3]),d=new Date(y,month-1,day);return d.getFullYear()===y&&d.getMonth()===month-1&&d.getDate()===day?d:null}
function drawReports(){
 const periodEl=$("reportPeriod"),currencyEl=$("reportCurrency");if(!periodEl||!currencyEl)return;
 const currencies=[...new Set(cloudInvoices.map(x=>x.data?.currency||"تومان"))].sort(),old=currencyEl.value;
 currencyEl.innerHTML=currencies.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join("");
 currencyEl.value=currencies.includes(old)?old:(currencies.includes(businessSettings?.default_currency)?businessSettings.default_currency:(currencies[0]||""));
 const currency=currencyEl.value||businessSettings?.default_currency||currencies[0]||"تومان",all=cloudInvoices.filter(x=>x.status==="issued"&&(x.data?.currency||"تومان")===currency),now=new Date(),period=periodEl.value;
 let start=null;if(period==="month")start=new Date(now.getFullYear(),now.getMonth(),1);else if(period==="30days")start=new Date(now.getFullYear(),now.getMonth(),now.getDate()-29);else if(period==="year")start=new Date(now.getFullYear(),0,1);
 const scoped=all.filter(x=>{const d=parseInvoiceDate(x.data?.invoiceDateISO||x.data?.invoiceDate);return !start||(d&&d>=start&&d<=new Date(now.getFullYear(),now.getMonth(),now.getDate(),23,59,59,999))});
 currentReportRows=scoped;
 const sales=scoped.reduce((a,x)=>a+(Number(x.totalAmount)||0),0);
 $("reportSales").textContent=fa(sales);$("reportInvoices").textContent=fa(scoped.length);$("reportAverage").textContent=fa(scoped.length?sales/scoped.length:0);$("reportCurrencyLabel").textContent=currency;
 const buckets=[];for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1),monthInvoices=all.filter(x=>{const date=parseInvoiceDate(x.data?.invoiceDateISO||x.data?.invoiceDate);return date&&date.getFullYear()===d.getFullYear()&&date.getMonth()===d.getMonth()});buckets.push({label:d.toLocaleDateString("fa-IR",{month:"short"}),value:monthInvoices.reduce((a,x)=>a+(Number(x.totalAmount)||0),0),count:monthInvoices.length})}
 const max=Math.max(1,...buckets.map(x=>x.value)),points=buckets.map((x,i)=>({x:42+i*103,y:160-(x.value/max)*125,value:x.value,label:x.label}));
 const linePath=points.map((p,i)=>(i?"L":"M")+p.x+" "+p.y).join(" "),areaPath=linePath+" L557 178 L42 178 Z";
 $("reportChart").innerHTML='<svg viewBox="0 0 600 220" role="img" aria-label="روند مبلغ فروش"><defs><linearGradient id="salesArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#1a9b83" stop-opacity=".25"/><stop offset="100%" stop-color="#1a9b83" stop-opacity="0"/></linearGradient></defs><path d="'+areaPath+'" fill="url(#salesArea)"/><path d="'+linePath+'" fill="none" stroke="#174b91" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'+points.map(p=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="5" fill="#fff" stroke="#174b91" stroke-width="3"><title>'+esc(p.label)+': '+fa(p.value)+'</title></circle><text x="'+p.x+'" y="202" text-anchor="middle" font-size="13" fill="#718198">'+esc(p.label)+'</text>').join("")+'</svg><div class="chart-footnote">مبالغ به '+esc(currency)+' · '+fa(buckets.reduce((n,x)=>n+x.value,0))+'</div>';
 const maxCount=Math.max(1,...buckets.map(x=>x.count));$("reportInvoiceChart").innerHTML=buckets.map(x=>'<div class="volume-item"><strong>'+fa(x.count)+'</strong><div class="volume-track"><span style="height:'+Math.max(4,Math.round(x.count/maxCount*100))+'%"></span></div><small>'+esc(x.label)+'</small></div>').join("");
 const cs=new Map(),ps=new Map();scoped.forEach(inv=>{const name=inv.data?.customerName||"بدون نام مشتری";cs.set(name,(cs.get(name)||0)+(Number(inv.totalAmount)||0));(inv.items||[]).forEach(it=>{const key=it.name||"بدون شرح",v=ps.get(key)||{quantity:0,revenue:0};v.quantity+=Number(it.quantity)||0;v.revenue+=(Number(it.quantity)||0)*(Number(it.price)||0);ps.set(key,v)})});
 const topC=[...cs.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);$("reportTopCustomers").innerHTML=topC.length?topC.map(([n,v])=>'<div class="report-list-row"><strong>'+esc(n)+'</strong><b>'+fa(v)+'</b></div>').join(""):'<p class="helper">در این بازه فاکتوری ثبت نشده است.</p>';
 const topP=[...ps.entries()].sort((a,b)=>b[1].revenue-a[1].revenue).slice(0,5),palette=["#174b91","#1a9b83","#7ca8d8","#9bcfc3","#c8d9ea"],topTotal=topP.reduce((n,x)=>n+x[1].revenue,0);
 let angle=0;const slices=topP.map(([,v],i)=>{const share=topTotal?v.revenue/topTotal*100:0,from=angle;angle+=share;return palette[i]+" "+from+"% "+angle+"%"});if(angle<100)slices.push("#e8edf3 "+angle+"% 100%");
 $("reportProductChart").innerHTML=topP.length?'<div class="share-ring" style="background:conic-gradient('+slices.join(",")+')"><span>'+fa(topTotal)+'</span></div><div class="share-legend">'+topP.map(([n,v],i)=>'<div><i style="background:'+palette[i]+'"></i><span>'+esc(n)+'</span><b>'+fa(topTotal?v.revenue/topTotal*100:0)+'٪</b></div>').join("")+'</div>':'<p class="helper">اطلاعات کالایی برای نمایش وجود ندارد.</p>';
 $("reportTopProducts").innerHTML=topP.length?topP.map(([n,v])=>'<div class="report-list-row"><strong>'+esc(n)+'<small>تعداد: '+fa(v.quantity)+'</small></strong><b>'+fa(v.revenue)+'</b></div>').join(""):'<p class="helper">اطلاعات کالایی برای نمایش وجود ندارد.</p>';
 $("reportCountHint").textContent=fa(scoped.length)+" فاکتور در بازهٔ انتخاب‌شده";
}


function reportCsvCell(value){
 const text=String(value??"");
 const first=text.charCodeAt(0),safe=[61,43,64,45,9,13].includes(first)?"'"+text:text;
 return '"'+safe.replace(/"/g,'""')+'"';
}
function exportReportCsv(){
 const rows=currentReportRows||[];
 if(!rows.length){$("reportCountHint").textContent="برای خروجی گرفتن، در بازه و واحد پول انتخاب‌شده فاکتور معتبری وجود ندارد.";return}
 const currency=$("reportCurrency").value||"تومان";
 const lines=[
  ["شماره فاکتور","تاریخ","مشتری","واحد پول","جمع اقلام","تخفیف","مالیات","مبلغ نهایی","وضعیت"].map(reportCsvCell).join(","),
  ...rows.map(x=>[
   x.data?.invoiceNumber||x.invoiceNumber||"",
   x.data?.invoiceDate||"",
   x.data?.customerName||"",
   currency,
   x.subtotal??"",
   x.discountAmount??"",
   x.taxAmount??"",
   x.totalAmount??"",
   "صادرشده"
  ].map(reportCsvCell).join(","))
 ];
 const blob=new Blob([String.fromCharCode(0xFEFF)+lines.join(String.fromCharCode(13,10))],{type:"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="Forushnameh-sales-report-"+new Date().toISOString().slice(0,10)+".csv";a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function exportReportPdf(){
 const btn=$("exportReportPdf"),target=document.querySelector('[data-view="reports"]');
 if(!target)return;
 if(typeof window.html2canvas!=="function"||!window.jspdf?.jsPDF){$("reportCountHint").textContent="ابزار ساخت PDF در دسترس نیست؛ اتصال اینترنت را بررسی کن.";return}
 btn.disabled=true;
 $("reportCountHint").textContent="در حال آماده‌سازی PDF گزارش…";
 try{
  const canvas=await window.html2canvas(target,{scale:2,backgroundColor:"#f5f8fc",useCORS:true,logging:false,onclone:doc=>{doc.querySelectorAll(".report-export-actions").forEach(el=>el.style.display="none")}});
  const {jsPDF}=window.jspdf,pdf=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
  const pageWidth=190,pageHeight=277,imageHeight=canvas.height*pageWidth/canvas.width;
  const image=canvas.toDataURL("image/png");
  const pages=Math.max(1,Math.ceil(imageHeight/pageHeight));
  for(let page=0;page<pages;page++){
   if(page>0)pdf.addPage();
   pdf.addImage(image,"PNG",10,10-page*pageHeight,pageWidth,imageHeight,undefined,"FAST");
  }
  pdf.save("Forushnameh-sales-report-"+new Date().toISOString().slice(0,10)+".pdf");
  $("reportCountHint").textContent="فایل PDF گزارش آماده شد.";
 }catch(error){
  $("reportCountHint").textContent="ساخت PDF گزارش انجام نشد؛ دوباره تلاش کن.";
 }finally{btn.disabled=false}
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
 ["customerName","customerPhone"].forEach(id=>$(id).addEventListener("input",()=>{if($("customerPicker").value)$("customerPicker").value="";}));
 $("saveInvoice").addEventListener("click",saveInvoice);$("newInvoice").addEventListener("click",newInvoice);
 $("saveBusinessSettings").addEventListener("click",saveBusinessSettings);
 $("reportPeriod").addEventListener("change",drawReports);$("reportCurrency").addEventListener("change",drawReports);
 $("exportReportPdf").addEventListener("click",exportReportPdf);$("exportReportCsv").addEventListener("click",exportReportCsv);
 $("savedInvoices").addEventListener("click",e=>{const o=e.target.closest("[data-open-invoice]"),p=e.target.closest("[data-payment-invoice]");if(o){loadInvoice(o.dataset.openInvoice);return}if(p)openPaymentPanel(p.dataset.paymentInvoice)});
 ["invoiceSearch","invoicePaymentFilter","invoiceDateFrom","invoiceDateTo"].forEach(id=>$(id).addEventListener(id==="invoiceSearch"?"input":"change",applyInvoiceFilters));
 $("clearInvoiceFilters").addEventListener("click",clearInvoiceFilters);
 $("printInvoice").addEventListener("click",()=>window.print());
 $("savePayment").addEventListener("click",savePayment);$("cancelPayment").addEventListener("click",()=>{selectedPaymentInvoiceId=null;$("paymentPanel").hidden=true});
 $("paymentHistory").addEventListener("click",e=>{const b=e.target.closest("[data-reverse-payment]");if(b)reversePayment(b.dataset.reversePayment)});
 $("saveProduct").addEventListener("click",saveProduct);$("cancelProductEdit").addEventListener("click",clearProductForm);$("productSearch").addEventListener("input",drawProductList);
 $("productsList").addEventListener("click",e=>{const edit=e.target.closest("[data-edit-product]"),del=e.target.closest("[data-delete-product]");if(edit){editProduct(edit.dataset.editProduct);return}if(del&&confirm("این کالا غیرفعال شود؟ سوابق انبار و فاکتورهای مرتبط حفظ می‌شوند.")){(async()=>{const requestedUserId=currentUser?.id;if(!requestedUserId)return;try{const {error}=await supabaseClient.from("products").update({is_active:false}).eq("id",del.dataset.deleteProduct);if(currentUser?.id!==requestedUserId)return;if(error)throw error;await loadCloudData();if(currentUser?.id===requestedUserId)$("productStatus").textContent="کالا غیرفعال شد؛ سوابق آن حفظ شده است."}catch(error){if(currentUser?.id===requestedUserId)$("productStatus").textContent="غیرفعال‌سازی کالا انجام نشد: "+cloudError(error)}})()}});
 $("saveCustomer").addEventListener("click",saveCustomer);$("cancelCustomerEdit").addEventListener("click",clearCustomerForm);$("customerSearch").addEventListener("input",drawCustomerList);
 $("customersList").addEventListener("click",e=>{const edit=e.target.closest("[data-edit-customer]"),del=e.target.closest("[data-delete-customer]");if(edit){editCustomer(edit.dataset.editCustomer);return}if(del&&confirm("این مشتری غیرفعال شود؟ سوابق فاکتورهای مرتبط حفظ می‌شوند.")){(async()=>{const requestedUserId=currentUser?.id;if(!requestedUserId)return;try{const {error}=await supabaseClient.from("customers").update({is_active:false}).eq("id",del.dataset.deleteCustomer);if(currentUser?.id!==requestedUserId)return;if(error)throw error;await loadCloudData();if(currentUser?.id===requestedUserId)$("customerStatus").textContent="مشتری غیرفعال شد؛ سوابق آن حفظ شده است."}catch(error){if(currentUser?.id===requestedUserId)$("customerStatus").textContent="غیرفعال‌سازی مشتری انجام نشد: "+cloudError(error)}})()}});
 $("receiveStock").addEventListener("click",receiveStock);$("exportData").addEventListener("click",backupExport);$("importData").addEventListener("change",e=>backupImport(e.target.files[0]));
 $("downloadPng").addEventListener("click",async()=>{const btn=$("downloadPng"),status=$("statusMessage");if(typeof window.html2canvas!=="function"){status.textContent="ابزار ساخت تصویر بارگذاری نشده است؛ اتصال اینترنت را بررسی کن.";return}btn.disabled=true;status.textContent="در حال آماده‌سازی تصویر فاکتور…";try{const canvas=await window.html2canvas($("invoicePreview"),{scale:2,backgroundColor:"#fff",useCORS:true,logging:false}),a=document.createElement("a"),n=($("invoiceNumber").value.trim()||"new").replace(/[^\w\u0600-\u06FF-]/g,"_");a.download=`ForushNameh-invoice-${n}.png`;a.href=canvas.toDataURL("image/png");a.click();status.textContent="تصویر فاکتور آماده شد."}catch(e){status.textContent="ساخت تصویر انجام نشد؛ صفحه را تازه‌سازی و دوباره امتحان کن."}finally{btn.disabled=false}});
 $("downloadPdf").addEventListener("click",async()=>{const btn=$("downloadPdf"),status=$("statusMessage");if(typeof window.html2canvas!=="function"||!window.jspdf?.jsPDF){status.textContent="ابزار ساخت PDF در دسترس نیست؛ اتصال اینترنت را بررسی کن.";return}btn.disabled=true;status.textContent="در حال آماده‌سازی فایل PDF…";try{const canvas=await window.html2canvas($("invoicePreview"),{scale:2,backgroundColor:"#fff",useCORS:true,logging:false}),{jsPDF}=window.jspdf,pdf=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"}),pageW=210,pageH=297,margin=8,img=canvas.toDataURL("image/jpeg",0.96),ratio=Math.min((pageW-margin*2)/canvas.width,(pageH-margin*2)/canvas.height),w=canvas.width*ratio,h=canvas.height*ratio,x=(pageW-w)/2,y=margin;pdf.addImage(img,"JPEG",x,y,w,h);const n=($("invoiceNumber").value.trim()||"new").replace(/[^a-zA-Z0-9\u0600-\u06FF-]/g,"_");pdf.save(`ForushNameh-invoice-${n}.pdf`);status.textContent="فایل PDF فاکتور آماده شد."}catch(e){status.textContent="ساخت PDF انجام نشد؛ دوباره تلاش کن."}finally{btn.disabled=false}});
 drawItems();preview();drawInvoices();drawProductList();drawCustomerList();drawCustomerPicker();drawStockPicker();drawMovements();drawDashboard();drawReports();
 loadCloudData().catch(error=>{const msg="بارگذاری اطلاعات ابری انجام نشد: "+cloudError(error);$("productStatus").textContent=msg;$("customerStatus").textContent=msg;});
}

function setAuthMode(mode){
 authMode=mode;
 const signup=mode==="signup",reset=mode==="reset",updatePassword=mode==="updatepassword";
 $("authTitle").textContent=signup?"ساخت حساب کاربری":reset?"بازیابی رمز عبور":updatePassword?"تعیین رمز عبور جدید":"ورود به فروش‌نامه";
 $("authDescription").textContent=signup?"برای ساخت حساب، نام، ایمیل و یک رمز عبور امن وارد کن.":reset?"ایمیل حساب خود را وارد کن تا پیوند بازیابی رمز برایت ارسال شود.":updatePassword?"یک رمز عبور تازه و امن برای حساب خود انتخاب کن.":"برای دسترسی به فضای کاری خود وارد حساب کاربری‌ات شو.";
 $("fullNameField").hidden=!signup;$("authFullName").required=signup;
 $("confirmPasswordField").hidden=!(signup||updatePassword);$("authConfirmPassword").required=signup||updatePassword;
 $("passwordField").hidden=reset;$("authPassword").required=!reset;$("authPassword").autocomplete=signup||updatePassword?"new-password":"current-password";
 if(!signup)$("authFullName").value="";if(!(signup||updatePassword))$("authConfirmPassword").value="";$("passwordStrength").hidden=!signup;$("passwordStrengthFill").style.width="0%";$("passwordStrengthLabel").textContent="";
 $("authSubmit").textContent=signup?"ایجاد حساب":reset?"ارسال پیوند بازیابی":updatePassword?"ذخیرهٔ رمز جدید":"ورود";
 $("toggleAuthMode").hidden=reset||updatePassword;$("forgotPasswordButton").hidden=signup||reset||updatePassword;
 $("toggleAuthMode").textContent=signup?"قبلاً حساب ساخته‌ام؛ ورود":"ساخت حساب جدید";
 $("authStatus").textContent="";
}
function showAuthMessage(message,isError=false){const el=$("authStatus");el.textContent=message;el.classList.toggle("error",isError)}
function resetUserWorkspace(){
 products=[];customers=[];movements=[];cloudInvoices=[];businessSettings=null;
 editingInvoiceId=null;editingProductId=null;editingCustomerId=null;
 items=[{id:1,name:"",quantity:1,price:0,productId:""}];nextItemId=2;
 invoiceFields.forEach(id=>{if($(id))$(id).value=""});
 $("invoiceDate").value=today();$("currency").value="تومان";$("customerPicker").value="";
 clearProductForm();clearCustomerForm();
 $("productSearch").value="";$("customerSearch").value="";
 ["productStatus","customerStatus","stockStatus","savedStatus","backupStatus","statusMessage"].forEach(id=>$(id).textContent="");
 $("stockQuantity").value="";$("stockDescription").value="";
 drawItems();preview();drawInvoices();drawProductList();drawCustomerList();drawCustomerPicker();drawStockPicker();drawMovements();drawDashboard();
}
function openAuth(mode="login"){setAuthMode(mode);$("authScreen").hidden=false;const target=mode==="signup"?$("authFullName"):$("authEmail");target?.focus()}
function closeAuth(){if(!recoveryMode&&!currentUser)$("authScreen").hidden=true}
function showAuthenticatedApp(user){
 const switchingAccount=!!currentUser?.id&&currentUser.id!==user.id;
 KEYS=Object.fromEntries(Object.entries(BASE_KEYS).map(([k,v])=>[k,`${v}.${user.id}`]));
 if(switchingAccount)resetUserWorkspace();
 currentUser=user;document.querySelector("main.page").hidden=false;
 $("publicSite").hidden=true;$("appTopbar").hidden=false;$("authScreen").hidden=true;$("accountEmail").hidden=false;$("accountEmail").textContent=user.email||"حساب کاربری";$("signOutButton").hidden=false;
 if(!window.forushnamehInitialized){init();window.forushnamehInitialized=true}
 else{drawInvoices();loadCloudData().catch(error=>{if(currentUser?.id===user.id)alert("بارگذاری اطلاعات ابری انجام نشد: "+cloudError(error))})}
}
function showSignedOut(){
 currentUser=null;KEYS=Object.fromEntries(Object.entries(BASE_KEYS).map(([k,v])=>[k,`${v}.signed-out`]));resetUserWorkspace();
 $("authScreen").hidden=true;$("authPassword").value="";$("authConfirmPassword").value="";$("authFullName").value="";$("accountEmail").hidden=true;$("signOutButton").hidden=true;
 document.querySelector("main.page").hidden=true;$("appTopbar").hidden=true;$("publicSite").hidden=false;setAuthMode("login");
}
async function handleAuthSubmit(event){
 event.preventDefault();const email=$("authEmail").value.trim(),password=$("authPassword").value,name=$("authFullName").value.trim();
 if(!supabaseClient){showAuthMessage("اتصال ورود در دسترس نیست؛ صفحه را تازه‌سازی و اتصال اینترنت را بررسی کن.",true);return}
 if(!email){showAuthMessage("ایمیل را وارد کن.",true);return}
 if(authMode!=="reset"&&password.length<8){showAuthMessage("رمز عبور باید حداقل ۸ نویسه داشته باشد.",true);return}if(authMode==="signup"&&[password.length>=8,/[a-z]/.test(password)&&/[A-Z]/.test(password),/\d/.test(password),/[^A-Za-z0-9]/.test(password)].filter(Boolean).length<3){showAuthMessage("برای امنیت بیشتر، رمز عبور ترکیبی از حروف، عدد یا نشانه انتخاب کن.",true);return}
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
 document.querySelectorAll("[data-auth-open]").forEach(button=>button.addEventListener("click",()=>openAuth(button.dataset.authOpen||"login")));
 $("closeAuthButton").addEventListener("click",closeAuth);$("authScreen").addEventListener("click",event=>{if(event.target===$("authScreen"))closeAuth()});
 $("toggleAuthMode").addEventListener("click",()=>setAuthMode(authMode==="signup"?"login":"signup"));
 $("forgotPasswordButton").addEventListener("click",()=>setAuthMode("reset"));
 $("authPassword").addEventListener("input",()=>{if(authMode!=="signup")return;const value=$("authPassword").value,tests=[value.length>=8,/[a-z]/.test(value)&&/[A-Z]/.test(value),/\d/.test(value),/[^A-Za-z0-9]/.test(value)],score=tests.filter(Boolean).length,label=["خیلی ضعیف","ضعیف","متوسط","خوب","قوی"][score],width=[0,25,50,75,100][score];$("passwordStrengthFill").style.width=width+"%";$("passwordStrengthFill").dataset.level=String(score);$("passwordStrengthLabel").textContent=value?label:"";});
 $("signOutButton").addEventListener("click",async()=>{const {error}=await supabaseClient.auth.signOut();if(error){alert(authErrorMessage(error));return}showSignedOut()});
 supabaseClient.auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_IN"&&session?.user)showAuthenticatedApp(session.user);if(event==="SIGNED_OUT")showSignedOut();if(event==="PASSWORD_RECOVERY"){recoveryMode=true;document.querySelector("main.page").hidden=true;$("publicSite").hidden=false;$("appTopbar").hidden=true;$("authScreen").hidden=false;setAuthMode("updatepassword");showAuthMessage("پیوند بازیابی تأیید شد؛ رمز جدیدت را وارد کن.")}});
 const {data:{session},error}=await supabaseClient.auth.getSession();
 if(error){showSignedOut();openAuth("login");showAuthMessage(authErrorMessage(error),true);return}
 if(session?.user&&!recoveryMode){showAuthenticatedApp(session.user)}else if(!recoveryMode){showSignedOut();const requestedMode=new URLSearchParams(window.location.search).get("auth");if(requestedMode==="login"||requestedMode==="signup")openAuth(requestedMode)}
}
startAuth();
})();