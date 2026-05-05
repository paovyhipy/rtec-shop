const els = {};
const SUPABASE_DEFAULT_URL = "https://owvnerfgjlwkfnpyhhqh.supabase.co";
const SUPABASE_DEFAULT_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93dm5lcmZnamx3a2ZucHloaHFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5Nzc1MDcsImV4cCI6MjA5MzU1MzUwN30.OIUdeCj1aCQ4RhSbjU7A_qMwGQwf5fFWitNzFZIsxPA";
const GOOGLE_SHEET_ID = "1Psx0Dx2_lRYQCuFbY6VeuCTJIVVAtksx_ko0MevZnB8";
const SYNC_PASSWORD = "0809212008";
const state = {
  supabase: null,
  products: [],
  students: [],
  transactions: [],
  logs: [],
  cart: [],
  chart: null
};

const TABLES = {
  products: "products",
  students: "students",
  transactions: "transactions",
  logs: "logs"
};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  bindEvents();
  tickClock();
  setInterval(tickClock, 1000);
  initSupabaseFromStorage();
  renderAll();
  if (state.supabase) loadAllData();
});

function bindElements() {
  document.querySelectorAll("[id]").forEach((node) => { els[toCamel(node.id)] = node; });
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  els.refreshBtn.addEventListener("click", loadAllData);
  els.syncSheetsBtn.addEventListener("click", syncGoogleSheets);
  els.addProductBtn.addEventListener("click", () => openProductDialog());
  els.saveProduct.addEventListener("click", saveProduct);
  els.addStudentBtn.addEventListener("click", () => openStudentDialog());
  els.saveStudent.addEventListener("click", saveStudent);
  els.clearCart.addEventListener("click", () => { state.cart = []; renderCart(); });
  els.checkoutBtn.addEventListener("click", checkout);
  els.exportLogBtn.addEventListener("click", exportLogs);

  ["productSearch", "posSearch", "studentSearch", "billSearch"].forEach((key) => {
    els[key].addEventListener("input", renderAll);
  });

  els.saleStudentId.addEventListener("change", () => autofillStudent("id"));
  els.saleStudentName.addEventListener("change", () => autofillStudent("name"));
  els.saleFree.addEventListener("change", renderCart);
  els.salePayment.addEventListener("change", renderCart);
}

function toCamel(id) {
  return id.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function initSupabaseFromStorage() {
  const url = SUPABASE_DEFAULT_URL;
  const key = SUPABASE_DEFAULT_ANON_KEY;
  if (!url || !key || !window.supabase) {
    setStatus("ยังไม่ได้เชื่อมต่อ Supabase", false);
    return;
  }
  state.supabase = window.supabase.createClient(url, key);
  setStatus("เชื่อมต่อ Supabase แล้ว", true);
}

function setStatus(text, connected) {
  els.connectionStatus.textContent = text;
  els.connectionStatus.style.color = connected ? "#20805a" : "#64748b";
}

async function requireDb() {
  if (!state.supabase) {
    throw new Error("ยังเชื่อมต่อ Supabase ไม่ได้ กรุณาตรวจว่าโหลด Supabase JS สำเร็จ");
  }
  return state.supabase;
}

async function loadAllData() {
  try {
    const db = await requireDb();
    setStatus("กำลังโหลดข้อมูล...", true);
    const [products, students, transactions, logs] = await Promise.all([
      db.from(TABLES.products).select("*").order("book_name"),
      db.from(TABLES.students).select("*").order("student_id"),
      db.from(TABLES.transactions).select("*").order("created_at", { ascending: false }).limit(1000),
      db.from(TABLES.logs).select("*").order("created_at", { ascending: false }).limit(1000)
    ]);

    [products, students, transactions, logs].forEach((result) => {
      if (result.error) throw result.error;
    });

    state.products = products.data || [];
    state.students = students.data || [];
    state.transactions = transactions.data || [];
    state.logs = logs.data || [];
    setStatus(`โหลดข้อมูลล่าสุด ${new Date().toLocaleTimeString("th-TH")}`, true);
    renderAll();
  } catch (error) {
    if (error.message !== "Supabase is not configured") notify(error.message, "error");
    setStatus("เชื่อมต่อไม่ได้หรือยังไม่ได้ตั้งค่า", false);
  }
}

async function syncGoogleSheets() {
  try {
    await requireDb();
    const pass = await Swal.fire({
      title: "ใส่รหัสก่อน Sync",
      input: "password",
      inputPlaceholder: "รหัสผ่าน",
      showCancelButton: true,
      confirmButtonText: "เริ่ม Sync",
      cancelButtonText: "ยกเลิก",
      inputValidator: (value) => {
        if (!value) return "กรุณาใส่รหัสผ่าน";
        if (value !== SYNC_PASSWORD) return "รหัสผ่านไม่ถูกต้อง";
        return undefined;
      }
    });
    if (!pass.isConfirmed) return;

    Swal.fire({
      title: "กำลัง Sync ข้อมูล...",
      text: "กำลังดึง Inventory และ Students จาก Google Sheets",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    const [productRows, studentRows] = await Promise.all([
      loadGoogleSheet("Inventory"),
      loadGoogleSheet("Students")
    ]);

    const products = productRows.map(mapSheetProduct).filter(Boolean);
    const students = studentRows.map(mapSheetStudent).filter(Boolean);

    await upsertInBatches(TABLES.products, products, "book_id");
    await upsertInBatches(TABLES.students, students, "student_id");
    await loadAllData();

    Swal.fire({
      icon: "success",
      title: "Sync สำเร็จ",
      text: `อัปเดตสินค้า ${products.length} รายการ และนักเรียน ${students.length} รายการ`,
      confirmButtonText: "ตกลง"
    });
  } catch (error) {
    Swal.fire({
      icon: "error",
      title: "Sync ไม่สำเร็จ",
      text: error.message,
      confirmButtonText: "ตกลง"
    });
  }
}

function loadGoogleSheet(sheetName) {
  return new Promise((resolve, reject) => {
    const callbackName = `__rtecSheetCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };

    window[callbackName] = (response) => {
      try {
        cleanup();
        if (response.status === "error") {
          reject(new Error(response.errors?.[0]?.detailed_message || `อ่านชีต ${sheetName} ไม่ได้`));
          return;
        }
        resolve(tableToObjects(response.table));
      } catch (error) {
        reject(error);
      }
    };

    script.onerror = () => {
      cleanup();
      reject(new Error(`โหลดข้อมูลจาก Google Sheets แท็บ ${sheetName} ไม่ได้`));
    };
    script.src = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&tqx=responseHandler:${callbackName}`;
    document.body.appendChild(script);
  });
}

function tableToObjects(table) {
  const headers = (table.cols || []).map((col) => col.label || col.id);
  return (table.rows || []).map((row) => {
    const object = {};
    headers.forEach((header, index) => {
      const cell = row.c?.[index];
      object[header] = cell?.f ?? cell?.v ?? "";
    });
    return object;
  });
}

function mapSheetProduct(row) {
  const bookId = clean(row.BookID);
  const bookName = clean(row.BookName);
  if (!bookId || !bookName) return null;
  return {
    book_id: bookId,
    barcode: clean(row.Barcode) || null,
    book_name: bookName,
    stock_qty: Math.max(0, Math.trunc(toNumber(row.StockQty))),
    image_url: clean(row.ImageURL) || null,
    lot_date: sheetDateToIso(row.LotDate),
    price: toNumber(row.Price),
    category: clean(row.Category),
    semester: clean(row.Semester)
  };
}

function mapSheetStudent(row) {
  const studentId = clean(row.StudentID);
  const fullName = clean(row.FullName);
  if (!studentId || !fullName) return null;
  return {
    student_id: studentId,
    full_name: fullName,
    level: clean(row.Level),
    department: clean(row.Department)
  };
}

async function upsertInBatches(table, rows, onConflict) {
  if (!rows.length) return;
  for (let index = 0; index < rows.length; index += 500) {
    const batch = rows.slice(index, index + 500);
    const result = await state.supabase.from(table).upsert(batch, { onConflict });
    if (result.error) throw result.error;
  }
}

function switchTab(tab) {
  const titles = {
    overview: "ภาพรวมระบบ",
    pos: "ระบบขาย/เบิก",
    products: "จัดการสินค้า",
    students: "ข้อมูลนักเรียน",
    bills: "บิลย้อนหลัง",
    logs: "ประวัติ stock"
  };
  document.querySelectorAll(".tab").forEach((section) => section.classList.toggle("active", section.id === tab));
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  els.pageTitle.textContent = titles[tab] || "R-TEC STOCK";
}

function renderAll() {
  renderDashboard();
  renderProducts();
  renderProductCards();
  renderStudents();
  renderBills();
  renderLogs();
  renderCart();
  renderDatalists();
}

function renderDashboard() {
  const saleRows = state.transactions.filter((row) => row.type === "sale");
  const totalStock = sum(state.products, "stock_qty");
  const totalSold = sum(saleRows, "qty");
  const revenue = sum(saleRows, "total_price");
  const productSales = groupSum(saleRows, "book_name", "qty");
  const topProduct = Object.entries(productSales).sort((a, b) => b[1] - a[1])[0];

  els.metricStock.textContent = totalStock.toLocaleString("th-TH");
  els.metricSold.textContent = totalSold.toLocaleString("th-TH");
  els.metricRevenue.textContent = money(revenue);
  els.metricTopProduct.textContent = topProduct ? topProduct[0] : "-";

  const low = [...state.products].sort((a, b) => Number(a.stock_qty) - Number(b.stock_qty)).slice(0, 8);
  fillRows(els.lowStockBody, low, (product) => `
    <td>${escapeHtml(product.book_name)}</td>
    <td><span class="pill">${Number(product.stock_qty).toLocaleString("th-TH")}</span></td>
  `, 2);
  renderChart(productSales);
}

function renderChart(productSales) {
  if (!els.productChart || !window.Chart) return;
  const rows = Object.entries(productSales).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const data = {
    labels: rows.map((row) => row[0]),
    datasets: [{ label: "จำนวนขาย/เบิก", data: rows.map((row) => row[1]), backgroundColor: "#1769aa" }]
  };
  if (state.chart) {
    state.chart.data = data;
    state.chart.update();
    return;
  }
  state.chart = new Chart(els.productChart, {
    type: "bar",
    data,
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

function renderProducts() {
  const query = normalize(els.productSearch.value);
  const products = state.products.filter((product) => searchable(product, ["book_id", "barcode", "book_name", "category", "semester"], query));
  fillRows(els.productsBody, products, (product) => `
    <td>${escapeHtml(product.book_id || "-")}</td>
    <td>${escapeHtml(product.barcode)}</td>
    <td>${escapeHtml(product.book_name)}</td>
    <td>${Number(product.stock_qty).toLocaleString("th-TH")}</td>
    <td>${money(product.price)}</td>
    <td>${escapeHtml(product.category || "-")}</td>
    <td>${escapeHtml(product.semester || "-")}</td>
    <td>
      <button class="icon-btn" title="แก้ไข" onclick="openProductDialog('${product.id}')"><i class="fa-solid fa-pen"></i></button>
      <button class="icon-btn danger" title="ลบ" onclick="deleteProduct('${product.id}')"><i class="fa-solid fa-trash"></i></button>
    </td>
  `, 8);
}

function renderProductCards() {
  const query = normalize(els.posSearch.value);
  const products = state.products.filter((product) => searchable(product, ["barcode", "book_name", "category"], query));
  els.productCards.innerHTML = products.map((product) => {
    const disabled = Number(product.stock_qty) <= 0;
    return `
      <article class="product-card ${disabled ? "disabled" : ""}" onclick="${disabled ? "" : `addToCart('${product.id}')`}">
        <strong>${escapeHtml(product.book_name)}</strong>
        <span class="pill">${escapeHtml(product.barcode)}</span>
        <div class="product-meta"><span>stock ${Number(product.stock_qty).toLocaleString("th-TH")}</span><span>${money(product.price)}</span></div>
      </article>
    `;
  }).join("") || `<div class="empty">ไม่มีสินค้า</div>`;
}

function renderStudents() {
  const query = normalize(els.studentSearch.value);
  const students = state.students.filter((student) => searchable(student, ["student_id", "full_name", "level", "department"], query));
  fillRows(els.studentsBody, students, (student) => `
    <td>${escapeHtml(student.student_id)}</td>
    <td>${escapeHtml(student.full_name)}</td>
    <td>${escapeHtml(student.level || "-")}</td>
    <td>${escapeHtml(student.department || "-")}</td>
    <td>
      <button class="icon-btn" title="แก้ไข" onclick="openStudentDialog('${student.id}')"><i class="fa-solid fa-pen"></i></button>
      <button class="icon-btn danger" title="ลบ" onclick="deleteStudent('${student.id}')"><i class="fa-solid fa-trash"></i></button>
    </td>
  `, 5);
}

function renderBills() {
  const query = normalize(els.billSearch.value);
  const sales = state.transactions.filter((row) => row.type === "sale" && searchable(row, ["bill_no", "student_id", "student_name", "book_name"], query));
  fillRows(els.billsBody, sales, (row) => `
    <td>${formatDate(row.created_at)}</td>
    <td>${escapeHtml(row.bill_no || "-")}</td>
    <td>${escapeHtml(row.student_name || "-")}</td>
    <td>${escapeHtml(row.book_name)}</td>
    <td>${Number(row.qty).toLocaleString("th-TH")}</td>
    <td>${money(row.total_price)}</td>
    <td>${escapeHtml(row.payment_method || "-")}</td>
  `, 7);
}

function renderLogs() {
  const stockRows = state.transactions.filter((row) => row.type !== "sale");
  const rows = [...stockRows, ...state.logs.map((log) => ({
    created_at: log.created_at,
    type: log.action,
    barcode: log.barcode,
    book_name: log.book_name,
    qty: "",
    note: `${log.detail || ""} ${log.staff_name ? `(${log.staff_name})` : ""}`
  }))].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  fillRows(els.logsBody, rows, (row) => `
    <td>${formatDate(row.created_at)}</td>
    <td>${escapeHtml(typeLabel(row.type))}</td>
    <td>${escapeHtml(row.barcode || "-")}</td>
    <td>${escapeHtml(row.book_name || "-")}</td>
    <td>${row.qty ? Number(row.qty).toLocaleString("th-TH") : "-"}</td>
    <td>${escapeHtml(row.note || "-")}</td>
  `, 6);
}

function renderCart() {
  els.cartItems.innerHTML = state.cart.map((item) => `
    <div class="cart-item">
      <div><strong>${escapeHtml(item.book_name)}</strong><span>${money(item.price)} x ${item.qty}</span></div>
      <input class="input" type="number" min="1" max="${item.stock_qty}" value="${item.qty}" onchange="updateCartQty('${item.id}', this.value)">
      <button class="icon-btn danger" onclick="removeFromCart('${item.id}')" title="นำออก"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `).join("") || `<div class="empty">ยังไม่มีสินค้าในตะกร้า</div>`;

  const total = state.cart.reduce((acc, item) => acc + Number(item.price) * Number(item.qty), 0);
  const payable = els.saleFree.checked || els.salePayment.value === "เบิกฟรี" ? 0 : total;
  els.cartTotal.textContent = `${money(payable)} บาท`;
}

function renderDatalists() {
  els.studentIdList.innerHTML = state.students.map((student) => `<option value="${escapeHtml(student.student_id)}"></option>`).join("");
  els.studentNameList.innerHTML = state.students.map((student) => `<option value="${escapeHtml(student.full_name)}"></option>`).join("");
}

function fillRows(tbody, rows, template, colSpan) {
  tbody.innerHTML = rows.length
    ? rows.map((row) => `<tr>${template(row)}</tr>`).join("")
    : `<tr><td colspan="${colSpan}" class="empty">ไม่มีข้อมูล</td></tr>`;
}

window.openProductDialog = function openProductDialog(id) {
  const product = id ? state.products.find((row) => row.id === id) : null;
  els.productDialogTitle.textContent = product ? "แก้ไขสินค้า" : "เพิ่มสินค้า";
  els.productId.value = product?.id || "";
  els.bookId.value = product?.book_id || "";
  els.barcode.value = product?.barcode || "";
  els.bookName.value = product?.book_name || "";
  els.stockQty.value = product?.stock_qty ?? 0;
  els.price.value = product?.price ?? 0;
  els.lotDate.value = product?.lot_date || "";
  els.category.value = product?.category || "";
  els.semester.value = product?.semester || "";
  els.productStaff.value = "";
  els.productDialog.showModal();
};

async function saveProduct(event) {
  event.preventDefault();
  try {
    const db = await requireDb();
    const id = els.productId.value;
    const oldProduct = id ? state.products.find((row) => row.id === id) : null;
    const payload = {
      book_id: els.bookId.value.trim(),
      barcode: els.barcode.value.trim(),
      book_name: els.bookName.value.trim(),
      stock_qty: Number(els.stockQty.value) || 0,
      lot_date: els.lotDate.value || null,
      price: Number(els.price.value) || 0,
      category: els.category.value.trim(),
      semester: els.semester.value.trim()
    };

    if (!payload.barcode || !payload.book_name) {
      notify("กรุณาใส่บาร์โค้ดและชื่อสินค้า", "warning");
      return;
    }

    const result = id
      ? await db.from(TABLES.products).update(payload).eq("id", id)
      : await db.from(TABLES.products).insert(payload);
    if (result.error) throw result.error;

    const delta = Number(payload.stock_qty) - Number(oldProduct?.stock_qty || 0);
    if (!id || delta !== 0) {
      await db.from(TABLES.transactions).insert({
        type: delta >= 0 ? "stock_in" : "adjustment",
        barcode: payload.barcode,
        book_name: payload.book_name,
        qty: Math.abs(delta || payload.stock_qty || 1),
        note: id ? "ปรับ stock" : "เพิ่มสินค้าใหม่",
        price: payload.price,
        total_price: 0,
        staff_name: els.productStaff.value.trim() || "Admin"
      });
    }

    await db.from(TABLES.logs).insert({
      action: id ? "แก้ไขสินค้า" : "เพิ่มสินค้า",
      barcode: payload.barcode,
      book_name: payload.book_name,
      detail: id ? "อัปเดตข้อมูลสินค้า" : `เพิ่มจำนวน ${payload.stock_qty}`,
      staff_name: els.productStaff.value.trim() || "Admin"
    });

    els.productDialog.close();
    await loadAllData();
    notify("บันทึกสินค้าแล้ว", "success");
  } catch (error) {
    notify(error.message, "error");
  }
}

window.deleteProduct = async function deleteProduct(id) {
  const product = state.products.find((row) => row.id === id);
  if (!product) return;
  const confirm = await Swal.fire({
    title: "ลบสินค้า?",
    text: product.book_name,
    icon: "warning",
    input: "text",
    inputPlaceholder: "ชื่อผู้ทำรายการ",
    showCancelButton: true,
    confirmButtonText: "ลบ",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#c24135"
  });
  if (!confirm.isConfirmed) return;
  try {
    const db = await requireDb();
    const result = await db.from(TABLES.products).delete().eq("id", id);
    if (result.error) throw result.error;
    await db.from(TABLES.logs).insert({
      action: "ลบสินค้า",
      barcode: product.barcode,
      book_name: product.book_name,
      detail: "ลบออกจากระบบ",
      staff_name: confirm.value || "Admin"
    });
    await loadAllData();
    notify("ลบสินค้าแล้ว", "success");
  } catch (error) {
    notify(error.message, "error");
  }
};

window.openStudentDialog = function openStudentDialog(id) {
  const student = id ? state.students.find((row) => row.id === id) : null;
  els.studentDialogTitle.textContent = student ? "แก้ไขนักเรียน" : "เพิ่มนักเรียน";
  els.studentRowId.value = student?.id || "";
  els.studentId.value = student?.student_id || "";
  els.studentFullName.value = student?.full_name || "";
  els.studentLevel.value = student?.level || "";
  els.studentDepartment.value = student?.department || "";
  els.studentDialog.showModal();
};

async function saveStudent(event) {
  event.preventDefault();
  try {
    const db = await requireDb();
    const id = els.studentRowId.value;
    const payload = {
      student_id: els.studentId.value.trim(),
      full_name: els.studentFullName.value.trim(),
      level: els.studentLevel.value.trim(),
      department: els.studentDepartment.value.trim()
    };
    if (!payload.student_id || !payload.full_name) {
      notify("กรุณาใส่รหัสนักเรียนและชื่อ", "warning");
      return;
    }
    const result = id
      ? await db.from(TABLES.students).update(payload).eq("id", id)
      : await db.from(TABLES.students).insert(payload);
    if (result.error) throw result.error;
    els.studentDialog.close();
    await loadAllData();
    notify("บันทึกนักเรียนแล้ว", "success");
  } catch (error) {
    notify(error.message, "error");
  }
}

window.deleteStudent = async function deleteStudent(id) {
  const student = state.students.find((row) => row.id === id);
  if (!student) return;
  const confirm = await Swal.fire({ title: "ลบนักเรียน?", text: student.full_name, icon: "warning", showCancelButton: true, confirmButtonText: "ลบ", cancelButtonText: "ยกเลิก", confirmButtonColor: "#c24135" });
  if (!confirm.isConfirmed) return;
  try {
    const db = await requireDb();
    const result = await db.from(TABLES.students).delete().eq("id", id);
    if (result.error) throw result.error;
    await loadAllData();
    notify("ลบนักเรียนแล้ว", "success");
  } catch (error) {
    notify(error.message, "error");
  }
};

window.addToCart = function addToCart(id) {
  const product = state.products.find((row) => row.id === id);
  if (!product || Number(product.stock_qty) <= 0) return;
  const existing = state.cart.find((item) => item.id === id);
  if (existing) {
    existing.qty = Math.min(Number(existing.stock_qty), Number(existing.qty) + 1);
  } else {
    state.cart.push({ ...product, qty: 1 });
  }
  renderCart();
};

window.updateCartQty = function updateCartQty(id, value) {
  const item = state.cart.find((row) => row.id === id);
  if (!item) return;
  item.qty = Math.max(1, Math.min(Number(item.stock_qty), Number(value) || 1));
  renderCart();
};

window.removeFromCart = function removeFromCart(id) {
  state.cart = state.cart.filter((item) => item.id !== id);
  renderCart();
};

async function checkout() {
  if (!state.cart.length) {
    notify("กรุณาเลือกสินค้า", "warning");
    return;
  }
  if (!els.saleStudentName.value.trim()) {
    notify("กรุณาใส่ชื่อผู้รับ / ลูกค้า", "warning");
    return;
  }
  try {
    const db = await requireDb();
    const billNo = `B${Date.now()}`;
    const free = els.saleFree.checked || els.salePayment.value === "เบิกฟรี";
    const rows = state.cart.map((item) => ({
      bill_no: billNo,
      type: "sale",
      barcode: item.barcode,
      book_name: item.book_name,
      qty: Number(item.qty),
      student_id: els.saleStudentId.value.trim(),
      student_name: els.saleStudentName.value.trim(),
      level: els.saleLevel.value.trim(),
      note: free ? "ส่วนลด 100%" : "ทำรายการผ่าน POS",
      department: els.saleDepartment.value.trim(),
      price: Number(item.price),
      total_price: free ? 0 : Number(item.price) * Number(item.qty),
      staff_name: els.saleStaff.value.trim() || "Admin",
      payment_method: free ? "เบิกฟรี" : els.salePayment.value
    }));

    const tx = await db.from(TABLES.transactions).insert(rows);
    if (tx.error) throw tx.error;

    for (const item of state.cart) {
      const product = state.products.find((row) => row.id === item.id);
      const stockQty = Math.max(0, Number(product.stock_qty) - Number(item.qty));
      const result = await db.from(TABLES.products).update({ stock_qty: stockQty }).eq("id", item.id);
      if (result.error) throw result.error;
    }

    state.cart = [];
    await loadAllData();
    notify(`บันทึกบิล ${billNo} แล้ว`, "success");
  } catch (error) {
    notify(error.message, "error");
  }
}

function autofillStudent(mode) {
  const value = mode === "id" ? els.saleStudentId.value.trim() : els.saleStudentName.value.trim();
  const student = state.students.find((row) => mode === "id" ? row.student_id === value : row.full_name === value);
  if (!student) return;
  els.saleStudentId.value = student.student_id || "";
  els.saleStudentName.value = student.full_name || "";
  els.saleLevel.value = student.level || "";
  els.saleDepartment.value = student.department || "";
}

function exportLogs() {
  const rows = state.transactions.map((row) => [
    formatDate(row.created_at), typeLabel(row.type), row.barcode || "", row.book_name || "", row.qty || "", row.note || ""
  ]);
  downloadCsv("RTEC_Stock_Log.csv", ["เวลา", "ประเภท", "บาร์โค้ด", "สินค้า", "จำนวน", "หมายเหตุ"], rows);
}

function downloadCsv(filename, headers, rows) {
  const csv = "\ufeff" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function sum(rows, key) {
  return rows.reduce((acc, row) => acc + Number(row[key] || 0), 0);
}

function groupSum(rows, labelKey, valueKey) {
  return rows.reduce((acc, row) => {
    const label = row[labelKey] || "-";
    acc[label] = (acc[label] || 0) + Number(row[valueKey] || 0);
    return acc;
  }, {});
}

function searchable(row, keys, query) {
  if (!query) return true;
  return keys.some((key) => normalize(row[key]).includes(query));
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function clean(value) {
  return String(value ?? "").trim();
}

function toNumber(value) {
  const number = Number(clean(value).replaceAll(",", ""));
  return Number.isFinite(number) ? number : 0;
}

function sheetDateToIso(value) {
  const raw = clean(value);
  if (!raw) return null;
  const dateMatch = raw.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})\)$/);
  if (dateMatch) {
    const year = dateMatch[1];
    const month = String(Number(dateMatch[2]) + 1).padStart(2, "0");
    const day = dateMatch[3].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const parts = raw.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return raw;
}

function money(value) {
  return Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

function typeLabel(type) {
  return {
    sale: "ขาย/เบิก",
    stock_in: "รับเข้า stock",
    adjustment: "ปรับ stock",
    delete: "ลบสินค้า"
  }[type] || type || "-";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function tickClock() {
  if (els.clock) els.clock.textContent = new Date().toLocaleTimeString("th-TH");
}

function notify(message, icon = "info") {
  if (window.Swal) {
    Swal.fire({ text: message, icon, timer: icon === "success" ? 1500 : undefined, showConfirmButton: icon !== "success" });
  } else {
    alert(message);
  }
}
