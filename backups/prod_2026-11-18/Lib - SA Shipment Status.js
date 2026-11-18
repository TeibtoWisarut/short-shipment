/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

/**
 * @summary SA Load Status (Draft / Short / Final) บน SA — Transfer Completeness Rule v3
 *
 * 2 ฟังก์ชันแยกกันโดยตั้งใจ (Asymmetric Dual Function — ดู CONTEXT.md):
 *   - checkSATransferComplete(saId) : เรียกจาก MR Auto Create IR Transfer หลัง IR save — คำนวณ 3 ทาง
 *   - forceStampFinal(saId)         : เรียกจาก SL Update Qty Cut Short หลังตัด Short — เขียน Final ตรง ๆ
 *
 * กฎต่อ 1 แถว Plan Load Item Detail (active) เทียบ IR ที่รับจริง กับ custrecord_twms_wavei_orderquantity:
 *   ไม่มี IR = รอ (Draft) · IR >= orderquantity = ครบ · IR < orderquantity = Short
 * กฎรวม SA: มีแถว Short → Short · ครบทุกแถว → Final · นอกนั้น → Draft
 *
 * ข้อยกเว้น (v2): แถวที่ item อยู่ใน Item Sub-Group ของสินค้าโหลดตามน้ำหนักจริง (Order เปิดยอดเผื่อตาม
 * Standard Conversion, MR ลด qty ใน TO ตาม IF) + มี IR แล้ว = Short เสมอ ไม่เทียบกับ orderquantity
 * เพราะต้องไปทำ Function Short ต่อทุกครั้ง · รายชื่อ sub-group อ่านจาก filter ของ saved search
 * customsearch_ss_auto_irfromto_partial (ไม่ hardcode) · ยังไม่มี IR = รอ (Draft) เหมือนเดิม
 *
 * @version 2
 *
 * @changes 1 Create Script
 * @changes 2 แถวใน sub-group ของ saved search partial + มี IR = Short เสมอ
 */

define(['N/query', 'N/record', 'N/search'],
	(query, record, search) => {

		const SA_RECORD_TYPE = 'salesorder'; // ห้ามใช้ record.Type ตอน define — NetSuite ปฏิเสธ upload (SUITESCRIPT_API_UNAVAILABLE_IN_DEFINE, 2026-10-17)
		const FIELD_STATUS = 'custbody_sa_load_status';
		const FIELD_FORCED = 'custbody_sa_load_status_forced';
		const STATUS_LIST = 'customlist_sa_load_status';
		const PARTIAL_SEARCH_ID = 'customsearch_ss_auto_irfromto_partial';
		const SUBGROUP_FILTER_RE = /cseg_item_sub_group/i;

		const STATUS = {
			DRAFT: 'val_sa_load_draft',
			SHORT: 'val_sa_load_short',
			FINAL: 'val_sa_load_final',
		};

		// IR quantity ใน transactionline เป็นหน่วยฐาน (เช่น KG) ส่วน orderquantity เป็นหน่วยของ transaction
		// (เช่น MT) — หารด้วย conversionrate ของ unit บน IR line ก่อนเทียบ (verify บน Prod 2026-09-24)
		const SQL_SA_ROWS = `
			SELECT pl.id AS pl_id,
			       w.custrecord_twms_wavei_orderquantity AS order_qty,
			       ir.ir_qty,
			       pl.custrecord_item_info_item_code AS item_id
			FROM customrecord_exp_item_information_pl pl
			LEFT JOIN customrecord_twms_wave_item w ON w.id = pl.custrecord_item_info_wave_line
			LEFT JOIN (
				SELECT tl.custcol_to_plan_load_line AS pl_id,
				       SUM(tl.quantity / NVL(u.conversionrate, 1)) AS ir_qty
				FROM transactionline tl
				JOIN transaction t ON t.id = tl.transaction
				LEFT JOIN unitstypeuom u ON u.internalid = tl.units
				WHERE t.type = 'ItemRcpt'
				  AND t.voided = 'F'
				  AND tl.mainline = 'F'
				  AND tl.custcol_to_plan_load_line IN (
					SELECT p2.id FROM customrecord_exp_item_information_pl p2
					WHERE p2.custrecord_item_info_sa_no_ex = ?
				  )
				GROUP BY tl.custcol_to_plan_load_line
			) ir ON ir.pl_id = pl.id
			WHERE pl.custrecord_item_info_sa_no_ex = ?
			  AND pl.isinactive = 'F'`;

		const SQL_SA_BY_TO = `
			SELECT DISTINCT pl.custrecord_item_info_sa_no_ex AS sa_id
			FROM transactionline tl
			JOIN customrecord_exp_item_information_pl pl ON pl.id = tl.custcol_to_plan_load_line
			WHERE tl.transaction = ?
			  AND pl.custrecord_item_info_sa_no_ex IS NOT NULL`;

		// เทียบที่ 3 ตำแหน่งเหมือน computeLoadStatus ใน SL Update Qty Cut Short
		const roundQty = (v) => Math.round((Number(v) || 0) * 1000) / 1000;

		let statusIdCache = null;

		/**
		 * internal id ของค่าใน customlist_sa_load_status ตาม scriptid (internal id ต่างกันแต่ละ account)
		 * SuiteQL คืน scriptid เป็นตัวพิมพ์ใหญ่ จึงเทียบแบบ lowercase
		 */
		const getStatusId = (statusKey) => {
			if (!statusIdCache) {
				statusIdCache = {};
				query.runSuiteQL({query: `SELECT id, scriptid FROM ${STATUS_LIST}`}).asMappedResults().forEach((r) => {
					statusIdCache[String(r.scriptid).toLowerCase()] = String(r.id);
				});
			}
			const id = statusIdCache[statusKey];
			if (!id) throw new Error(`${STATUS_LIST} ไม่มีค่า ${statusKey}`);
			return id;
		};

		let partialSubgroupCache = null;

		// หา id ของ Item Sub-Group ที่ filter ของ saved search partial เลือกไว้ (flatten filterExpression)
		const collectSubgroupIds = (expr, out) => {
			if (!Array.isArray(expr)) return;
			if (typeof expr[0] === 'string' && SUBGROUP_FILTER_RE.test(expr[0])) {
				const vals = expr.slice(2);
				vals.forEach((v) => {
					(Array.isArray(v) ? v : [v]).forEach((x) => out.push(String(x)));
				});
				return;
			}
			expr.forEach((e) => collectSubgroupIds(e, out));
		};

		/**
		 * Item Sub-Group ของสินค้าโหลดตามน้ำหนักจริง — อ่านจาก saved search customsearch_ss_auto_irfromto_partial
		 * อ่านไม่ได้หรือไม่เจอ filter = throw (ไม่ fallback เป็นค่า hardcode)
		 * @returns {Object<string, boolean>}
		 */
		const getPartialSubgroupIds = () => {
			if (!partialSubgroupCache) {
				const ids = [];
				collectSubgroupIds(search.load({id: PARTIAL_SEARCH_ID}).filterExpression, ids);
				if (ids.length === 0) throw new Error(`${PARTIAL_SEARCH_ID} ไม่มี filter Item Sub-Group`);
				partialSubgroupCache = {};
				ids.forEach((id) => { partialSubgroupCache[id] = true; });
			}
			return partialSubgroupCache;
		};

		/**
		 * Item Sub-Group (custom segment) ของ item ตาม id
		 * @returns {Object<string, string>} {itemId: subgroupId}
		 */
		const getItemSubgroups = (itemIds) => {
			const map = {};
			const ids = itemIds.filter((x, i, a) => x !== null && x !== undefined && a.indexOf(x) === i).map(String);
			if (ids.length === 0) return map;
			search.create({
				type: search.Type.ITEM,
				filters: [['internalid', 'anyof', ids]],
				columns: ['cseg_item_sub_group'],
			}).run().each((r) => {
				map[String(r.id)] = String(r.getValue('cseg_item_sub_group') || '');
				return true;
			});
			return map;
		};

		/**
		 * @returns {{status: string, rows: number, short: number, complete: number, waiting: number, partial: number}}
		 */
		const computeSAStatus = (saId) => {
			const rows = query.runSuiteQL({query: SQL_SA_ROWS, params: [saId, saId]}).asMappedResults();
			let short = 0, complete = 0, waiting = 0, partial = 0;
			const partialSubgroups = getPartialSubgroupIds();
			const itemSubgroups = getItemSubgroups(rows.map((r) => r.item_id));

			rows.forEach((r) => {
				if (r.ir_qty === null) {
					// ยังไม่มี IR = ยังรอ
					waiting++;
				} else if (partialSubgroups[itemSubgroups[String(r.item_id)]]) {
					// โหลดตามน้ำหนักจริง + มี IR แล้ว = Short เสมอ (ไม่เทียบ orderquantity)
					short++;
					partial++;
				} else if (r.order_qty === null) {
					waiting++;
				} else if (roundQty(r.ir_qty) < roundQty(r.order_qty)) {
					short++;
				} else {
					complete++;
				}
			});

			let status = STATUS.DRAFT;
			if (short > 0) status = STATUS.SHORT;
			else if (rows.length > 0 && complete === rows.length) status = STATUS.FINAL;

			return {status, rows: rows.length, short, complete, waiting, partial};
		};

		const withRetryOnCollision = (fn) => {
			for (let attempt = 1; ; attempt++) {
				try {
					return fn();
				} catch (e) {
					if (e && e.name === 'RCRD_HAS_BEEN_CHANGED' && attempt < 3) continue;
					throw e;
				}
			}
		};

		const readSA = (saId) => {
			const v = search.lookupFields({type: SA_RECORD_TYPE, id: saId, columns: [FIELD_STATUS, FIELD_FORCED]});
			const status = v[FIELD_STATUS];
			return {
				statusId: (Array.isArray(status) && status.length > 0) ? String(status[0].value) : '',
				forced: v[FIELD_FORCED] === true || v[FIELD_FORCED] === 'T',
			};
		};

		const writeSA = (saId, values) => {
			withRetryOnCollision(() => record.submitFields({
				type: SA_RECORD_TYPE,
				id: saId,
				values: values,
				options: {enableSourcing: false, ignoreMandatoryFields: true},
			}));
		};

		/**
		 * คำนวณและ stamp Draft / Short / Final — ไม่ทำอะไรถ้า SA ถูก forceStampFinal ไปแล้ว
		 * @returns {object} ผลสำหรับ log
		 */
		const checkSATransferComplete = (saId) => {
			if (!saId) return {skipped: 'no saId'};

			const current = readSA(saId);
			// ด่านแรก: Final จากการตัด Short เป็นการยืนยันเด็ดขาด ห้าม recompute ทับ
			if (current.forced) return {saId, skipped: 'forced'};

			const result = computeSAStatus(saId);
			const newId = getStatusId(result.status);
			result.saId = saId;
			result.changed = current.statusId !== newId;

			if (result.changed) {
				const values = {};
				values[FIELD_STATUS] = newId;
				writeSA(saId, values);
			}
			return result;
		};

		/**
		 * ตัด Short สำเร็จ = Final ทั้ง SA ทันที ไม่เทียบ IR และล็อกไม่ให้ checkSATransferComplete เขียนทับ
		 */
		const forceStampFinal = (saId) => {
			if (!saId) return {skipped: 'no saId'};

			const finalId = getStatusId(STATUS.FINAL);
			const current = readSA(saId);
			if (current.forced && current.statusId === finalId) return {saId, skipped: 'already forced'};

			const values = {};
			values[FIELD_STATUS] = finalId;
			values[FIELD_FORCED] = true;
			writeSA(saId, values);
			return {saId, status: STATUS.FINAL, forced: true};
		};

		/**
		 * SA ทั้งหมดที่ TO นี้โหลดให้ (ผ่าน custcol_to_plan_load_line → Plan Load Item Detail)
		 * @returns {string[]}
		 */
		const findSAIdsByTransferOrder = (toId) => {
			if (!toId) return [];
			return query.runSuiteQL({query: SQL_SA_BY_TO, params: [toId]}).asMappedResults()
				.map((r) => String(r.sa_id));
		};

		return {
			STATUS,
			computeSAStatus,
			checkSATransferComplete,
			forceStampFinal,
			findSAIdsByTransferOrder,
		};
	});
