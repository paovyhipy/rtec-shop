# R-TEC Stock Supabase Webapp

เว็บแอปจัดการ stock/POS สำหรับหนังสือและสินค้า โดยย้ายฐานข้อมูลจาก Google Sheets/Apps Script มาใช้ Supabase

## ไฟล์สำคัญ

- `index.html` หน้าเว็บหลัก
- `styles.css` สไตล์หน้าเว็บ
- `app.js` logic ทั้งหมดและการเชื่อมต่อ Supabase
- `supabase-schema.sql` SQL สำหรับสร้างตาราง, trigger และ RLS policy

## วิธีใช้งาน

1. สร้าง Supabase project
2. เปิด SQL Editor แล้วรันไฟล์ `supabase-schema.sql`
3. เปิด `index.html` ใน browser
4. กดปุ่มตั้งค่า Supabase มุมขวาบน แล้วใส่ Project URL และ anon public key
5. เริ่มเพิ่มสินค้า นักเรียน และทำรายการขาย/เบิก

## Sync จาก Google Sheets

ชีตต้นทาง: `https://docs.google.com/spreadsheets/d/1Psx0Dx2_lRYQCuFbY6VeuCTJIVVAtksx_ko0MevZnB8/edit`

หลังจากรัน `supabase-schema.sql` แล้ว sync ข้อมูลด้วยคำสั่ง:

```bash
node scripts/sync-google-sheets-to-supabase.mjs
```

ตรวจจำนวนข้อมูลก่อน sync:

```bash
node scripts/sync-google-sheets-to-supabase.mjs --dry-run
```

สคริปต์จะดึงแท็บ `Inventory` และ `Students` จาก Google Sheets แล้วส่งเข้า Supabase โดย `products` ใช้ `book_id` เป็น key และ `students` ใช้ `student_id` เป็น key

ถ้าต้องการนำเข้า `Transactions` ด้วย ให้ใช้:

```bash
node scripts/sync-google-sheets-to-supabase.mjs --include-transactions
```

ไม่ควรใช้ `--include-transactions` ซ้ำหลายรอบกับชีตที่มีรายการบิลเดิม เพราะข้อมูลธุรกรรมไม่มี unique key จาก Google Sheets และอาจเกิดบิลซ้ำได้

## Sync จากหน้าเว็บ

หน้าเว็บมีปุ่ม `Sync Sheets` บนแถบด้านบน กดแล้วต้องใส่รหัส `0809212008` ก่อนเริ่ม sync

ปุ่มนี้จะ sync เฉพาะแท็บ `Inventory` และ `Students` จาก Google Sheets เข้า Supabase ด้วยการ upsert:

- `Inventory` -> `products` โดยใช้ `book_id`
- `Students` -> `students` โดยใช้ `student_id`

ก่อนใช้ปุ่มนี้ต้องรัน `supabase-schema.sql` เวอร์ชันล่าสุดก่อน เพราะข้อมูลจริงในชีตมีบาร์โค้ดซ้ำและบางรายการไม่มีบาร์โค้ด ตาราง `products` จึงต้องใช้ `book_id` เป็น unique key แทน `barcode`

หมายเหตุ: เว็บนี้เป็น static frontend ที่เชื่อม Supabase ด้วย anon key โดยตรง เหมาะกับงานภายในหรือ prototype ถ้าต้องการใช้งานจริงแบบหลายสิทธิ์ผู้ใช้ ควรเพิ่ม Supabase Auth และปรับ RLS policy ให้ผูกกับ role/user ของแต่ละคน
