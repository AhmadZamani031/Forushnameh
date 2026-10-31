// داده‌های اولیه برنامه از localStorage
let invoices = JSON.parse(localStorage.getItem('forushnameh_invoices')) || [];
let products = JSON.parse(localStorage.getItem('forushnameh_products')) || [
    { name: 'کالای نمونه ۱', price: 100000 },
    { name: 'خدمات عمومی', price: 500000 }
];

let invoiceItems = [];

// مقداردهی اولیه صفحه
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('current-date').innerText = new Date().toLocaleDateString('fa-IR');
    document.getElementById('invoice-number').innerText = Math.floor(1000 + Math.random() * 9000);
    
    // افزودن یک سطر خالی به صورت پیش‌فرض در فاکتور
    addInvoiceItem();
    renderProducts();
    renderReports();
});

// مدیریت تب‌ها
function switchTab(sectionId) {
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(sectionId).classList.add('active');
    event.currentTarget.classList.add('active');
}

// مدیریت سطرهای فاکتور
function addInvoiceItem() {
    invoiceItems.push({ name: '', quantity: 1, price: 0 });
    renderInvoiceItems();
}

function removeInvoiceItem(index) {
    invoiceItems.splice(index, 1);
    renderInvoiceItems();
    calculateTotal();
}

function renderInvoiceItems() {
    const tbody = document.getElementById('invoice-items-list');
    tbody.innerHTML = '';
    
    invoiceItems.forEach((item, index) => {
        let productOptions = products.map(p => `<option value="${p.name}" data-price="${p.price}">${p.name}</option>`).join('');
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>
                <select class="form-input" onchange="selectProduct(${index}, this)">
                    <option value="">انتخاب کالا...</option>
                    ${productOptions}
                </select>
            </td>
            <td><input type="number" class="small-input" value="${item.quantity}" min="1" oninput="updateItem(${index}, 'quantity', this.value)"></td>
            <td><input type="number" class="form-input" value="${item.price}" oninput="updateItem(${index}, 'price', this.value)"></td>
            <td class="item-row-total">${(item.quantity * item.price).toLocaleString()}</td>
            <td class="no-print"><button class="btn danger-btn" onclick="removeInvoiceItem(${index})">حذف</button></td>
        `;
        tbody.appendChild(row);
    });
    calculateTotal();
}

function selectProduct(index, selectElement) {
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    const price = selectedOption.getAttribute('data-price') || 0;
    const name = selectedOption.value;
    
    invoiceItems[index].name = name;
    invoiceItems[index].price = parseFloat(price);
    renderInvoiceItems();
}

function updateItem(index, field, value) {
    invoiceItems[index][field] = value === '' ? 0 : parseFloat(value);
    renderInvoiceItems();
}

function calculateTotal() {
    let subTotal = 0;
    invoiceItems.forEach((item, index) => {
        let rowTotal = item.quantity * item.price;
        subTotal += rowTotal;
        // بروزرسانی متن جمع هر سطر
        const rowTotals = document.querySelectorAll('.item-row-total');
        if(rowTotals[index]) {
            rowTotals[index].innerText = rowTotal.toLocaleString();
        }
    });

    const discount = parseFloat(document.getElementById('discount-amount').value) || 0;
    let finalTotal = subTotal - discount;
    if(finalTotal < 0) finalTotal = 0;

    document.getElementById('sub-total').innerText = subTotal.toLocaleString();
    document.getElementById('final-total').innerText = finalTotal.toLocaleString();
}

// ذخیره فاکتور و ایجاد خروجی PDF
function saveAndPrintInvoice() {
    const customerName = document.getElementById('customer-name').value || 'مشتری متفرقه';
    const finalTotalText = document.getElementById('final-total').innerText;
    const invoiceNum = document.getElementById('invoice-number').innerText;
    const invoiceDate = document.getElementById('current-date').innerText;

    if (invoiceItems.length === 0 || invoiceItems[0].name === '') {
        alert('لطفاً حداقل یک کالا به فاکتور اضافه کنید.');
        return;
    }

    // ذخیره در لیست گزارشات
    const newInvoice = {
        id: invoiceNum,
        date: invoiceDate,
        customer: customerName,
        total: finalTotalText,
        items: [...invoiceItems]
    };

    invoices.push(newInvoice);
    localStorage.setItem('forushnameh_invoices', JSON.stringify(invoices));

    renderReports();

    // ایجاد خروجی PDF با استفاده از کتابخانه html2pdf
    const element = document.getElementById('invoice-printable-area');
    const opt = {
        margin:       10,
        filename:     `Invoice-${invoiceNum}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().from(element).set(opt).save().then(() => {
        alert('فاکتور با موفقیت ذخیره و فایل PDF دانلود شد.');
        resetInvoice();
    });
}

function resetInvoice() {
    document.getElementById('customer-name').value = '';
    document.getElementById('discount-amount').value = 0;
    document.getElementById('invoice-number').innerText = Math.floor(1000 + Math.random() * 9000);
    invoiceItems = [];
    addInvoiceItem();
}

// مدیریت کالاها
function addProduct() {
    const name = document.getElementById('new-prod-name').value;
    const price = document.getElementById('new-prod-price').value;

    if(!name || !price) {
        alert('لطفاً نام و قیمت کالا را وارد کنید.');
        return;
    }

    products.push({ name, price: parseFloat(price) });
    localStorage.setItem('forushnameh_products', JSON.stringify(products));
    
    document.getElementById('new-prod-name').value = '';
    document.getElementById('new-prod-price').value = '';
    renderProducts();
    renderInvoiceItems(); // آپدیت گزینه‌های فاکتور
}

function deleteProduct(index) {
    products.splice(index, 1);
    localStorage.setItem('forushnameh_products', JSON.stringify(products));
    renderProducts();
    renderInvoiceItems();
}

function renderProducts() {
    const tbody = document.getElementById('products-list');
    tbody.innerHTML = '';
    products.forEach((p, index) => {
        tbody.innerHTML += `
            <tr>
                <td>${p.name}</td>
                <td>${p.price.toLocaleString()}</td>
                <td><button class="btn danger-btn" onclick="deleteProduct(${index})">حذف</button></td>
            </tr>
        `;
    });
}

// نمایش گزارشات و آمار فروش
function renderReports() {
    const tbody = document.getElementById('reports-list');
    tbody.innerHTML = '';
    
    let totalAmountNum = 0;
    invoices.forEach((inv, index) => {
        // تبدیل متن قیمت به عدد برای محاسبه جمع کل
        let cleanNum = parseFloat(inv.total.replace(/,/g, '')) || 0;
        totalAmountNum += cleanNum;

        tbody.innerHTML += `
            <tr>
                <td>${inv.id}</td>
                <td>${inv.date}</td>
                <td>${inv.customer}</td>
                <td>${inv.total}</td>
                <td><button class="btn danger-btn" onclick="deleteInvoice(${index})">حذف</button></td>
            </tr>
        `;
    });

    document.getElementById('total-invoices-count').innerText = invoices.length;
    document.getElementById('total-sales-amount').innerText = totalAmountNum.toLocaleString() + ' تومان';
}

function deleteInvoice(index) {
    invoices.splice(index, 1);
    localStorage.setItem('forushnameh_invoices', JSON.stringify(invoices));
    renderReports();
}
