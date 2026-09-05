# Plan: Redesign "Update Qty Cut Short"

สรุปทั้งหมดจาก grilling session (2026-09-04 ถึง 2026-09-06) — ก่อนแก้โค้ดจริงต้อง confirm เอกสารนี้ก่อน
ศัพท์/โมเดลโดเมนอ้างอิงจาก [`CONTEXT.md`](../CONTEXT.md) — อ่านคู่กันเสมอ

## 1. ปัญหา (Root Cause)

`Script - SL Update Qty Cut Short.js` อ่านค่า "Qty Shipped" ผิด field เมื่อ container ยังไม่ผ่าน Gen IF
("Phase A"): fallback ไปที่ `custrecord_item_info_qty_confirm` (ยอดแผนดั้งเดิม ไม่เคยอัปเดต) แทนที่จะเป็น
`custrecord_twms_wavei_wavequantity` (ยอดที่ Warehouse แก้ไว้แล้วจริงผ่านกระบวนการภายนอกเครื่องมือนี้)
ทำให้ "Short ทั้งตู้" หรือ "Gram Swing" (ปกติของสินค้าม้วนกระดาษ) แสดงผลเหมือนส่งครบ ทั้งที่จริง short ไปแล้ว

นอกจากนี้พบบั๊ก/ช่องโหว่เพิ่มเติมระหว่างการไล่ทวน: checkbox "Short whole container" ไม่เคย propagate ไปที่
TO/SA จริง, field `qty_confirm` บน Plan Load ถูกเขียนทับทุกครั้ง (ทำลาย audit trail), และ `save_sa_body`
ไม่ได้คำนวณยอดจากผลลัพธ์จริงของแต่ละ AJAX call (partial-failure inconsistency)

## 2. โมเดลโดเมนที่แก้ไข (สรุปจาก CONTEXT.md)

- **1 SA = 1 Plan Load** (concept) ซึ่งแตกเป็น **Plan Load Item Detail** หลายแถว — 1 แถว = 1 คู่ (item × container)
- **1 container = 1 TO = 1 Wave เสมอ** แต่ **1 container มีได้หลาย item** → TO/Wave 1 ใบมีหลาย line/detail (1 ต่อ item)
- Short มี 3 ระดับจริง (ไม่ใช่ 2 อย่างที่เข้าใจตอนแรก):
  - **Qty-level**: ลดบางส่วนใน 1 Detail row เดียว ไม่ถึง 0
  - **Line-level**: 1 Detail row = 0 ทั้งหมด แต่ item อื่นในตู้เดียวกันยังส่งได้ปกติ
  - **Container-level**: ทุก Detail row ที่ container เดียวกัน = 0 พร้อมกันหมด (= Line-level ที่เกิดกับทุก item ในตู้)
- **Phase A** (ก่อน Gen IF) กับ **Phase B** (หลัง Gen IF) — ไม่ exclusive กัน (container เดียวถูก short ได้ทั้ง 2 phase คนละรอบ เช่น Gram Swing ตามด้วยอุบัติเหตุขนส่ง)

## 3. Fix ส่วนที่ 1 — Read-side (แก้แหล่งข้อมูล Qty Shipped)

1. เปลี่ยน fallback chain: `qtyshipped ?? qty_confirm` → **`qtyshipped ?? wavequantity`**
2. **หยุดเขียนทับ** `custrecord_item_info_qty_confirm` บน Plan Load Item Detail ใน `process_pl` (ปัจจุบันเขียนทุกครั้ง) — field นี้ต้องคงยอดแผนดั้งเดิมตลอดไป เพราะ Wave/TO ใช้ field นี้เป็นต้นทางตอน Regenerate (Cancel Wave + Confirm ใหม่)
3. แยกคอลัมน์ Level-3 (Plan/Load row) จาก "Qty Shipped" 1 คอลัมน์ → **2 คอลัมน์**: **"Wave Qty"** (ดิบจาก `wavequantity`) + **"Qty Shipped (IF)"** (ดิบจาก `qtyshipped`, ว่าง = ยังไม่ Gen IF) — คอลัมน์ว่าง/ไม่ว่างทำหน้าที่บอก Phase A/B โดยอัตโนมัติ ไม่ต้องเพิ่ม badge แยก
4. เพิ่ม **soft warning** (ไม่ block) เมื่อ Reason ที่เลือกไม่ตรงกับ Phase ที่ตรวจพบของ container นั้น — เช็ค **live ทันทีที่เปลี่ยน Reason dropdown** (client-side, ใช้ mapping table เล็กๆ ด้านล่าง)

### Reason ↔ Phase mapping (จาก `customrecord_short_shipment_reason`, ไม่ผูกกับระดับ Qty/Line/Container ตายตัว)

| # | Reason | Phase ที่เข้ากันได้ |
|---|---|---|
| 1 | Order Roll, Pulp, Consume ตัด Short ตามน้ำหนักชั่งจริง | A (Gram Swing) |
| 2 | หาสินค้าไม่เจอ ไม่มีสินค้ามาทดแทน | A |
| 3 | สินค้าเกิด Damage ระหว่าง Load สินค้า | A |
| 4 | ผลิตไม่ทัน, Load ไม่ทัน | A |
| 5-9 | (เหตุขนส่งหลังปล่อยตู้ทั้งหมด) | B |

## 4. Fix ส่วนที่ 2 — Write-side (ตาม 3 ระดับ × 2 Phase)

Checkbox "Short whole container" **ไม่มีผลต่อการคำนวณค่าเลย** เป็นแค่ตัวบอก scope (ตู้เดียว vs ทุก item ในตู้)
กลไกจริงคือ: ค่าที่คำนวณได้สำหรับ 1 Detail row = 0 หรือไม่ = 0 เป็นตัวตัดสินว่าเข้า branch ไหน

### Qty-level (ค่า ≠ 0) — ทั้ง Phase A/B เหมือนกัน

| Record | Field | ค่า |
|---|---|---|
| SA line | `quantity`, reason | ปรับเป็นยอดใหม่ |
| SA line | `custcol_shortshipment_qty_old` | stamp ครั้งแรกที่เปลี่ยน (ของเดิมมีอยู่แล้ว) |
| Plan Load Item Detail | reason | เขียน |
| Plan Load Item Detail | `custrecord_item_info_short_qty_old` (**field ใหม่**) | stamp ครั้งแรกที่เปลี่ยน |
| Plan Load Item Detail | `custrecord_item_info_qty_confirm` | **ห้ามเขียนทับเด็ดขาด** |
| Plan Load Item Detail | `isinactive` | ไม่แตะ |
| TO line | `quantity`, reason | ปรับเป็นยอดใหม่ |
| TO line | `custcol_shortshipment_qty_old` | stamp ครั้งแรกที่เปลี่ยน |
| TO line | `isclosed` | ไม่แตะ |
| Heavy Container | — | ไม่แตะ |
| Wave | reason (+ conv/NW/GW ถ้าติ๊ก "Do not Cal Conv" เท่านั้น — ไม่เปลี่ยน logic เดิม) | |
| IF/IR (เฉพาะ Phase B) | reason | เหมือนโค้ดปัจจุบัน ไม่เปลี่ยน |

### Line-level (ค่า = 0, ตู้ยังส่งต่อเพราะมี item อื่น) — ทั้ง Phase A/B

เหมือน Qty-level **บวก**:

| Record | Field | ค่า |
|---|---|---|
| Plan Load Item Detail (แถวนี้แถวเดียว) | `isinactive` | `true` |
| TO line (line นี้เดียว) | `isclosed` | **Phase A**: `true` ถ้ายังไม่ closed / **Phase B**: ไม่แตะเลย (จบ lifecycle ผ่าน IF/IR แล้ว) |
| Heavy Container | — | **ไม่แตะ** (ตู้จริงยังไปอยู่) |

**ไม่มี UI/checkbox แยกสำหรับ Line-level** — เป็นผลลัพธ์อัตโนมัติเมื่อค่าที่คำนวณของ 1 Detail row = 0 โดยไม่ได้ติ๊ก "Short whole container"

### Container-level (ติ๊ก "Short whole container" → ทุก item ในตู้ = 0) — ทั้ง Phase A/B

เหมือน Line-level แต่ **scope ครอบทุก Detail row ที่ container index เดียวกัน** บวก:

| Record | Field | ค่า |
|---|---|---|
| Heavy Container (1 แถว, match `custrecord_hc_container_index`) | `isinactive` | `true` — **set ครั้งเดียวหลังจากทุก item ในตู้สำเร็จหมดแล้วเท่านั้น** (ดูข้อ 5) |

**UI**: ติ๊ก "Short whole container" บนแถวไหน → auto-select + auto-tick checkbox เดียวกันบนทุกแถวที่ Container Index เดียวกัน (ข้ามกิ่ง Item ในต้นไม้ได้) — cascade **ทางเดียว** (ติ๊ก→ติ๊กหมด, ปลด→ปลดแค่แถวเดียว ไม่ cascade ปลด)

## 5. Fix ส่วนที่ 3 — Reliability (`save_sa_body` partial-failure)

**ปัญหาเดิม**: `entriesBySaid` ที่ส่งให้ `save_sa_body` มาจาก payload ตอน Preview (ก่อนยิง AJAX) ไม่ได้ปรับตามผลจริงของแต่ละ `process_pl` — ถ้าบาง container/item fail แต่ SA ก็ยัง save ด้วยยอดที่ "ควรจะเป็น" ไม่ใช่ยอดจริง

**แก้**:
1. **Client-side recompute** — `UI_startProcess` (CS) ต้อง track ผลจริงจาก response ของทุก `process_pl` call แล้ว recompute `totalQtyShippedDisp` จากเฉพาะ container/item ที่ยืนยันสำเร็จ ก่อนเรียก `fireSaveSaBody` (ไม่ใช้ค่าจาก payload เดิมตรงๆ)
2. **Heavy Container timing** — set `isinactive=true` แค่ครั้งเดียว **หลังจากทุก item ในตู้นั้นสำเร็จครบ 100%** เท่านั้น ถ้ามี item ไหน fail ไม่ต้อง set เลย ปล่อยให้ user เห็น error แล้ว run ซ้ำ
3. **Retry-on-collision** — ครอบทั้ง TO-update section และ IF/IR-update section ใน `process_pl` (จุดเดียวที่ใช้ `record.load()+.save()` เต็มรูปแบบ เสี่ยงชนกับคนอื่นแก้พร้อมกัน) ด้วย retry loop:
   - **3 attempts รวม (1 + retry 2 ครั้ง)**
   - **ไม่มี delay ระหว่าง retry** (SuiteScript ไม่มี sleep API ฝั่ง server; busy-wait ถูกปฏิเสธเพราะกิน governance โดยไม่จำเป็น — เวลาจริงของ `record.load()` เองก็เพียงพอเป็นช่องว่างระหว่างครั้ง)
   - Retry เฉพาะเมื่อ `e.name === 'RCRD_HAS_BEEN_CHANGED'` เท่านั้น — error อื่นทั้งหมด throw ทันที ไม่ retry

## 6. Field ใหม่ที่ต้องสร้าง (ผู้ใช้กำลังสร้างเอง)

| Record | Field ID | ชนิด | สถานะ |
|---|---|---|---|
| Plan Load Item Detail (`customrecord_exp_item_information_pl`) | `custrecord_item_info_short_qty_old` | Decimal | กำลังสร้าง |

Field ที่ใช้ร่วมของเดิม (ไม่ต้องสร้างใหม่): `custcol_shortshipment_qty_old` (ใช้ร่วมทั้ง SA line และ TO line), `custrecord_pl_shortshipment_reason`, `custrecord_item_info_short_con`, `custrecord_hc_container_index`, `isclosed` (native TO line field, ต้อง verify ชื่อ exact ตอน implement — ทดสอบใน SB1 ยืนยันแล้วว่าใช้งานได้ผ่าน `nlapiSetCurrentLineItemValue('item','isclosed','T')`)

## 7. สิ่งที่ยืนยันแล้วว่า "ไม่ต้องเปลี่ยน"

- Net/Gross Weight calculation (via "Do not Cal Conv") — เหมือนเดิมทุกประการ ทุกระดับ short
- ไม่มีช่องกรอก Qty ด้วยมือใหม่ — ค่าที่ถูกต้องมาจาก field ที่แก้แล้วโดยอัตโนมัติ
- ไม่มี bulk-import
- ไม่มี audit log แยกแต่ละรอบ short — ดูยอดล่าสุดพอ (container short ซ้ำได้หลายรอบ เช่น Gram Swing ตามด้วยอุบัติเหตุ)
- Reason ↔ Phase ไม่ block กัน — soft warning เท่านั้น
- IF/IR reason-writing logic เดิม — ไม่เปลี่ยน

## 8. จุดที่ต้อง verify ระหว่าง implement (ยังไม่ได้ทดสอบจริง)

- Error code `RCRD_HAS_BEEN_CHANGED` — ต้อง reproduce จริงเพื่อยืนยันชื่อ error code ให้ตรง 100% ก่อน deploy
- Field ID จริงของ "Closed" บน TO line ต้องตรงกับที่ deploy จริง (ทดสอบผ่านแล้วบน SB1 sandbox ด้วย item/location จริงที่มี stock — ดูผลทดสอบใน memory ของ session นี้)
- เมื่อ container-level short เกิด Phase A แล้ว TO ถูก Close — ต้องมั่นใจว่า flow อื่นในระบบ (เช่น Wave scan, MR script อื่นๆ) ไม่ error เมื่อเจอ TO line ที่ closed ก่อนเวลา
