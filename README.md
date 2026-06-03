# NETDOI Shop & Catalog

Next.js 14 (App Router) + Prisma + PostgreSQL + NextAuth.

- **หน้าร้าน (public, `/`)** — ลูกค้าทั่วไปดูสินค้า + ราคาขาย ค้นหา/กรองหมวด ไม่ต้อง login
- **หน้าพนักงาน (`/catalog`, ต้อง login)** — ราคาทุน + ราคาขาย, แก้ราคาทุนได้, ดูใบราคา

ราคาทุน (ราคาช่าง) เป็นความลับ — ไม่ส่งออกฝั่ง public client เลย คำนวณราคาขายในเซิร์ฟเวอร์

## เริ่มใช้งาน

```bash
cd web
cp .env.example .env        # กรอกค่าจริง (DATABASE_URL, NEXTAUTH_SECRET, รหัส admin)
npm install
npx prisma generate
npx prisma db push          # สร้าง table (idempotent)
npm run db:seed             # สร้าง admin + ใส่สินค้าจาก data/products.json
npm run dev                 # http://localhost:3005
```

> `data/products.json` และ `data/sheets/` ถูก gitignore (มีราคาทุน) — ต้องเตรียมเองในเครื่อง

## ข้อมูลสินค้า

อัปเดตจาก `build_catalog.py` (โปรเจกต์แม่) → `data/products.json` → `npm run db:seed`
(upsert ตาม brand+model; ราคาใหม่ทับเฉพาะเมื่อใบราคาวันที่ใหม่กว่า)

## Deploy (Docker)

ตั้ง env: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `SEED_ADMIN_PASSWORD` แล้ว:

```bash
docker compose up -d --build
```

`docker-compose.yml` อ่าน secret ทั้งหมดจาก environment — ไม่ hardcode

## ความปลอดภัย

- `.env`, `data/products.json`, `data/sheets/` = gitignore (ความลับ: cred + ราคาทุน)
- `/catalog` และ API ราคา/ใบราคา ต้อง login (middleware + getServerSession)
- รหัสผ่าน bcrypt hash
- หน้า public ส่งเฉพาะราคาขาย ไม่มีราคาทุนใน payload
