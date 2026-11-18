# [Bug][Cut Short] ตัด Short ทั้งตู้ใน Phase B ทำให้ TO ค้างเปิดหลังถอย IR/IF และ Post BL ออก IF เกิน

**Labels (เสนอ):** `bug`, `area:cut-short`, `area:post-bl`, `severity:high`, `verification:confirmed`
**Repos ที่เกี่ยวข้อง:** `short-shipment` (Cut Short) และ `PostBLDate` (Post BL Date)
**จดไว้เมื่อ:** 2026-11-18 · ตรวจบน Production แบบอ่านอย่างเดียว ยังไม่ได้แก้อะไร

## ปัญหา / อาการ

SA `SAE-IQ-TH-DA-26100007` (id 4954304): ตู้ 4 ใบถึง Port แล้วขึ้นเรือไม่ได้ จึงต้องถอย IR และ IF เพื่อเอาของกลับโรงงาน ส่วนที่ส่งได้จริงมี 6 ตู้
หลังถอย TO ของ 4 ตู้กลับเป็น Pending Fulfillment ผู้ใช้เห็นเป็นงานค้างให้ทำ IF/IR และ Post BL ถูกบล็อก

## ผลที่พบ

| ตู้ | TO | สถานะ TO ตอนนี้ |
|---|---|---|
| CSNU6649002 | TO-DA-261101403 (4959117) | Pending Fulfillment |
| BMOU5850591 | TO-DA-261101404 (4959120) | Pending Fulfillment |
| FCIU9818003 | TO-DA-261101405 (4959121) | Pending Fulfillment |
| FFAU2579487 | TO-DA-261101406 (4959123) | Pending Fulfillment |

- Plan Load ของ 4 ตู้: `isinactive = T`, `short_con = T`, `short_qty_old` ถูกบันทึก (Container-level)
- TO line ยังมีจำนวนเต็ม (11,227.5 และ 13,473 kg) และไม่ถูกปิด
- ไม่มี IF/IR อ้างอิง Plan Load ของ 4 ตู้นี้เหลืออยู่
- Wave line ของ 4 ตู้ยัง active, Qty Shipped เต็มจำนวน, Ref Fulfillment ว่าง
- `SA Load Status = Final` แบบ Forced (เป็นแค่ป้ายสถานะ ไม่ได้ gate IF/IR)
- SA qty ตรงกับ 6 ตู้ที่เหลือ: Item 96580 = 67,365 kg, Item 96581 = 80,838 kg

ลำดับเหตุการณ์จาก System Notes ของ TO-DA-261101403 (เรียงตาม id):
1. 14/11 สร้าง IF แล้ว MR สร้าง IR ต่อ TO เป็น Received
2. 16/11 Cut Short เขียนเหตุผลกับ `qty_old` ลง TO (note id 465203301–465203700)
3. 16/11 IR หาย Received → Pending Receipt (465211056–465211060)
4. 16/11 IF หาย Pending Receipt → Pending Fulfillment (465213063–465213069)

## ผลที่ควรเป็น

- TO ของตู้ที่ถูก Short ทั้งตู้ต้อง Closed (line ปิดครบ) ไม่ใช่เปิดเต็มจำนวน
- Post BL ต้องออก IF เท่ากับจำนวนที่ส่งจริง (6 ตู้) ตรงกับ Invoice

## ขั้นตอนทำซ้ำ

ยังไม่ได้ทำซ้ำบน SB1 ลำดับที่เกิดบน Prod คือ
1. มี TO ที่มี IF และ IR แล้ว (Phase B)
2. กด Cut Short แบบ Container-level
3. ถอย IR แล้วถอย IF (CFR Cancel IF/IR)
4. TO กลับเป็น Pending Fulfillment, line เปิด, Post BL ติด pre-check "ยังไม่มีการรับสินค้า"

## สภาพแวดล้อม

Production account 8158655 · Script `customscript_sl_update_qty_cut_short` (id 3042) · Lib `Lib - SA Shipment Status.js` · Post BL: `Lib - PostBL Process.js` (file id 437130)

## หลักฐาน

- Plan Load / TO / Wave / System Notes ดึงด้วย SuiteQL Query Tool (read-only) วันที่ 2026-11-18
- โค้ด Cut Short: Phase A (ไม่มี IF) ปิด TO line เมื่อ effective qty = 0 · Phase B (มี IF) ไม่ปิดและไม่ลดจำนวน (`Script - SL Update Qty Cut Short.js` ช่วงบรรทัด ~1255–1405)
- โค้ด Post BL: IF qty = ผลรวม Lot จาก IR (`qty = lotQtyTotal`) ไม่ cap ด้วย SA qty · Invoice ใช้ SA qty · pre-check ใช้ Saved Search 6300 (`customsearch_ss_script_check_to_ir`)
- PostBLDate `docs/KNOWN-ISSUES.md` ข้อ 1 บันทึกปัญหา IF เกินยอดใน Phase B ไว้แล้ว (Parked 2026-09-28)

## ผลกระทบ

- ถอย IR/IF แล้ว: TO ค้างเปิด, Post BL ถูกบล็อก, งานค้างโผล่ในรายการ IF/IR
- ไม่ถอย IR/IF: Post BL ออก IF 10 ตู้ แต่ Invoice 6 ตู้ → สต็อก Port ถูกตัดเกิน, PI Fulfilled ไม่เท่ากับ Billed, ยอด IF ไม่ตรงเอกสารศุลกากร

## แนวทางแก้ที่เสนอ (ยังไม่ได้ทำ)

ลำดับแนะนำ: ชั้น 3 → ชั้น 2 → ชั้น 1

1. **ชั้น 3 — Post BL guard (`PostBLDate`, `Lib - PostBL Process.js`):** ก่อนสร้าง IF เทียบจำนวนที่ IR รับกับ SA qty ต่อ Item ถ้า IR เกินให้ throw พร้อมบอก Item และจำนวนที่เกิน ไม่สร้าง IF/Invoice และไม่ปิด SA
2. **ชั้น 2 — Cut Short block (`short-shipment`):** Container-level และ TO มี IF อยู่ → หยุดและแจ้ง "ต้องถอย IR/IF ก่อน" ไม่ให้ลดเงียบ ๆ (ไม่ให้ Script ลบ IF/IR เอง เพราะกระทบสต็อก/Lot)
3. **ชั้น 1 — ลำดับขั้นตอนสำหรับทีม:** ถอย IR → ถอย IF → Cut Short (เข้า Phase A ปิด TO line) → Post BL
4. (ทีหลัง) ตัด Lot ของตู้ที่ Short ออกจาก IF โดยตรง ตามแบบใน KNOWN-ISSUES ข้อ 1

## เกณฑ์ตรวจรับ

- [ ] Post BL บน SA ที่ IR เกิน SA qty ถูกปฏิเสธพร้อมข้อความชี้ Item/จำนวน
- [ ] Cut Short Container-level บน TO ที่มี IF แสดงข้อความให้ถอย IR/IF ก่อน และไม่เขียนข้อมูลใด ๆ
- [ ] ทำตามลำดับถอย IR → ถอย IF → Cut Short แล้ว TO line ปิดครบและ TO เป็น Closed
- [ ] Post BL หลังขั้นตอนข้างบนออก IF = Invoice = 6 ตู้
- [ ] ทดสอบบน SB1 ครบก่อนขึ้น Production

## สิ่งที่ยังไม่ยืนยัน

- ใครหรือ script ไหนถอย IR/IF (System Notes ระบุ user 8770 `thidarat_b`, context SLT) ไม่พบ log ของ CFR Cancel IF/IR ที่อ้าง TO เหล่านี้
- เงื่อนไขจริงของ Saved Search 6300 บน Prod (ใช้ตามที่ `KNOWN-ISSUES.md` จด) และ `customsearch_ss_auto_if_fromtorecived_ex` ยังไม่ได้เปิดดู
- การปิด TO line แล้ว TO เป็น Closed อัตโนมัติ — อ่านจากโค้ด ยังไม่เห็นผลจริงบน Prod
- หน้า Cut Short ยังแสดงแถว Plan Load ที่ inactive อยู่หรือไม่ (ถ้าไม่ จะกดซ้ำกับ 4 ตู้นี้ไม่ได้ ต้องปิด TO line เอง)
- Wave ควรเป็นอย่างไรหลังของกลับโรงงาน (ตอนนี้ active และ Qty Shipped เต็ม)
- เคสตัด Short บางส่วนใน Phase B (ไม่ใช่ทั้งตู้) ยังไม่ได้ออกแบบ
- ยังไม่ได้เทียบ Post BL Lib บน Prod ซ้ำ (doc ระบุ hash ตรง repo ตอน deploy 2026-10-28)
