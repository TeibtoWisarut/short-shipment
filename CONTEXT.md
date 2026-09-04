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
Custom record (`customrecord_exp_item_information_pl`) ระดับ container ที่แตกออกมาจาก SA line หนึ่งรายการ — 1 แถว Plan Load = 1 container
_Avoid_: PL, Item Info

**TO (Transfer Order)**:
เอกสารโอนสินค้าที่สร้างจาก Plan Load — **1 container = 1 TO เสมอ** (ความสัมพันธ์ 1:1)

**Wave**:
Custom record (`customrecord_twms_wave_item`, เรียกในโค้ดว่า "Wave Line") ของระบบ WMS ที่ผูกกับ TO หนึ่งใบ — **1 container = 1 Wave เสมอ** (ความสัมพันธ์ 1:1 กับทั้ง container และ TO)

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
1 ตู้ container = 1 TO = 1 Wave เสมอ (ความสัมพันธ์ตายตัว ไม่มี TO/Wave ไหนครอบคลุมหลายตู้ หรือตู้เดียวกระจายหลาย TO/Wave)

**Qty Confirm** (`custrecord_item_info_qty_confirm` บน Plan Load):
ปริมาณ "ตามแผน" (order intent) — stamp มาตั้งแต่ PI → SA → Plan Load ตอนสร้าง Plan Load เลย ไม่เกี่ยวข้องกับ Wave หรือการสแกนใดๆ ทั้งสิ้น

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

**Short granularity**:
หน่วยเล็กที่สุดของ Short คือระดับ **Container** (1 ตู้) แบ่งเป็น **Qty-level** (โหลดได้บางส่วน) กับ **Container-level** (โหลดไม่ได้เลย = 0) — **Line Item-level ไม่ใช่กลไกแยก** แต่เป็นผลรวม (rollup) ของหลาย Container ภายใต้ SA item line เดียวกันที่ short พร้อมกัน ไม่ว่าจะบางส่วนหรือทั้งหมดของ container เหล่านั้น
