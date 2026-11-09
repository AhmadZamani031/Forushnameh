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
const invoiceFields=["storeName","storePhone","storeAddress","customerName","customerPhone","invoiceNumber","invoiceDate","currency","notes"];
let items=[{id:1,name:"محصول نمونه",quantity:1,price:250000,productId:""},{id:2,name:"خدمات",quantity:2,price:50000,productId:""}];
let nextItemId=3, editingInvoiceId=null, editingProductId=null, editingCustomerId=null;
let products=[], customers=[], movements=[], cloudInvoices=[], businessSettings=null;
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
 const {data:rows,error}=await supabaseClient.from("invoices").select("id,invoice_number,invoice_date,status,currency,business_name_snapshot,business_phone_snapshot,business_address_snapshot,customer_name_snapshot,customer_phone_snapshot,notes,subtotal,discount_amount,tax_amount,total_amount,created_at").order("created_at",{ascending:false});
 if(currentUser?.id!==requestedUserId)return false;
 if(error)throw error;
 const ids=(rows||[]).map(x=>x.id);let itemRows=[];
 if(ids.length){const result=await supabaseClient.from("invoice_items").select("id,invoice_id,product_id,description,quantity,unit,unit_price,sort_order").in("invoice_id",ids).order("sort_order");if(currentUser?.id!==requestedUserId)return false;if(result.error)throw result.error;itemRows=result.data||[]}
 const grouped=new Map();
 itemRows.forEach(row=>{if(!grouped.has(row.invoice_id))grouped.set(row.invoice_id,[]);grouped.get(row.invoice_id).push({id:row.id,name:row.description||"",quantity:Number(row.quantity)||0,price:Number(row.unit_price)||0,productId:row.product_id||"",unit:row.unit||"عدد"})});
 cloudInvoices=(rows||[]).map(row=>({id:row.id,status:row.status,totalAmount:Number(row.total_amount)||0,data:{invoiceNumber:row.invoice_number||"",invoiceDate:row.invoice_date||"",currency:row.currency||"تومان",storeName:row.business_name_snapshot||"",storePhone:row.business_phone_snapshot||"",storeAddress:row.business_address_snapshot||"",customerName:row.customer_name_snapshot||"",customerPhone:row.customer_phone_snapshot||"",notes:row.notes||""},items:grouped.get(row.id)||[],createdAt:row.created_at}));
 drawInvoices();return true;
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
 $("previewCurrency").textContent=d.currency||"تومان";$("previewItems").innerHTML=items.map(it=>`<tr><td>${esc(it.name||"—")}</td><td>${fa(it.quantity)}</td><td>${fa(it.price)}</td><td>${fa(it.quantity*it.price)}</td></tr>`).join("");
 $("previewTotal").textContent=fa(total());$("previewNotes").textContent=d.notes||"از خرید شما سپاسگزاریم.";$("previewNotesBlock").style.display=d.notes?"block":"none";
 items.forEach(it=>{const c=$("itemsEditor").querySelector(`[data-item-id="${it.id}"]`);if(c)c.querySelector("input[disabled]").value=fa(it.quantity*it.price)});
}
function drawInvoices(){
 const host=$("savedInvoices");
 if(!cloudInvoices.length){host.innerHTML='<p class="helper">هنوز فاکتوری در فضای ابری ثبت نشده است.</p>';return}
 host.innerHTML=cloudInvoices.map(x=>'<div class="saved-invoice"><div class="saved-invoice-info"><strong>'+esc(x.data.invoiceNumber||"بدون شماره")+' — '+esc(x.data.customerName||"بدون نام مشتری")+'</strong><span>'+esc(x.data.invoiceDate||"بدون تاریخ")+' · '+fa(x.totalAmount)+' '+esc(x.data.currency||"تومان")+' · '+(x.status==="issued"?"صادرشده":esc(x.status||""))+'</span></div><div class="saved-invoice-actions"><button class="button button-light" data-open-invoice="'+esc(x.id)+'">مشاهده</button></div></div>').join("");
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
 const dateRaw=$("invoiceDate").value.trim().replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/\//g,"-");
 const dateParts=dateRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 const validDate=!!dateParts&&(()=>{const y=Number(dateParts[1]),m=Number(dateParts[2]),d=Number(dateParts[3]),dt=new Date(Date.UTC(y,m-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d})();
 if(!validDate){$("savedStatus").textContent="تاریخ معتبر نیست؛ از قالب سال/ماه/روز میلادی استفاده کن.";return}
 if(!items.length||items.some(it=>!String(it.name||"").trim()||num(it.quantity)<=0||num(it.price)<0)){$("savedStatus").textContent="همهٔ ردیف‌ها باید شرح، تعداد بیشتر از صفر و قیمت معتبر داشته باشند.";return}
 const payload={customer_id:$("customerPicker").value||null,customer_name:$("customerName").value.trim(),customer_phone:$("customerPhone").value.trim(),invoice_date:dateRaw,currency:$("currency").value||"تومان",notes:$("notes").value.trim(),discount_amount:0,tax_amount:0,items:items.map(it=>({product_id:it.productId||null,description:String(it.name||"").trim(),unit:productById(it.productId)?.unit||"عدد",quantity:num(it.quantity),unit_price:num(it.price)}))};
 const btn=$("saveInvoice");btn.disabled=true;$("savedStatus").textContent="در حال صدور فاکتور و بررسی موجودی در پایگاه داده…";
 try{
  const {data,error}=await supabaseClient.rpc("forushnameh_issue_invoice",{p_invoice:payload});if(error)throw error;
  if(currentUser?.id!==requestedUserId)return;
  if(!data?.invoice_id||!data?.invoice_number)throw new Error("پاسخ صدور فاکتور از سرور کامل نیست.");
  $("invoiceNumber").value=data.invoice_number;editingInvoiceId=data.invoice_id;
  await loadCloudData();if(currentUser?.id!==requestedUserId)return;
  $("savedStatus").textContent="فاکتور "+data.invoice_number+" با موفقیت صادر و در فضای ابری ثبت شد. موجودی کالاهای انتخاب‌شده نیز به‌روزرسانی شد.";
 }catch(error){if(currentUser?.id===requestedUserId)$("savedStatus").textContent="صدور فاکتور انجام نشد: "+cloudError(error)}
 finally{if(currentUser?.id===requestedUserId)btn.disabled=false}
}
function loadInvoice(id){
 const x=cloudInvoices.find(a=>a.id===id);if(!x)return;
 invoiceFields.forEach(k=>{if(x.data[k]!==undefined)$(k).value=x.data[k]});$("customerPicker").value="";
 items=x.items.map((it,i)=>({id:i+1,name:it.name||"",quantity:num(it.quantity),price:num(it.price),productId:it.productId||""}));
 if(!items.length)items=[{id:1,name:"",quantity:1,price:0,productId:""}];
 nextItemId=items.length+1;editingInvoiceId=x.id;drawItems();preview();
 $("savedStatus").textContent="فاکتور صادرشده فقط برای مشاهده باز شده است؛ برای صدور فاکتور دیگر، «فاکتور جدید» را بزن.";
 if(window.showForushnamehPage)window.showForushnamehPage("invoice");
}
function newInvoice(){
 $("customerPicker").value="";invoiceFields.forEach(k=>{if(k==="storeName"||k==="currency")return;$(k).value=""});
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
  let saved;
  if(editingProductId){const {data,error}=await supabaseClient.from("products").update(payload).eq("id",editingProductId).select("id").single();if(error)throw error;saved=data}
  else{const {data,error}=await supabaseClient.from("products").insert({...payload,user_id:requestedUserId}).select("id").single();if(error)throw error;saved=data}
  let openingError=null;
  if(!editingProductId&&initialStock>0){const {error}=await supabaseClient.rpc("forushnameh_record_stock_movement",{p_product_id:saved.id,p_movement_type:"opening",p_quantity_delta:initialStock,p_description:"موجودی اولیه",p_reference:"",p_occurred_at:new Date().toISOString()});openingError=error}
  if(currentUser?.id!==requestedUserId)return;
  clearProductForm();await loadCloudData();if(currentUser?.id!==requestedUserId)return;
  $("productStatus").textContent=openingError?"کالا ذخیره شد، اما ثبت موجودی اولیه انجام نشد: "+cloudError(openingError):"کالا با موفقیت در پایگاه داده ابری ذخیره شد.";
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
function backupExport(){
 const payload={app:"ForushNameh",formatVersion:2,createdAt:new Date().toISOString(),invoices:cloudInvoices,products,customers,movements};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=`ForushNameh-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);$("backupStatus").textContent="فایل پشتیبان ساخته شد؛ آن را در جای امن نگه دار.";
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
 const invoices=cloudInvoices;
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

function parseInvoiceDate(value){const raw=String(value||"").slice(0,10),m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;const d=new Date(+m[1],+m[2]-1,+m[3]);return Number.isNaN(d.getTime())?null:d}
function drawReports(){
 const periodEl=$("reportPeriod"),currencyEl=$("reportCurrency");if(!periodEl||!currencyEl)return;
 const currencies=[...new Set(cloudInvoices.map(x=>x.data?.currency||"تومان"))].sort(),old=currencyEl.value;
 currencyEl.innerHTML=currencies.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join("");
 currencyEl.value=currencies.includes(old)?old:(currencies.includes(businessSettings?.default_currency)?businessSettings.default_currency:(currencies[0]||""));
 const currency=currencyEl.value||businessSettings?.default_currency||currencies[0]||"تومان",all=cloudInvoices.filter(x=>(x.data?.currency||"تومان")===currency),now=new Date(),period=periodEl.value;
 let start=null;if(period==="month")start=new Date(now.getFullYear(),now.getMonth(),1);else if(period==="30days")start=new Date(now.getFullYear(),now.getMonth(),now.getDate()-29);else if(period==="year")start=new Date(now.getFullYear(),0,1);
 const scoped=all.filter(x=>{const d=parseInvoiceDate(x.data?.invoiceDate);return !start||(d&&d>=start&&d<=new Date(now.getFullYear(),now.getMonth(),now.getDate(),23,59,59,999))});
 const sales=scoped.reduce((a,x)=>a+(Number(x.totalAmount)||0),0);
 $("reportSales").textContent=fa(sales);$("reportInvoices").textContent=fa(scoped.length);$("reportAverage").textContent=fa(scoped.length?sales/scoped.length:0);$("reportCurrencyLabel").textContent=currency;
 const buckets=[];for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1),key=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"),v=all.filter(x=>String(x.data?.invoiceDate||"").slice(0,7)===key).reduce((a,x)=>a+(Number(x.totalAmount)||0),0);buckets.push({label:d.toLocaleDateString("fa-IR",{month:"short"}),value:v})}
 const max=Math.max(1,...buckets.map(x=>x.value));$("reportChart").innerHTML=buckets.map(x=>'<div class="report-bar-item"><div class="report-bar-track"><span style="height:'+Math.max(3,Math.round(x.value/max*100))+'%"></span></div><strong>'+fa(x.value)+'</strong><small>'+esc(x.label)+'</small></div>').join("");
 const cs=new Map(),ps=new Map();scoped.forEach(inv=>{const name=inv.data?.customerName||"بدون نام مشتری";cs.set(name,(cs.get(name)||0)+(Number(inv.totalAmount)||0));(inv.items||[]).forEach(it=>{const key=it.name||"بدون شرح",v=ps.get(key)||{quantity:0,revenue:0};v.quantity+=Number(it.quantity)||0;v.revenue+=(Number(it.quantity)||0)*(Number(it.price)||0);ps.set(key,v)})});
 const topC=[...cs.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);$("reportTopCustomers").innerHTML=topC.length?topC.map(([n,v])=>'<div class="report-list-row"><strong>'+esc(n)+'</strong><b>'+fa(v)+'</b></div>').join(""):'<p class="helper">در این بازه فاکتوری ثبت نشده است.</p>';
 const topP=[...ps.entries()].sort((a,b)=>b[1].revenue-a[1].revenue).slice(0,5);$("reportTopProducts").innerHTML=topP.length?topP.map(([n,v])=>'<div class="report-list-row"><strong>'+esc(n)+'<small>تعداد: '+fa(v.quantity)+'</small></strong><b>'+fa(v.revenue)+'</b></div>').join(""):'<p class="helper">اطلاعات کالایی برای نمایش وجود ندارد.</p>';
 $("reportCountHint").textContent=fa(scoped.length)+" فاکتور در بازهٔ انتخاب‌شده";
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
 $("saveBusinessSettings").addEventListener("click",saveBusinessSettings);
 $("reportPeriod").addEventListener("change",drawReports);$("reportCurrency").addEventListener("change",drawReports);
 $("savedInvoices").addEventListener("click",e=>{const o=e.target.closest("[data-open-invoice]");if(o)loadInvoice(o.dataset.openInvoice)});
 $("saveProduct").addEventListener("click",saveProduct);$("cancelProductEdit").addEventListener("click",clearProductForm);$("productSearch").addEventListener("input",drawProductList);
 $("productsList").addEventListener("click",e=>{const edit=e.target.closest("[data-edit-product]"),del=e.target.closest("[data-delete-product]");if(edit){editProduct(edit.dataset.editProduct);return}if(del&&confirm("این کالا غیرفعال شود؟ سوابق انبار و فاکتورهای مرتبط حفظ می‌شوند.")){(async()=>{const requestedUserId=currentUser?.id;if(!requestedUserId)return;try{const {error}=await supabaseClient.from("products").update({is_active:false}).eq("id",del.dataset.deleteProduct);if(currentUser?.id!==requestedUserId)return;if(error)throw error;await loadCloudData();if(currentUser?.id===requestedUserId)$("productStatus").textContent="کالا غیرفعال شد؛ سوابق آن حفظ شده است."}catch(error){if(currentUser?.id===requestedUserId)$("productStatus").textContent="غیرفعال‌سازی کالا انجام نشد: "+cloudError(error)}})()}});
 $("saveCustomer").addEventListener("click",saveCustomer);$("cancelCustomerEdit").addEventListener("click",clearCustomerForm);$("customerSearch").addEventListener("input",drawCustomerList);
 $("customersList").addEventListener("click",e=>{const edit=e.target.closest("[data-edit-customer]"),del=e.target.closest("[data-delete-customer]");if(edit){editCustomer(edit.dataset.editCustomer);return}if(del&&confirm("این مشتری غیرفعال شود؟ سوابق فاکتورهای مرتبط حفظ می‌شوند.")){(async()=>{const requestedUserId=currentUser?.id;if(!requestedUserId)return;try{const {error}=await supabaseClient.from("customers").update({is_active:false}).eq("id",del.dataset.deleteCustomer);if(currentUser?.id!==requestedUserId)return;if(error)throw error;await loadCloudData();if(currentUser?.id===requestedUserId)$("customerStatus").textContent="مشتری غیرفعال شد؛ سوابق آن حفظ شده است."}catch(error){if(currentUser?.id===requestedUserId)$("customerStatus").textContent="غیرفعال‌سازی مشتری انجام نشد: "+cloudError(error)}})()}});
 $("receiveStock").addEventListener("click",receiveStock);$("exportData").addEventListener("click",backupExport);$("importData").addEventListener("change",e=>backupImport(e.target.files[0]));
 $("downloadPng").addEventListener("click",async()=>{const btn=$("downloadPng"),status=$("statusMessage");if(typeof window.html2canvas!=="function"){status.textContent="ابزار ساخت تصویر بارگذاری نشده است؛ اتصال اینترنت را بررسی کن.";return}btn.disabled=true;status.textContent="در حال آماده‌سازی تصویر فاکتور…";try{const canvas=await window.html2canvas($("invoicePreview"),{scale:2,backgroundColor:"#fff",useCORS:true,logging:false}),a=document.createElement("a"),n=($("invoiceNumber").value.trim()||"new").replace(/[^\w\u0600-\u06FF-]/g,"_");a.download=`ForushNameh-invoice-${n}.png`;a.href=canvas.toDataURL("image/png");a.click();status.textContent="تصویر فاکتور آماده شد."}catch(e){status.textContent="ساخت تصویر انجام نشد؛ صفحه را تازه‌سازی و دوباره امتحان کن."}finally{btn.disabled=false}});
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
 if(!signup)$("authFullName").value="";if(!(signup||updatePassword))$("authConfirmPassword").value="";
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
 document.querySelectorAll("[data-auth-open]").forEach(button=>button.addEventListener("click",()=>openAuth(button.dataset.authOpen||"login")));
 $("closeAuthButton").addEventListener("click",closeAuth);$("authScreen").addEventListener("click",event=>{if(event.target===$("authScreen"))closeAuth()});
 $("toggleAuthMode").addEventListener("click",()=>setAuthMode(authMode==="signup"?"login":"signup"));
 $("forgotPasswordButton").addEventListener("click",()=>setAuthMode("reset"));
 $("signOutButton").addEventListener("click",async()=>{const {error}=await supabaseClient.auth.signOut();if(error){alert(authErrorMessage(error));return}showSignedOut()});
 supabaseClient.auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_IN"&&session?.user)showAuthenticatedApp(session.user);if(event==="SIGNED_OUT")showSignedOut();if(event==="PASSWORD_RECOVERY"){recoveryMode=true;document.querySelector("main.page").hidden=true;$("publicSite").hidden=false;$("appTopbar").hidden=true;$("authScreen").hidden=false;setAuthMode("updatepassword");showAuthMessage("پیوند بازیابی تأیید شد؛ رمز جدیدت را وارد کن.")}});
 const {data:{session},error}=await supabaseClient.auth.getSession();
 if(error){showSignedOut();openAuth("login");showAuthMessage(authErrorMessage(error),true);return}
 if(session?.user&&!recoveryMode){showAuthenticatedApp(session.user)}else if(!recoveryMode){showSignedOut()}
}
startAuth();
})();