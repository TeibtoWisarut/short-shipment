# Short Shipment — Context Glossary

โดเมนของ "Update Qty Cut Short" — เครื่องมือปรับปรุงจำนวนสินค้าที่ขาดส่ง (short shipment) บน Shipping Advice และเอกสารที่เกี่ยวข้องในสาย Export/Transfer

## Language

**PI (Proforma Invoice)**:
Sales Order ต้นทางของสาย Export (`custbody_is_shippingadvice = 'F'`) — จุดเริ่มต้นของ process chain
_Avoid_: SO ต้นทาง

**SA (Shipping Advice)**:
Sales Order ที่เป็นใบ Shipping Advice (`custbody_is_shippingadvice = 'T'`) — บันทึกเป็น record type `salesorder`
_Avoid_: Shipping Order

**Plan Load**:
การวางแผนบรรจุของทั้งหมดของ 1 SA — **1 SA = 1 Plan Load เสมอ** (concept level ไม่ใช่ record เดี่ยว)

**Plan Load Line Item Detail** (`customrecord_exp_item_information_pl`, เรียกในโค้ดว่า "Plan Load" หรือ "PL"):
Detail record ที่ Plan Load แตกออกมาตาม **(SA item-line × container)** — 1 แถว = 1 คู่ item-กับ-container หนึ่งคู่เท่านั้น **ไม่ใช่ 1 container** — เพราะ **1 container มีได้หลาย item พร้อมกัน** (จึงมีหลาย Detail row ที่ container เดียวกันได้ ถ้ามีหลาย item ในตู้นั้น) และ 1 item ก็กระจายไปหลาย container ได้เช่นกัน (จึงมีหลาย Detail row ของ item เดียวกันคนละ container ได้)
_Avoid_: PL, Item Info

**TO (Transfer Order)**:
เอกสารโอนสินค้า — **1 container = 1 TO เสมอ** (1:1) — แต่ 1 TO มีได้**หลาย line** (1 line ต่อ 1 item ที่อยู่ในตู้นั้น) แต่ละ line ผูกกับ Plan Load Line Item Detail 1 แถว ผ่าน `custcol_to_plan_load_line`

**Wave**:
Custom record (`customrecord_twms_wave_item`, เรียกในโค้ดว่า "Wave Line" หรือ "Wave Item") ของระบบ WMS — **1 container = 1 Wave เสมอ** (1:1 กับทั้ง container และ TO) เช่นเดียวกับ TO, 1 Wave มีได้หลาย Wave Item record (1 ต่อ 1 item ในตู้นั้น)

**Scan Packed**:
ขั้นตอนยืนยันการแพ็คของในคลังผ่านการสแกน — เกิดหลัง Wave ถูกสร้าง และก่อน Gen IF

**Scan Shipped**:
ขั้นตอนยืนยันการขนของขึ้นพาหนะผ่านการสแกน — เกิดหลัง Scan Packed และก่อน Gen IF

**Gen IF (Generate Item Fulfillment)**:
ขั้นตอนสุดท้ายของ process chain ที่สร้าง Item Fulfillment จาก Wave — เกิดหลัง Scan Shipped

**Process Chain (ลำดับเต็ม)**:
PI → SA → Plan Load → TO → Wave → Wave (Scan Packed) → Wave (Scan Shipped) → Gen IF
_ที่มา: ยืนยันโดยผู้ใช้ 2026-09-04 — เป็นลำดับบังคับของสาย Export/Transfer container หนึ่งใบ_

**Container invariant**:
1 ตู้ container = 1 TO = 1 Wave เสมอ (ความสัมพันธ์ตายตัว ไม่มี TO/Wave ไหนครอบคลุมหลายตู้ หรือตู้เดียวกระจายหลาย TO/Wave) **แต่ 1 ตู้มีได้หลาย item พร้อมกัน** — ดังนั้น TO/Wave 1 ใบ มีได้หลาย line/detail record ข้างใน (1 ต่อ 1 item)

**Qty Confirm** (`custrecord_item_info_qty_confirm` บน Plan Load):
ปริมาณ "ตามแผน" (order intent) — stamp มาตั้งแต่ PI → SA → Plan Load ตอนสร้าง Plan Load เลย เดิมไม่เกี่ยวข้องกับ Wave หรือการสแกนใดๆ เลย

**อัปเดต 2026-09-07 (issue #1)**: เคส **Qty-level** เท่านั้น `Script - SL Update Qty Cut Short.js` จะเขียนทับ field นี้ด้วย `effectiveQty` (Phase A = Wave Quantity, Phase B = Qty Shipped) หลังจากนี้ field นี้จึงไม่ใช่ยอดแผนดั้งเดิมที่คงที่ตลอดไปอีกต่อไปสำหรับแถวที่เคยถูก Qty-level short — ยอดแผนดั้งเดิมจริงต้องไปดูที่ `custrecord_item_info_short_qty_old` แทน (ดู "Qty Old preservation fields" ด้านล่าง) **ความเสี่ยงที่ยอมรับแล้ว**: flow Cancel Wave + Confirm ใหม่ (Wave regeneration) ที่เคยใช้ field นี้เป็นต้นทาง จะได้ยอดที่ short ไปแล้วแทนยอดแผนเดิม หากมีคน regenerate wave หลังจากแถวนั้นถูก Qty-level short ไปแล้ว — Line-level/Container-level (ค่า=0) ไม่ถูกแตะ ยังคงพฤติกรรมเดิม

**Wave Quantity** (`custrecord_twms_wavei_wavequantity` บน Wave):
ปริมาณเป้าหมายที่ใช้อ้างอิงตอน Scan Packed / Scan Shipped — ถูก copy ค่ามาจาก Qty Confirm ของ Plan Load ตอน Wave ถูก auto-generate (trigger จากการกด "Confirm" บน Plan Load ซึ่งสร้าง TO + Wave พร้อมกัน)
_Avoid_: Wave Qty

**Qty Shipped** (`custrecord_twms_wavei_qtyshipped` บน Wave):
ปริมาณที่ Ship จริง — เป็น field เดียวในทั้งระบบที่สะท้อน "ความจริง" ของยอดที่โหลดขึ้นตู้ แต่**ว่างเปล่าจนกว่าจะผ่าน Scan Shipped แล้วเกิด Item Fulfillment** ถึงจะถูก sync ค่าเข้ามา

**Phase A (Pre-IF)**:
ช่วงเวลาตั้งแต่ TO/Wave ถูกสร้าง จนถึงก่อน Gen IF (รถยังไม่ออกจากโรงงาน) — Qty Confirm (Plan Load) เป็นยอดตามแผนดั้งเดิม **ไม่เคยถูกอัปเดต**; Wave Quantity ต่างหากที่เป็นยอดที่ต้องอ้างอิงในช่วงนี้ เพราะกระบวนการปัจจุบัน (นอกเครื่องมือนี้) คือ Warehouse เข้าไปแก้ **Wave Quantity + TO quantity โดยตรง** ทันทีที่รู้ว่าจะ short (ก่อนโหลดของจริง) — ดังนั้น ณ เวลาที่เปิดเครื่องมือนี้ Wave Quantity ควรถือเป็นยอดที่ถูกต้องแล้ว (ถ้า Warehouse ทำตามกระบวนการ) เครื่องมือนี้มีหน้าที่แค่**อ่าน Wave Quantity ให้ถูกต้องแล้ว cascade ลง SA** ไม่ใช่จุดกรอกยอดจริงเอง

**Phase B (Post-IF)**:
ช่วงเวลาหลังรถออกจากโรงงานแล้ว — ถือว่า IF เกิดขึ้นแล้วเสมอ (ตามกฎธุรกิจ "Load ได้ + รถออกแล้ว = ต้องเกิด IF") ยอด short ที่เกิดทีหลัง (เช่น ไปไม่ทันเรือ) ต้องปรับที่ SA ให้ตรงกับที่ส่งจริง เพื่อยื่นศุลกากรไม่ให้โดนค่าปรับ — เป็นเคสที่เครื่องมือนี้ (`Script - SL Update Qty Cut Short.js`) รองรับถูกต้องอยู่แล้วโดยใช้ Qty Shipped

**Gram Swing**:
ปรากฏการณ์เฉพาะสินค้าม้วนกระดาษ (paper roll) — น้ำหนักจริงหลังผลิตเสร็จไม่ตรงกับน้ำหนักตาม UOM ที่ระบุไว้ตอนเปิด PI/SA (ซึ่งมักเปิดจำนวน/น้ำหนักไว้เผื่อสูงกว่าจริงเสมอ) ทำให้สินค้ากลุ่มนี้เกิด **Phase A Short แทบทุกครั้งเป็นเรื่องปกติของสายธุรกิจ ไม่ใช่อุบัติเหตุ** — Container เดียวกันอาจถูก Short ซ้ำได้อีกรอบใน Phase B ทีหลัง ถ้าเกิดอุบัติเหตุหลังรถออกจากโรงงาน (Phase A กับ Phase B **ไม่ exclusive กัน** เกิดต่อเนื่องกับ container เดียวกันได้)

**Short granularity** (แก้ไข 2026-09-05 — เดิมเข้าใจผิดว่า Container คือหน่วยเล็กสุด):
หน่วยเล็กที่สุดจริงๆ คือ **Plan Load Line Item Detail 1 แถว** (= 1 คู่ item×container) แบ่งเป็น 3 ระดับ:
- **Qty-level**: ลดจำนวนบางส่วนใน 1 Detail row (1 item ของ 1 ตู้) ไม่ถึง 0
- **Line-level** ("Short Line"): 1 Detail row (1 item ของ 1 ตู้) ถูกลดเป็น **0 ทั้งหมด** — กระทบแค่ item นั้นใน container นั้น item อื่นในตู้เดียวกันไม่กระทบ
- **Container-level**: **ทุก** Detail row ที่แชร์ container เดียวกัน (ทุก item ในตู้นั้น) ถูกลดเป็น 0 พร้อมกันทั้งหมด — คือ Line-level ที่เกิดกับทุก item ของตู้นั้นพร้อมกัน

**Heavy Container** (`customrecord_heavy_container`):
Record แยกต่างหาก 1 แถวต่อ 1 container (ไม่ใช่ต่อ item เหมือน Plan Load Item Detail) — เก็บรายละเอียดของตัวตู้เอง match กับ container index ผ่าน `custrecord_hc_container_index` ใช้แสดงผลใน Print Form Container List — ต้องตั้ง `isinactive=true` เมื่อตู้นั้นถูก Short-ทั้งตู้ (ไม่แตะตอน Line-level ที่ตู้ยังส่งจริง)

**Qty Old preservation fields** (เขียนครั้งแรกที่ short เกิดขึ้นเท่านั้น ไม่เขียนทับซ้ำ):
- SA line: `custcol_shortshipment_qty_old`
- TO line: **field เดียวกัน** `custcol_shortshipment_qty_old` (custom column ใช้ร่วมหลาย transaction type)
- Plan Load Item Detail: `custrecord_item_info_short_qty_old` (field ใหม่ กำลังสร้าง 2026-09-05)

**SA Item-line rollup**: ไม่ใช่กลไกแยก แต่เป็นมุมมองสรุป — 1 SA item-line (1 item) อาจกระจายไปหลาย container ผ่านหลาย Detail row; ยอดที่โชว์บน SA line คือผลรวมของ Detail row ทั้งหมดของ item นั้นข้ามทุก container (แต่ละแถวจะเป็น Qty/Line/Container-level อะไรก็ได้ผสมกันได้)
