const SHEET_ID = "1Psx0Dx2_lRYQCuFbY6VeuCTJIVVAtksx_ko0MevZnB8";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://owvnerfgjlwkfnpyhhqh.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93dm5lcmZnamx3a2ZucHloaHFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5Nzc1MDcsImV4cCI6MjA5MzU1MzUwN30.OIUdeCj1aCQ4RhSbjU7A_qMwGQwf5fFWitNzFZIsxPA";
const DRY_RUN = process.argv.includes("--dry-run");
const INCLUDE_TRANSACTIONS = process.argv.includes("--include-transactions");

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
  Prefer: "resolution=merge-duplicates,return=minimal"
};

async function main() {
  const products = await loadSheet("Inventory", mapProduct);
  const students = await loadSheet("Students", mapStudent);
  const transactions = INCLUDE_TRANSACTIONS ? await loadSheet("Transactions", mapTransaction) : [];

  if (DRY_RUN) {
    console.log(`Dry run: ${products.length} products, ${students.length} students, ${transactions.length} transactions.`);
    return;
  }

  await upsert("products", products, "book_id");
  await upsert("students", students, "student_id");
  if (transactions.length) {
    await insertMissingTransactions(transactions);
  }

  console.log(`Synced ${products.length} products, ${students.length} students, ${transactions.length} transactions.`);
}

async function loadSheet(sheetName, mapper) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot read sheet ${sheetName}: ${response.status} ${response.statusText}`);
  const csv = await response.text();
  return parseCsv(csv)
    .map(mapper)
    .filter(Boolean);
}

function mapProduct(row) {
  const bookId = clean(row.BookID);
  const name = clean(row.BookName);
  if (!bookId || !name) return null;
  return {
    book_id: bookId,
    barcode: clean(row.Barcode) || null,
    book_name: name,
    stock_qty: toInt(row.StockQty),
    image_url: clean(row.ImageURL) || null,
    lot_date: toIsoDate(row.LotDate),
    price: toNumber(row.Price),
    category: clean(row.Category),
    semester: clean(row.Semester)
  };
}

function mapStudent(row) {
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

function mapTransaction(row) {
  const timestamp = clean(row.Timestamp);
  const bookName = clean(row.BookName);
  if (!timestamp || !bookName) return null;
  const qty = toInt(row.Qty);
  const type = clean(row.Type).includes("รับ") ? "stock_in" : "sale";
  return {
    bill_no: null,
    type,
    barcode: clean(row.Barcode) || null,
    book_name: bookName,
    qty: qty > 0 ? qty : 1,
    student_id: clean(row.StudentID),
    student_name: clean(row.StudentName),
    level: clean(row.Level),
    note: clean(row.Note),
    department: clean(row.Department),
    price: toNumber(row.Price),
    total_price: toNumber(row.TotalPrice),
    staff_name: clean(row.StaffName),
    payment_method: clean(row.PaymentMethod),
    created_at: toDateTime(timestamp)
  };
}

async function upsert(table, rows, conflictColumn) {
  if (!rows.length) return;
  for (const batch of chunk(rows, 500)) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflictColumn}`;
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(batch)
    });
    if (!response.ok) {
      throw new Error(`Supabase upsert ${table} failed: ${response.status} ${await response.text()}`);
    }
  }
}

async function insertMissingTransactions(rows) {
  for (const batch of chunk(rows, 500)) {
    const url = `${SUPABASE_URL}/rest/v1/transactions`;
    const response = await fetch(url, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify(batch)
    });
    if (!response.ok) {
      throw new Error(`Supabase insert transactions failed: ${response.status} ${await response.text()}`);
    }
  }
}

function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headerRow, ...dataRows] = rows;
  if (!headerRow) return [];
  return dataRows.map((cells) => Object.fromEntries(headerRow.map((header, index) => [header, cells[index] ?? ""])));
}

function toIsoDate(value) {
  const raw = clean(value);
  if (!raw) return null;
  const parts = raw.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return raw;
}

function toDateTime(value) {
  const raw = clean(value);
  if (!raw) return new Date().toISOString();
  const [datePart, timePart = "00:00:00"] = raw.split(" ");
  const parts = datePart.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${timePart}+07:00`;
  }
  return raw;
}

function toInt(value) {
  return Math.max(0, Math.trunc(toNumber(value)));
}

function toNumber(value) {
  const number = Number(String(value || "").replaceAll(",", "").trim());
  return Number.isFinite(number) ? number : 0;
}

function clean(value) {
  return String(value ?? "").trim();
}

function chunk(rows, size) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
