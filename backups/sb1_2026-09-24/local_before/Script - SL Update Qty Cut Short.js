/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */

/**
 * @summary Update Quantity Cut Short
 *
 * @author Varaporn Noisakol <varaporn@teibto.com>
 *
 * @version 1
 *
 * @changes 1 Create Script
 */

var SUITESCRIPT_ID = 'customscript_sl_update_qty_cutshort';
var CLIENTSCRIPT_ID = './Script - SL Update Qty Cut Short (CS).js';
var PAGETITLE = 'Short Order Update';
// SA (Shipping Advice) record type — adjust if SA is a custom transaction instead of salesorder
var SA_RECORD_TYPE = 'salesorder';

var config, format, record, redirect, runtime, search, serverWidget, url, query, libCode;
var MODULE = [];
MODULE.push('N/config');
MODULE.push('N/format');
MODULE.push('N/record');
MODULE.push('N/redirect');
MODULE.push('N/runtime');
MODULE.push('N/search');
MODULE.push('N/ui/serverWidget');
MODULE.push('N/url');
MODULE.push('N/query');
MODULE.push('SuiteScripts/Library/Libraries Code 2.0.220622.js');

var step = null;
var timer = new Date().getTime();

// ----- Display Type List
var DisplayType = {
	NORMAL: {displayType: 'NORMAL'},
	HIDDEN: {displayType: 'HIDDEN'},
	READONLY: {displayType: 'READONLY'},
	DISABLED: {displayType: 'DISABLED'},
	ENTRY: {displayType: 'ENTRY'},
	INLINE: {displayType: 'INLINE'},
};

// Round-half-up to `d` decimals via exponential-notation reparse — NOT the same as
// `value.toFixed(d)`. Binary floating point can't represent most decimals exactly, so a value
// that's mathematically exactly on a rounding boundary (e.g. 9.8235 at 3dp) may already be
// stored as 9.82349999999999923 or 9.82350000000000101 depending on how it was produced
// (literal parse vs. subtraction) — `toFixed` rounds whichever binary value it actually got,
// so the SAME real-world quantity can display as 9.823 or 9.824 depending on arithmetic path.
// Confirmed with the user 2026-09-06: this is common in practice (clean per-unit conversion
// factors like 0.6549/pallet land exactly on a .xxx5 boundary often) and the correct SA value
// is always the true round-half-up result (9.824), not whatever toFixed happens to produce.
function roundHalfUp(value, d) {
	var n = Number(value);
	if (isNaN(n)) return n;
	return Number(Math.round(Number(n + 'e' + d)) + 'e-' + d);
}

// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// ########## Main Suitelet Function
// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@

define(MODULE,
	/**
	 * @param {config} _config
	 * @param {format} _format
	 * @param {record} _record
	 * @param {redirect} _redirect
	 * @param {runtime} _runtime
	 * @param {search} _search
	 * @param {serverWidget} _serverWidget
	 * @param {url} _url
	 * @param {query} _query
	 * @param {libCode_220622} _libCode
	 */
	function (_config, _format, _record, _redirect, _runtime, _search, _serverWidget, _url, _query, _libCode) {
		config = _config;
		format = _format;
		record = _record;
		redirect = _redirect;
		runtime = _runtime;
		search = _search;
		serverWidget = _serverWidget;
		url = _url;
		query = _query;
		libCode = _libCode;

		return {
			onRequest: OnRequest,
		};
	});

/**
 * Definition of the Suitelet script trigger point.
 *
 * @param {Object} context
 * @param {ServerRequest} request context.request - Encapsulation of the incoming request
 * @param {ServerResponse} response context.response - Encapsulation of the Suitelet response
 * @Since 2015.2
 */
function OnRequest(context, request, response) {
	// ==================== Define Default Variable
	request = context.request;
	response = context.response;
	var params = request.parameters;
	var step = params.step || null;
	// ============================================

	if (!step) {

		// ################################################################################################
		// ===== Generate NetSuite Form - Filter
		// ################################################################################################
		var form = serverWidget.createForm({
			title: PAGETITLE + ' - Filter',
			hideNavBar: false,
		});
		if (!!CLIENTSCRIPT_ID) form.clientScriptModulePath = CLIENTSCRIPT_ID;

		form.addFieldGroup({id: 'g_filter', label: 'Filter'});
		// ----- Add Field - Filter
		form.addField({id: 'subsidiary', label: 'Subsidiary', type: 'select', source: 'subsidiary', container: 'g_filter'}).isMandatory = true;
		form.addField({id: 'customer', label: 'Customer', type: 'select', source: 'customer', container: 'g_filter'});
		form.addField({id: 'sa_id', label: 'Shipping Advice # ', type: 'text', source: null, container: 'g_filter'});
		form.addField({id: 'trandate_from', label: 'Date From', type: 'date', source: null, container: 'g_filter'}).updateLayoutType({layoutType: serverWidget.FieldLayoutType.STARTROW});
		form.addField({id: 'trandate_to', label: 'Date To', type: 'date', source: null, container: 'g_filter'}).updateLayoutType({layoutType: serverWidget.FieldLayoutType.ENDROW});
		form.addField({id: 'shipdate_from', label: 'Request ETD Date From', type: 'date', source: null, container: 'g_filter'}).updateLayoutType({layoutType: serverWidget.FieldLayoutType.STARTROW});
		form.addField({id: 'shipdate_to', label: 'Request ETD Date To', type: 'date', source: null, container: 'g_filter'}).updateLayoutType({layoutType: serverWidget.FieldLayoutType.ENDROW});
		form.addField({id: 'ship_to_country', label: 'Ship to Country', type: 'select', source: 'customrecord_cseg_cust_country', container: 'g_filter'});
		form.addField({id: 'domestic_export_filter', label: 'Domestic/Export', type: 'select', source: 'customrecord_cseg_dom_exp', container: 'g_filter'});
		form.addField({id: 'step', label: 'Step', type: serverWidget.FieldType.TEXT}).updateDisplayType(DisplayType.HIDDEN);

		form.addSubmitButton({label: 'Next'});

		form.updateDefaultValues({
			step: 'submitted',

			subsidiary: params.subsidiary || '',
			customer: params.customer || '',
			sa_id: params.sa_id || '',
			trandate_from: params.trandate_from || '',
			trandate_to: params.trandate_to || '',
			shipdate_from: params.shipdate_from || '',
			shipdate_to: params.shipdate_to || '',
			ship_to_country: params.ship_to_country || '',
			domestic_export_filter: params.domestic_export_filter || 2,

		});

		response.writePage(form);

	} else if (step == 'submitted') {

		// ################################################################################################
		// ===== Define Variable
		// ################################################################################################
		var subsidiary = params.subsidiary;
		var customer = params.customer;
		var sa_id = params.sa_id;
		var trandate_from = params.trandate_from;
		var trandate_to = params.trandate_to;
		var shipdate_from = params.shipdate_from;
		var shipdate_to = params.shipdate_to;
		var ship_to_country = params.ship_to_country;
		var domestic_export_filter = params.domestic_export_filter;

		// ################################################################################################
		// ===== Search Data
		// ################################################################################################
		var extraFilters = [];
		if (!!subsidiary) extraFilters.push({name: 'subsidiary', operator: search.Operator.ANYOF, values: subsidiary});
		if (!!customer) extraFilters.push({name: 'entity', operator: search.Operator.ANYOF, values: customer});
		if (!!sa_id) extraFilters.push({name: 'tranid', operator: search.Operator.CONTAINS, values: sa_id});
		if (!!trandate_from) extraFilters.push({name: 'trandate', operator: search.Operator.ONORAFTER, values: trandate_from});
		if (!!trandate_to) extraFilters.push({name: 'trandate', operator: search.Operator.ONORBEFORE, values: trandate_to});
		if (!!shipdate_from) extraFilters.push({name: 'shipdate', operator: search.Operator.ONORAFTER, values: shipdate_from});
		if (!!shipdate_to) extraFilters.push({name: 'shipdate', operator: search.Operator.ONORBEFORE, values: shipdate_to});
		if (!!ship_to_country) extraFilters.push({name: 'custbody_ship_to_country', operator: search.Operator.ANYOF, values: ship_to_country});
		if (!!domestic_export_filter) extraFilters.push({name: 'cseg_dom_exp', operator: search.Operator.ANYOF, values: domestic_export_filter});

		var ss_sa = libCode.loadSavedSearch(null, 'customsearch_ss_sa_short_order', extraFilters, null);
        log.debug('customsearch_ss_sa_short_order', { ss_length: ss_sa.length, ssFilters: extraFilters });

		// ----- Collect SA internal ids → filter line search by SA list
		var saIdList = [];
		if (!!ss_sa && ss_sa.length > 0) {
			for (var i = 0; i < ss_sa.length; i++) {
				var saId_ = ss_sa[i].getValue('internalid');
				if (!!saId_ && saIdList.indexOf(saId_) === -1) saIdList.push(saId_);
			}
		}

		var ss_sa_line = [];
		if (saIdList.length > 0) {
			ss_sa_line = libCode.loadSavedSearch(null, 'customsearch_ss_sa_short_order_line', [
				{name: 'internalid', operator: search.Operator.ANYOF, values: saIdList},
			], null);

            log.debug('customsearch_ss_sa_short_order_line', { ss_length: ss_sa_line.length, ssFilters: saIdList });

		}

		// ----- Group line results by SA internal id
		var lineMap = {};
		if (!!ss_sa_line && ss_sa_line.length > 0) {
			for (var j = 0; j < ss_sa_line.length; j++) {
				var saIdLine = ss_sa_line[j].getValue('internalid');
				if (!saIdLine) continue;
				if (!lineMap[saIdLine]) lineMap[saIdLine] = [];
				lineMap[saIdLine].push(ss_sa_line[j]);
			}
		}

		// ----- Load Plan/Load search filtered by SA list (3rd level)
		var ss_pl = [];
		if (saIdList.length > 0) {
			ss_pl = libCode.loadSavedSearch(null, 'customsearch_ss_pl_short_order_line', [
				{name: 'custrecord_item_info_sa_no_ex', operator: search.Operator.ANYOF, values: saIdList},
				{name: 'isinactive', operator: search.Operator.IS, values: false},
			], null);

            log.debug('customsearch_ss_pl_short_order_line', { ss_length: ss_pl.length, ssFilters: saIdList });

		}

		// ----- Group plan/load results by (saId | saLineId)
		var planLoadMap = {};
		if (!!ss_pl && ss_pl.length > 0) {
			for (var p = 0; p < ss_pl.length; p++) {
				var pSaId = ss_pl[p].getValue('custrecord_item_info_sa_no_ex');
				var pLineId = ss_pl[p].getValue('custrecord_item_info_sa_line_ex');
				if (!pSaId || !pLineId) continue;
				var plKey = pSaId + '|' + pLineId;
				if (!planLoadMap[plKey]) planLoadMap[plKey] = [];
				planLoadMap[plKey].push(ss_pl[p]);
			}
		}

		// ----- Lookup IF conv values via TO sublist + applyingTransaction join
		//        Pattern: search TO line where custcol_to_plan_load_line is set + join to IF lines
		//                 (Item Fulfillment that "applies to" the TO line)
		//        Map key: Plan Load Detail = PL record id (custcol_to_plan_load_line value)
		//        If same Plan Load Detail has multiple matching IF lines → SUM the conv values
		var ifConvByPlId = {};  // {plId: {pal: sum, roll: sum, netWeight: sum, grossWeight: sum}}
		var plIdList = [];
		if (!!ss_pl && ss_pl.length > 0) {
			for (var pIdx = 0; pIdx < ss_pl.length; pIdx++) {
				var _plId = ss_pl[pIdx].id || ss_pl[pIdx].getValue('id') || ss_pl[pIdx].getValue('internalid');
				if (_plId) plIdList.push(_plId);
			}
		}
		if (plIdList.length > 0) {
			try {
                let ssToIfFilters = [
                    { name: 'type', operator: 'anyof', values: 'TrnfrOrd' },
                    { name: 'custcol_to_plan_load_line', operator: 'anyof', values: plIdList },
                    { name: 'type', join: 'applyingtransaction', operator: 'anyof', values: 'ItemShip' },
                ];

				var toIfResults = libCode.loadSavedSearch(
					'transferorder',
					null,
                    ssToIfFilters,
					[
						search.createColumn({name: 'custcol_to_plan_load_line', label: 'Plan Load Detail'}),
						search.createColumn({name: 'custcol_conv_of_unit_pal', join: 'applyingTransaction', label: 'Conv.of Unit (PAL)'}),
						search.createColumn({name: 'custcol_conv_of_unit_roll', join: 'applyingTransaction', label: 'Conv.of Unit (Roll)'}),
						search.createColumn({name: 'custcol_net_weight', join: 'applyingTransaction', label: 'Net Weight'}),
						search.createColumn({name: 'custcol_gross_weight', join: 'applyingTransaction', label: 'Gross Weight'}),
					]
				);

                log.debug('transferorder', { ss_length: toIfResults.length, ssFilters: ssToIfFilters });

				for (var rIdx = 0; rIdx < toIfResults.length; rIdx++) {
					var planLoadDetail = toIfResults[rIdx].getValue('custcol_to_plan_load_line');
					if (!planLoadDetail) continue;

					var palRaw = toIfResults[rIdx].getValue({name: 'custcol_conv_of_unit_pal', join: 'applyingTransaction'});
					var rollRaw = toIfResults[rIdx].getValue({name: 'custcol_conv_of_unit_roll', join: 'applyingTransaction'});
					var nwRaw = toIfResults[rIdx].getValue({name: 'custcol_net_weight', join: 'applyingTransaction'});
					var gwRaw = toIfResults[rIdx].getValue({name: 'custcol_gross_weight', join: 'applyingTransaction'});

					var k = String(planLoadDetail);
					if (!ifConvByPlId[k]) ifConvByPlId[k] = {pal: 0, roll: 0, palHasVal: false, rollHasVal: false, netWeight: 0, grossWeight: 0, netWeightHasVal: false, grossWeightHasVal: false};
					// Only sum when value is non-empty — preserves "empty" state when all IF lines are blank
					if (palRaw != null && String(palRaw).trim() !== '') {
						ifConvByPlId[k].pal += parseFloat(palRaw) || 0;
						ifConvByPlId[k].palHasVal = true;
					}
					if (rollRaw != null && String(rollRaw).trim() !== '') {
						ifConvByPlId[k].roll += parseFloat(rollRaw) || 0;
						ifConvByPlId[k].rollHasVal = true;
					}
					if (nwRaw != null && String(nwRaw).trim() !== '') {
						ifConvByPlId[k].netWeight += parseFloat(nwRaw) || 0;
						ifConvByPlId[k].netWeightHasVal = true;
					}
					if (gwRaw != null && String(gwRaw).trim() !== '') {
						ifConvByPlId[k].grossWeight += parseFloat(gwRaw) || 0;
						ifConvByPlId[k].grossWeightHasVal = true;
					}
				}
				log.debug({
					title: 'TO+IF conv lookup',
					details: 'rows=' + toIfResults.length + ', uniquePlIds=' + Object.keys(ifConvByPlId).length + ', sample=' + JSON.stringify(Object.keys(ifConvByPlId).slice(0, 5)),
				});
			} catch (eIfConv) {
				log.error({title: 'TO+IF conv lookup fail', details: eIfConv.message || String(eIfConv)});
			}
		}

		// ################################################################################################
		// ===== Generate NetSuite Form
		// ################################################################################################
		var form = serverWidget.createForm({
			title: PAGETITLE + ' - Select Data',
			hideNavBar: false,
		});
		if (!!CLIENTSCRIPT_ID) form.clientScriptModulePath = CLIENTSCRIPT_ID;

		form.addField({id: 'step', label: 'step', type: serverWidget.FieldType.TEXT}).updateDisplayType(DisplayType.HIDDEN);
		// Hidden payload (populated by CS SaveRecord) — carries selected items + plan/loads to step='preview'
		form.addField({id: 'submit_payload', label: 'payload', type: serverWidget.FieldType.LONGTEXT}).updateDisplayType(DisplayType.HIDDEN);

		// ----- Filter section (inline display, carry-forward)
		form.addFieldGroup({id: 'g_filter', label: 'Filter'});
		form.addField({id: 'subsidiary', label: 'Subsidiary', type: 'select', source: 'subsidiary', container: 'g_filter'}).updateDisplayType(DisplayType.INLINE);
		form.addField({id: 'customer', label: 'Customer', type: 'select', source: 'customer', container: 'g_filter'}).updateDisplayType(DisplayType.INLINE);
		form.addField({id: 'sa_id', label: 'Shipping Advice # ', type: 'text', source: null, container: 'g_filter'}).updateDisplayType(DisplayType.INLINE);
		form.addField({id: 'trandate_from', label: 'Date From', type: 'date', source: null, container: 'g_filter'}).updateDisplayType(DisplayType.INLINE).updateLayoutType({layoutType: serverWidget.FieldLayoutType.STARTROW});
		form.addField({id: 'trandate_to', label: 'Date To', type: 'date', source: null, container: 'g_filter'}).updateDisplayType(DisplayType.INLINE).updateLayoutType({layoutType: serverWidget.FieldLayoutType.ENDROW});
		form.addField({id: 'shipdate_from', label: 'Request ETD Date From', type: 'date', source: null, container: 'g_filter'}).updateDisplayType(DisplayType.INLINE).updateLayoutType({layoutType: serverWidget.FieldLayoutType.STARTROW});
		form.addField({id: 'shipdate_to', label: 'Request ETD Date To', type: 'date', source: null, container: 'g_filter'}).updateDisplayType(DisplayType.INLINE).updateLayoutType({layoutType: serverWidget.FieldLayoutType.ENDROW});
		form.addField({id: 'ship_to_country', label: 'Ship to Country', type: 'select', source: 'customrecord_cseg_cust_country', container: 'g_filter'}).updateDisplayType(DisplayType.INLINE);
		form.addField({id: 'domestic_export_filter', label: 'Domestic/Export', type: 'select', source: 'customrecord_cseg_dom_exp', container: 'g_filter'}).updateDisplayType(DisplayType.INLINE);

		// ----- Load Reason options
		// Sorted by internalid ASC purely for a stable, predictable dropdown order (matches the
		// Plan doc's numbered list). The CS Reason↔Phase compatibility table keys off each Reason's
		// internalid directly, so this sort is cosmetic only — dropdown order can change freely
		// without affecting that lookup.
		var reasonOptions = [];
		try {
			var rs = search.create({
				type: 'customrecord_short_shipment_reason',
				filters: [['isinactive', 'is', 'F']],
				columns: [
					search.createColumn({name: 'internalid', sort: search.Sort.ASC}),
					search.createColumn({name: 'name'}),
				],
			}).run().getRange({start: 0, end: 1000});
			for (var r = 0; r < rs.length; r++) {
				reasonOptions.push({
					id: rs[r].getValue('internalid'),
					name: rs[r].getValue('name'),
				});
			}
		} catch (e) {
			// ignore — reason dropdown will be empty
		}

		// ----- Helpers
		function escHtml(v) {
			if (v === null || v === undefined) return '';
			return String(v)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;');
		}
		function reasonSelectHtml(cls) {
			var s = `<select class="${cls}"><option value=""></option>`;
			for (var x = 0; x < reasonOptions.length; x++) {
				s += `<option value="${escHtml(reasonOptions[x].id)}">${escHtml(reasonOptions[x].name)}</option>`;
			}
			s += '</select>';
			return s;
		}

		// ----- Build nested-table HTML
		// CSS notes:
		// - .so-wrap: outer scroll container, expands horizontally as data grows
		// - .so-outer,.item-inner,.pl-inner: shared cell rules for consistent grid lines
		//   (white-space:nowrap grows columns to the longest cell)
		// - .so-outer: outer table (SA) — heaviest header
		// - .item-inner: item table (mid-level)
		// - .pl-inner: plan/load table (deepest)
		// - selects/checkboxes: form controls inside cells
		// SA (Level 1) header columns: Sel, PI Document, Document #, Subsidiary, Customer,
		// Date, ETD, Country, Reason, Total Container, Total Container (Text)
		var html = `<style>
.so-wrap{overflow-x:auto;width:100%;padding:4px 0;}
.so-outer,.item-inner,.pl-inner{
	border-collapse:collapse;
	font-family:"Segoe UI","Roboto","Helvetica Neue",Arial,sans-serif;
	font-size:12px;color:#1f2d3d;
}
.so-outer th,.so-outer td,
.item-inner th,.item-inner td,
.pl-inner th,.pl-inner td{
	border:1px solid #b9c5d6;
	padding:5px 8px;vertical-align:middle;
	white-space:nowrap;
}
.so-outer{width:auto;min-width:100%;}
.so-outer thead th{
	background:#1f4e79;color:#fff;font-weight:600;text-align:left;
}
.so-outer tr.sa-row > td{background:#dbe7f5;font-weight:600;}
.so-outer tr.sa-children > td{background:#fff;padding:6px 8px 6px 24px;}
.item-inner{width:auto;min-width:100%;}
.item-inner thead th{
	background:#4f81bd;color:#fff;font-weight:500;text-align:left;
}
.item-inner tr.item-row:nth-child(even) > td{background:#f4f8fc;}
.item-inner tr.item-children > td{background:#fafbfd;padding:5px 8px 5px 20px;}
.pl-inner{width:auto;min-width:100%;}
.pl-inner thead th{
	background:#8db4d9;color:#fff;font-weight:500;text-align:left;
}
.pl-inner tr.pl-row:nth-child(even) > td{background:#f8fafd;}
.so-outer select,.item-inner select,.pl-inner select{
	font-size:12px;padding:2px 4px;max-width:220px;
}
.so-outer input[type=checkbox],
.item-inner input[type=checkbox],
.pl-inner input[type=checkbox]{transform:scale(1.1);cursor:pointer;}
.so-warning{
	color:#c0392b;font-weight:700;font-size:20px;
	background:#fdecea;border:2px solid #c0392b;
	padding:12px 16px;margin:6px 0 12px 0;
	text-align:center;letter-spacing:0.3px;
}
</style>
<div class="so-warning">⚠ กรุณา Print ข้อมูลก่อนทำการ Update</div>
<div class="so-wrap">
<table class="so-outer">
<thead><tr>
<th style="width:24px;">Sel</th>

<th>PI Document</th>

<th>Document #</th>
<th>Subsidiary</th>
<th>Customer</th>

<th>Date</th>
<th>ETD</th>
<th>Country</th>
<th>Reason</th>

<th>Total Container</th>

<th>Total Container (Text)</th>
</tr></thead><tbody>`;

		if (!!ss_sa && ss_sa.length > 0) {
			for (var i = 0; i < ss_sa.length; i++) {
				var saId_o = ss_sa[i].getValue('internalid');
				var tranid = ss_sa[i].getValue('tranid');
				var piDocTxt = ss_sa[i].getText('custbody_ex_ref_pi') || '';
				if (piDocTxt) piDocTxt = String(piDocTxt).replace(/^Sales Order #/, '').trim();
				if (!piDocTxt) piDocTxt = ss_sa[i].getValue('custbody_ex_ref_pi');
				var subsidiaryTxt = ss_sa[i].getText('subsidiary');
				var customerTxt = ss_sa[i].getText('entity');
				var trandateVal = ss_sa[i].getValue('trandate');
				var shipdateVal = ss_sa[i].getValue('shipdate');
				var countryTxt = ss_sa[i].getText('custbody_ship_to_country');

				// Count DISTINCT Container Index across all plan/loads under all items of this SA,
				// AND group those distinct indexes BY Container Size for breakdown text + JSON.
				// SKIP inactive AND short_con pl-rows.
				var containerSet = {};
				var containerBySize = {};  // {sizeText: {idx: true}}
				var saItemsForCount = lineMap[saId_o] || [];
				for (var ci_i = 0; ci_i < saItemsForCount.length; ci_i++) {
					var ci_lineId = saItemsForCount[ci_i].getValue('line');
					var ci_pls = planLoadMap[saId_o + '|' + ci_lineId] || [];
					for (var ci_p = 0; ci_p < ci_pls.length; ci_p++) {
						var ci_inactive = ci_pls[ci_p].getValue('isinactive');
						if (ci_inactive === 'T' || ci_inactive === true || ci_inactive === 'true') continue;
						var ci_short = ci_pls[ci_p].getValue('custrecord_item_info_short_con');
						if (ci_short === 'T' || ci_short === true || ci_short === 'true') continue;
						var ci_val = ci_pls[ci_p].getValue('custrecord_item_info_con_index');
						if (ci_val != null && String(ci_val).trim() !== '') {
							var ci_key = String(ci_val).trim();
							containerSet[ci_key] = true;
							var ci_size = ci_pls[ci_p].getText('custrecord_item_info_con_size') || ci_pls[ci_p].getValue('custrecord_item_info_con_size') || '';
							ci_size = String(ci_size).trim() || '(no size)';
							if (!containerBySize[ci_size]) containerBySize[ci_size] = {};
							containerBySize[ci_size][ci_key] = true;
						}
					}
				}
				var totalContainers = Object.keys(containerSet).length;
				// Build breakdown JSON array + human-readable text
				var breakdownArr = [];
				var breakdownTextParts = [];
				for (var sk in containerBySize) {
					if (!Object.prototype.hasOwnProperty.call(containerBySize, sk)) continue;
					var sk_cnt = Object.keys(containerBySize[sk]).length;
					breakdownArr.push({container_total: String(sk_cnt), container_size: sk});
					breakdownTextParts.push(sk_cnt + ' × ' + sk);
				}
				var breakdownText = breakdownTextParts.join(', ');
				var breakdownJson = JSON.stringify(breakdownArr);

				// ===== LEVEL 1: SA (Shipping Advice) row =====
				html += `<tr class="sa-row" data-said="${escHtml(saId_o)}" data-container-breakdown="${escHtml(breakdownJson)}">
                    <td><input type="checkbox" class="sa-sel" disabled></td>
                    <td>${escHtml(piDocTxt)}</td><td>${escHtml(tranid)}</td>
                    <td>${escHtml(subsidiaryTxt)}</td>
                    <td>${escHtml(customerTxt)}</td>
                    <td>${escHtml(trandateVal)}</td>
                    <td>${escHtml(shipdateVal)}</td>
                    <td>${escHtml(countryTxt)}</td>
                    <td>${reasonSelectHtml('sa-reason')}</td>
                    <td class="sa-total-container">${escHtml(totalContainers)}</td>
                    <td class="sa-total-container-text col-container-breakdown" data-container-breakdown="${escHtml(breakdownJson)}">${escHtml(breakdownText)}</td>
                </tr>`;

				// ===== LEVEL 1 → 2: open Item (mid-level) table, nested under the SA row =====
				// Item (Level 2) header columns: Sel, Item, SA Quantity, Qty Shipped, Unit,
				// Weight of Unit, Standard/Net Weight (KG), Gross Weight [all 3 joined from Item],
				// Reason, Line, (SA ID - hidden)
				html += `<tr class="sa-children">
                <td colspan="11"><table class="item-inner">
                    <thead>
                        <tr>
                        <th style="width:24px;">Sel</th>
                        <th>Item</th>
                        <th>SA Quantity</th>
                        <th>Qty Shipped</th>
                        <th>Unit</th>
                        <th>Weight of Unit</th>
                        <th>Standard/Net Weight (KG)</th>
                        <th>Gross Weight (KG)</th>
                        <th>Reason</th>
                        <th>Line</th>
                        <th class="col-sa-id" style="display:none;">SA ID</th>
                    </tr>
                    </thead>
                <tbody>`;

				var lines = lineMap[saId_o] || [];
				for (var k = 0; k < lines.length; k++) {
					var lineId = lines[k].getValue('line');
					var saLineInternalId = lines[k].getValue('internalid') || lines[k].id;
					var itemTxt = lines[k].getText('item');
					var qtyVal = lines[k].getValue('quantityuom');
					var unitTxt = lines[k].getValue('unit');
					// Item weight fields — joined from the Item record
					var itemWeightOfUnit = lines[k].getText({name: 'custitem_item_weight_of_unit', join: 'item'}) || lines[k].getValue({name: 'custitem_item_weight_of_unit', join: 'item'});
					var itemStdNetWeight = lines[k].getValue({name: 'custitem_infor_std_net_weight', join: 'item'});
					var itemGrossWeight = lines[k].getValue({name: 'custitem_infor_gross_weight', join: 'item'});

					// Plan/Loads for this Item line
					var planLoads = planLoadMap[saId_o + '|' + lineId] || [];

					// Compute Qty Shipped (sum) — use wave Qty Shipped, fallback to Qty Confirm.
					// SKIP inactive AND short_con pl-rows.
					var sumQtyShipped = 0;
					for (var qsPi = 0; qsPi < planLoads.length; qsPi++) {
						var qs_inactive = planLoads[qsPi].getValue('isinactive');
						if (qs_inactive === 'T' || qs_inactive === true || qs_inactive === 'true') continue;
						var qs_short = planLoads[qsPi].getValue('custrecord_item_info_short_con');
						if (qs_short === 'T' || qs_short === true || qs_short === 'true') continue;
						var qsv = planLoads[qsPi].getValue({name: 'custrecord_twms_wavei_qtyshipped', join: 'CUSTRECORD_ITEM_INFO_WAVE_LINE'});
						if (qsv == null || String(qsv).trim() === '') {
							// Fallback to Wave Quantity (Warehouse-corrected, Phase A truth) — NOT Qty Confirm
							// (original plan qty, never updated, was the pre-fix bug source)
							qsv = planLoads[qsPi].getValue({name: 'custrecord_twms_wavei_wavequantity', join: 'CUSTRECORD_ITEM_INFO_WAVE_LINE'});
						}
						sumQtyShipped += (parseFloat(qsv) || 0);
					}
					// Smart 3-decimal display: integer → bare number; decimal → fix to 3 (keep trailing zeros)
					var sumQtyShippedRounded = roundHalfUp(sumQtyShipped, 3);
					var sumQtyShippedDisp = (sumQtyShippedRounded === Math.floor(sumQtyShippedRounded))
						? String(sumQtyShippedRounded)
						: sumQtyShippedRounded.toFixed(3);

					// ===== LEVEL 2: Item row =====
					html += `<tr class="item-row" data-said="${escHtml(saId_o)}" data-lineid="${escHtml(lineId)}" data-sa-id="${escHtml(saLineInternalId)}" data-weight-of-unit="${escHtml(itemWeightOfUnit)}" data-std-net-weight="${escHtml(itemStdNetWeight)}" data-gross-weight="${escHtml(itemGrossWeight)}">
                        <td><input type="checkbox" class="item-sel"></td>
                        <td>${escHtml(itemTxt)}</td>
                        <td>${escHtml(qtyVal)}</td><td class="item-qty-shipped">${escHtml(sumQtyShippedDisp)}</td>
                        <td>${escHtml(unitTxt)}</td>
                        <td>${escHtml(itemWeightOfUnit)}</td>
                        <td>${escHtml(itemStdNetWeight)}</td>
                        <td>${escHtml(itemGrossWeight)}</td>
                        <td>${reasonSelectHtml('item-reason')}<span class="item-reason-phase-warn" style="display:none;color:#c0392b;font-weight:600;margin-left:6px;" title="Reason ที่เลือกไม่ตรงกับ Phase ของ Container ที่เลือกไว้ (ไม่ block การ Submit — ตรวจสอบก่อน)">⚠ Reason/Phase mismatch</span></td>
                        <td>${escHtml(lineId)}</td>
                        <td class="col-sa-id" style="display:none;" data-sa-id="${escHtml(saLineInternalId)}">${escHtml(saLineInternalId)}</td>
                    </tr>`;

					// ===== LEVEL 2 → 3: open Plan/Load (deepest) table, nested under the Item row =====
					// Plan/Load (Level 3) header columns: Sel, Plan Load, Short whole container, Container Index,
					// Container Size, Containers Number1, Seal No1, Qty (Plan Load), Sales Unit, Conv.of Unit (PAL),
					// Conv.of Unit (Roll), Ref. Transfer Order, (Transfer Order Line - hidden), (Ref. Transfer Order ID - hidden),
					// Ref. Wave No., (Ref. Wave Line - hidden), Ref. Item Fulfillment, Qty Shipped, Unit, Do not Cal Conv,
					// Conv.of Unit (PAL) [from IF], Conv.of Unit (Roll) [from IF], Net Weight, Gross Weight, Inactive
					if (planLoads.length > 0) {
						html += `<tr class="item-children" data-said="${escHtml(saId_o)}" data-lineid="${escHtml(lineId)}">
                            <td colspan="11"><table class="pl-inner">
                            <thead>
                                <tr>
                                <th style="width:24px;">Sel</th>
                                <th>Plan Load</th>
                                <th>Short whole container</th>
                                <th>Container Index</th>
                                <th>Container Size</th>
                                <th>Containers Number1</th>
                                <th>Seal No1</th>
                                <th>Qty (Plan Load)</th>
                                <th>Sales Unit</th>
                                <th>Conv.of Unit (PAL)</th>
                                <th>Conv.of Unit (Roll)</th>
                                <th>Ref. Transfer Order</th><th class="col-to-line" style="display:none;">Transfer Order Line</th><th class="col-to-id" style="display:none;">Ref. Transfer Order ID</th>
                                <th>Ref. Wave No.</th><th class="col-wave-line" style="display:none;">Ref. Wave Line</th>
                                <th>Ref. Item Fulfillment</th>
                                <th>Wave Qty</th>
                                <th>Qty Shipped (IF)</th>
                                <th>Unit</th>
                                <th>Do not Cal Conv</th>
                                <th>Conv.of Unit (PAL)</th>
                                <th>Conv.of Unit (Roll)</th>
                                <th>Net Weight</th>
                                <th>Gross Weight</th>
                                <th>Inactive</th>
                                </tr>
                            </thead>
                        <tbody>`;

						for (var p2 = 0; p2 < planLoads.length; p2++) {
							var pl = planLoads[p2];
							// `result.id` is always present on a search.Result regardless of SS columns
							var plRecId = pl.id || pl.getValue('id') || pl.getValue('internalid');
							var planLoadTxt = pl.getText('custrecord_item_info_plan_load') || pl.getValue('custrecord_item_info_plan_load');
							var conIndex = pl.getValue('custrecord_item_info_con_index');
							var conSize = pl.getText('custrecord_item_info_con_size') || pl.getValue('custrecord_item_info_con_size');
							var conName1 = pl.getValue('custrecord_item_info_con_name1');
							var sealNo1 = pl.getValue('custrecord_item_info_seal_no');
							var qtyConfirm = pl.getValue('custrecord_item_info_qty_confirm');
							var salesUnitTxt = pl.getText('custrecord_item_info_sales_unit') || pl.getValue('custrecord_item_info_sales_unit');
							var convPal = pl.getValue('custrecord_item_info_conv_of_unit_pal');
							var convRoll = pl.getValue('custrecord_item_info_conv_of_unit_roll');
							// Ref Transfer Order — display name stripped of "Transfer Order #" prefix
							var transOrderTxt = pl.getText('custrecord_item_info_trans_order') || '';
							if (transOrderTxt) transOrderTxt = String(transOrderTxt).replace(/^Transfer Order #/, '').trim();
							var transOrderId = pl.getValue('custrecord_item_info_trans_order');
							var toLineVal = pl.getValue('custrecord_item_info_to_line');
							var waveNoTxt = pl.getText('custrecord_item_info_wave_no') || pl.getValue('custrecord_item_info_wave_no');
							var waveLineVal = pl.getValue('custrecord_item_info_wave_line');
							var refFulfillTxt = pl.getText({name: 'custrecord_twms_wavei_reffulfillment', join: 'CUSTRECORD_ITEM_INFO_WAVE_LINE'}) || '';
							if (refFulfillTxt) refFulfillTxt = String(refFulfillTxt).replace(/^Item Fulfillment #/, '').trim();
							if (!refFulfillTxt) refFulfillTxt = pl.getValue({name: 'custrecord_twms_wavei_reffulfillment', join: 'CUSTRECORD_ITEM_INFO_WAVE_LINE'});
							// Wave Qty (raw) — Warehouse-corrected target qty, always populated once Wave exists.
							// Qty Shipped (IF) (raw) — blank until Gen IF (Phase A); the "effective" qty used
							// downstream (row write-value, zero/non-zero branch decision) is qtyShipped ?? waveQuantity,
							// computed client-side (CS) from these two raw columns.
							var waveQuantity = pl.getValue({name: 'custrecord_twms_wavei_wavequantity', join: 'CUSTRECORD_ITEM_INFO_WAVE_LINE'});
							var qtyShipped = pl.getValue({name: 'custrecord_twms_wavei_qtyshipped', join: 'CUSTRECORD_ITEM_INFO_WAVE_LINE'});
							var wavUomTxt = pl.getText({name: 'custrecord_twms_wavei_uom', join: 'CUSTRECORD_ITEM_INFO_WAVE_LINE'})
								|| pl.getValue({name: 'custrecord_twms_wavei_uom', join: 'CUSTRECORD_ITEM_INFO_WAVE_LINE'});
							var isInactiveRaw = pl.getValue('isinactive');
							var inactiveFlag = (isInactiveRaw === 'T' || isInactiveRaw === true || isInactiveRaw === 'true');
							var inactiveTxt = inactiveFlag ? 'Yes' : (isInactiveRaw === 'F' || isInactiveRaw === false || isInactiveRaw === 'false' ? 'No' : '');
							var isShortConRaw = pl.getValue('custrecord_item_info_short_con');
							var shortConFlag = (isShortConRaw === 'T' || isShortConRaw === true || isShortConRaw === 'true');

							// "Do not Cal Conversion" flag on Plan/Load — read-only display.
							// When TRUE, the 4 dependent input cells (Conv PAL/Roll IF + NW + GW) become editable.
							var convNotCalRaw = pl.getValue('custrecord_item_info_conv_not_cal');
							var convNotCalFlag = (convNotCalRaw === 'T' || convNotCalRaw === true || convNotCalRaw === 'true');

							// IF line conv + weight values — match by PL id against TO line's custcol_to_plan_load_line
							// (search joins TO → applyingTransaction (IF) → custcol_conv_of_unit_* / custcol_net_weight / custcol_gross_weight)
							// If multiple IF lines map to same PL → SUM. If all empty → display empty.
							var ifConv = ifConvByPlId[String(plRecId || '')];
							var convPalIF = '';
							if (ifConv) {
								if (ifConv.palHasVal) convPalIF = parseFloat(ifConv.pal.toFixed(5));
							}
							// Conv.of Unit (Roll) [from IF] — sourced from the Wave Line's own Qty (Roll),
							// not the IF-summed conv value (replaces it entirely).
							var convRollIF = pl.getValue({name: 'custrecord_twms_wavei_qty_roll', join: 'CUSTRECORD_ITEM_INFO_WAVE_LINE'}) || '';
							// if (convRollIF == null) convRollIF = '';

							// Net Weight + Gross Weight — joined from wave item via CUSTRECORD_ITEM_INFO_WAVE_LINE
							var netWeight = pl.getValue({name: 'custrecord_twms_wavei_nw', join: 'CUSTRECORD_ITEM_INFO_WAVE_LINE'});
							var grossWeight = pl.getValue({name: 'custrecord_twms_wavei_gw', join: 'CUSTRECORD_ITEM_INFO_WAVE_LINE'});

							// When the Item's Weight of Unit (Level 2) is Pallet or Roll, Net/Gross Weight are
							// CALCULATED from this PL's own conversion factor × the Item's per-unit weight —
							// overrides the wave-based value above, regardless of "Do not Cal Conv".
							if (itemWeightOfUnit === 'Pallet' || itemWeightOfUnit === 'Roll') {
								var convForWeight = (itemWeightOfUnit === 'Pallet') ? convPal : convRoll;
								if (convForWeight != null && String(convForWeight).trim() !== '') {
									if (itemStdNetWeight != null && String(itemStdNetWeight).trim() !== '') {
										netWeight = parseFloat((parseFloat(convForWeight) * parseFloat(itemStdNetWeight)).toFixed(0));
									}
									if (itemGrossWeight != null && String(itemGrossWeight).trim() !== '') {
										grossWeight = parseFloat((parseFloat(convForWeight) * parseFloat(itemGrossWeight)).toFixed(0));
									}
								}
							}

							// Net Weight/Gross Weight actually entered on the IF (summed above) win over
							// everything else — both the wave-based value and the conv×item-weight calc.
							if (ifConv) {
								if (ifConv.netWeightHasVal) netWeight = parseFloat(ifConv.netWeight.toFixed(0));
								if (ifConv.grossWeightHasVal) grossWeight = parseFloat(ifConv.grossWeight.toFixed(0));
							}

							// 4 conv-related inputs — readonly unless convNotCalFlag = true
							var roAttr = convNotCalFlag ? '' : ' readonly';
							var roStyle = convNotCalFlag ? '' : 'background:#f5f5f5;color:#666;';
							var convInputStyle = 'width:80px;text-align:right;' + roStyle;

							// ===== LEVEL 3: Plan/Load row (deepest, no further nesting) =====
							html += `<tr class="pl-row" data-said="${escHtml(saId_o)}" data-lineid="${escHtml(lineId)}" data-pl-id="${escHtml(plRecId)}" data-qs="${escHtml(qtyShipped == null ? '' : qtyShipped)}" data-wq="${escHtml(waveQuantity == null ? '' : waveQuantity)}" data-qc="${escHtml(qtyConfirm == null ? '' : qtyConfirm)}" data-inactive="${inactiveFlag ? 'T' : 'F'}" data-short-con="${shortConFlag ? 'T' : 'F'}" data-conv-not-cal-default="${convNotCalFlag ? 'T' : 'F'}" data-con-index="${escHtml(conIndex == null ? '' : conIndex)}" data-con-size="${escHtml(conSize == null ? '' : conSize)}">
                                <td><input type="checkbox" class="pl-sel"></td>
                                <td>${escHtml(planLoadTxt)}</td><td style="text-align:center;"><input type="checkbox" class="pl-short-con"${shortConFlag ? ' checked' : ''} disabled></td>
                                <td>${escHtml(conIndex)}</td>
                                <td>${escHtml(conSize)}</td>
                                <td>${escHtml(conName1)}</td>
                                <td>${escHtml(sealNo1)}</td>
                                <td>${escHtml(qtyConfirm)}</td>
                                <td>${escHtml(salesUnitTxt)}</td>
                                <td>${escHtml(convPal)}</td>
                                <td>${escHtml(convRoll)}</td>
                                <td>${escHtml(transOrderTxt)}</td><td class="col-to-line" style="display:none;" data-to-line="${escHtml(toLineVal)}">${escHtml(toLineVal)}</td><td class="col-to-id" style="display:none;" data-to-id="${escHtml(transOrderId)}">${escHtml(transOrderId)}</td>
                                <td>${escHtml(waveNoTxt)}</td><td class="col-wave-line" style="display:none;" data-wave-line="${escHtml(waveLineVal)}">${escHtml(waveLineVal)}</td>
                                <td>${escHtml(refFulfillTxt)}</td>
                                <td>${escHtml(waveQuantity)}</td>
                                <td>${escHtml(qtyShipped)}</td>
                                <td>${escHtml(wavUomTxt)}</td><td style="text-align:center;"><input type="checkbox" class="pl-do-not-cal-conv"${convNotCalFlag ? ' checked' : ''} disabled></td>
                                <td><input type="text" class="pl-conv-pal-if" value="${escHtml(convPalIF)}" style="${convInputStyle}" data-default="${escHtml(convPalIF)}"${roAttr}></td>
                                <td><input type="text" class="pl-conv-roll-if" value="${escHtml(convRollIF)}" style="${convInputStyle}" data-default="${escHtml(convRollIF)}"${roAttr}></td>
                                <td><input type="text" class="pl-net-weight" value="${escHtml(netWeight)}" style="${convInputStyle}" data-default="${escHtml(netWeight)}"${roAttr}></td>
                                <td><input type="text" class="pl-gross-weight" value="${escHtml(grossWeight)}" style="${convInputStyle}" data-default="${escHtml(grossWeight)}"${roAttr}></td>
                                <td>${escHtml(inactiveTxt)}</td>
                            </tr>`;
						}

						html += '</tbody></table></td></tr>';
					}
				}

				html += '</tbody></table></td></tr>';
			}
		} else {
			html += '<tr><td colspan="11" style="text-align:center;color:#888;padding:20px;">No data</td></tr>';
		}

		html += '</tbody></table></div>';

		form.addField({id: 'so_grid', label: ' ', type: 'inlinehtml'}).defaultValue = html;

		// ----- Buttons
        form.addSubmitButton({ label: 'Next Preview'});
		form.addButton({
			id: 'backbtn',
			label: 'Back',
			functionName: 'UI_btnBackToFilter',
		});

		form.updateDefaultValues({
			step: 'preview',

			subsidiary: subsidiary || '',
			customer: customer || '',
			sa_id: sa_id || '',
			trandate_from: trandate_from || '',
			trandate_to: trandate_to || '',
			shipdate_from: shipdate_from || '',
			shipdate_to: shipdate_to || '',
			ship_to_country: ship_to_country || '',
			domestic_export_filter: domestic_export_filter || '',
		});

		response.writePage(form);

	} else if (step == 'preview') {

		// ################################################################################################
		// ===== Preview page — show selected items + selected plan/loads, ready for Start Process
		// ################################################################################################
		var payloadRaw = params.submit_payload || '[]';
		var payload = [];
		try { payload = JSON.parse(payloadRaw); } catch (e) { payload = []; }

		var form = serverWidget.createForm({
			title: PAGETITLE + ' - Preview',
			hideNavBar: false,
		});
		if (!!CLIENTSCRIPT_ID) form.clientScriptModulePath = CLIENTSCRIPT_ID;

		// Hidden fields carrying the payload forward (CS reads from currentRecord)
		form.addField({id: 'step', label: 'step', type: serverWidget.FieldType.TEXT}).updateDisplayType(DisplayType.HIDDEN);
		form.addField({id: 'submit_payload', label: 'payload', type: serverWidget.FieldType.LONGTEXT}).updateDisplayType(DisplayType.HIDDEN);

		// Build preview HTML
		function escHtml2(v) {
			if (v === null || v === undefined) return '';
			return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
		}

		// SA (Level 1) header columns: Status, PI Document, Document #, Customer,
		// Total Container, Total Container (Text), Reason
		var html2 = `<style>
.so-wrap{overflow-x:auto;width:100%;padding:4px 0;}
.so-outer,.item-inner,.pl-inner{border-collapse:collapse;font-family:"Segoe UI","Roboto",Arial,sans-serif;font-size:12px;color:#1f2d3d;}
.so-outer th,.so-outer td,.item-inner th,.item-inner td,.pl-inner th,.pl-inner td{border:1px solid #b9c5d6;padding:5px 8px;vertical-align:middle;white-space:nowrap;}
.so-outer{width:auto;min-width:100%;}
.so-outer thead th{background:#1f4e79;color:#fff;font-weight:600;text-align:left;}
.so-outer tr.sa-row > td{background:#dbe7f5;font-weight:600;}
.so-outer tr.sa-children > td{background:#fff;padding:6px 8px 6px 24px;}
.item-inner{width:auto;min-width:100%;}
.item-inner thead th{background:#4f81bd;color:#fff;font-weight:500;text-align:left;}
.item-inner tr.item-children > td{background:#fafbfd;padding:5px 8px 5px 20px;}
.pl-inner{width:auto;min-width:100%;}
.pl-inner thead th{background:#8db4d9;color:#fff;font-weight:500;text-align:left;}
.proc-img{display:inline-block;min-width:20px;text-align:center;}
.proc-state{margin-left:6px;color:#555;}
.pl-proc-img{display:inline-block;min-width:20px;text-align:center;}
.pl-proc-state{margin-left:6px;color:#555;font-size:11px;}
.so-warning{color:#c0392b;font-weight:700;font-size:20px;background:#fdecea;border:2px solid #c0392b;padding:12px 16px;margin:6px 0 12px 0;text-align:center;letter-spacing:0.3px;}
.so-warning-2{color:#c0392b;font-weight:700;font-size:18px;background:#fdecea;border:2px solid #c0392b;padding:10px 14px;margin:6px 0 12px 0;text-align:center;}
</style>
<div class="so-warning">⚠ กรุณา Print ข้อมูลก่อนทำการ Update</div>
<div class="so-warning-2">⚠ ตรวจสอบข้อมูลก่อนกด Start Process — Update จะเกิดขึ้นเมื่อกดปุ่ม</div>
<div class="so-wrap">

<table class="so-outer">
<thead><tr>

<th>Status</th>

<th>PI Document</th>
<th>Document #</th>
<th>Customer</th>

<th>Total Container</th>
<th>Total Container (Text)</th>

<th>Reason</th>
</tr></thead><tbody>`;

		// Group payload by SA — payload from CS already contains only selected items + plan/loads
		// AND already carries page-2 displayed values (no recompute on preview).
		var saMap = {};
		var saOrder = [];
		for (var pi = 0; pi < payload.length; pi++) {
			var pe = payload[pi];
			if (!saMap[pe.said]) {
				saMap[pe.said] = {
					said: pe.said,
					saTranid: pe.saTranid,
					piDoc: pe.piDoc,
					customer: pe.customer,
					reasonText: pe.reasonText,
					totalContainerDisp: pe.totalContainerDisp || '',          // ← from page 2
					totalContainerTextDisp: pe.totalContainerTextDisp || '',  // ← from page 2
					containerBreakdown: pe.containerBreakdown || [],
					items: [],
				};
				saOrder.push(pe.said);
			}
			saMap[pe.said].items.push(pe);
		}

		if (saOrder.length > 0) {
			for (var s = 0; s < saOrder.length; s++) {
				var sa = saMap[saOrder[s]];

				// ===== LEVEL 1: SA (Shipping Advice) row =====
				html2 += `<tr class="sa-row" data-said="${escHtml2(sa.said)}">
                <td><span class="proc-img" data-said="${escHtml2(sa.said)}">⏳</span><span class="proc-state" data-said="${escHtml2(sa.said)}">Idle</span></td><td>${escHtml2(sa.piDoc)}</td><td>${escHtml2(sa.saTranid)}</td><td>${escHtml2(sa.customer)}</td><td class="sa-total-container">${escHtml2(sa.totalContainerDisp)}</td><td class="sa-total-container-text">${escHtml2(sa.totalContainerTextDisp)}</td><td>${escHtml2(sa.reasonText)}</td></tr>`;

				// ===== LEVEL 1 → 2: open Item (mid-level) table, nested under the SA row =====
				// Item (Level 2) header columns: Item, SA Quantity, Total Qty Shipped, Reason
				html2 += `<tr class="sa-children">
                    <td colspan="7">
                    <table class="item-inner"><thead><tr>
                        <th>Item</th>
                        <th>SA Quantity</th>
                        <th>Total Qty Shipped</th>
                        <th>Reason</th></tr>
                        </thead>
                    <tbody>`;

				for (var ii = 0; ii < sa.items.length; ii++) {
					var it = sa.items[ii];

					// Format Total Qty Shipped to max 3 decimal places (strip trailing zeros)
					var itTotalQs = parseFloat(it.totalQtyShippedDisp);
					// Smart 3-decimal: integer → bare; decimal → fix to 3
					var itTotalQsFmt;
					if (isNaN(itTotalQs)) {
						itTotalQsFmt = it.totalQtyShippedDisp;
					} else {
						var itTotalQsRounded = roundHalfUp(itTotalQs, 3);
						itTotalQsFmt = (itTotalQsRounded === Math.floor(itTotalQsRounded))
							? String(itTotalQsRounded)
							: itTotalQsRounded.toFixed(3);
					}
					// ===== LEVEL 2: Item row =====
					html2 += `<tr class="item-row" data-said="${escHtml2(it.said)}" data-lineid="${escHtml2(it.saLineId)}"><td>${escHtml2(it.itemText)}</td><td>${escHtml2(it.saQty)}</td><td class="item-qty-shipped">${escHtml2(itTotalQsFmt)}</td><td>${escHtml2(it.reasonText)}</td></tr>`;

					// Plan/Load — ALL pl-rows (with "Sel" indicator showing which were selected)
					var pls = it.planLoads || [];
					if (pls.length > 0) {
						// ===== LEVEL 2 → 3: open Plan/Load (deepest) table, nested under the Item row =====
						// Plan/Load (Level 3) header columns: Status, Sel, Plan Load, Short whole container,
						// Container Index, Container Size, Containers Number1, Qty (Plan Load), Conv.of Unit (PAL),
						// Conv.of Unit (Roll), TO #, Wave #, Qty Shipped, Unit, Do not Cal Conv,
						// Conv.of Unit (PAL) [from IF], Conv.of Unit (Roll) [from IF], Net Weight, Gross Weight, Inactive
						html2 += `<tr class="item-children"><td colspan="4"><table class="pl-inner"><thead><tr><th style="width:180px;">Status</th><th style="width:24px;">Sel</th>
                        <th>Plan Load</th>
                        <th>Short whole container</th>
                        <th>Container Index</th>
                        <th>Container Size</th>
                        <th>Containers Number1</th>
                        <th>Qty (Plan Load)</th>
                        <th>Conv.of Unit (PAL)</th>
                        <th>Conv.of Unit (Roll)</th>
                        <th>TO #</th>
                        <th>Wave #</th>
                        <th>Wave Qty</th>
                        <th>Qty Shipped (IF)</th>
                        <th>Unit</th>
                        <th>Do not Cal Conv</th>
                        <th>Conv.of Unit (PAL)</th>
                        <th>Conv.of Unit (Roll)</th>
                        <th>Net Weight</th>
                        <th>Gross Weight</th>
                        <th>Inactive</th></tr></thead><tbody>`;
						for (var pli = 0; pli < pls.length; pli++) {
							var p = pls[pli];
							var selMark = p.selected ? '✓' : '';
							var rowStyle = p.selected ? '' : ' style="opacity:0.55;"';
							var isInactiveT = (p.inactive === 'Yes' || p.inactive === 'T' || p.inactive === true || p.inactive === 'true');
							var isShortConT = (p.shortCon === true || p.shortCon === 'T' || p.shortCon === 'true' || p.shortCon === 1);
							// ===== LEVEL 3: Plan/Load row (deepest, no further nesting) =====
							html2 += `<tr class="pl-row"${rowStyle} data-said="${escHtml2(it.said)}" data-lineid="${escHtml2(it.saLineId)}" data-plid="${escHtml2(p.planLoadId == null ? '' : p.planLoadId)}" data-selected="${p.selected ? 'T' : 'F'}" data-qs="${escHtml2(p.qtyShipped == null ? '' : p.qtyShipped)}" data-qc="${escHtml2(p.qtyConfirm == null ? '' : p.qtyConfirm)}" data-inactive="${isInactiveT ? 'T' : 'F'}" data-short-con="${isShortConT ? 'T' : 'F'}" data-con-index="${escHtml2(p.conIndex == null ? '' : p.conIndex)}" data-con-size="${escHtml2(p.conSize == null ? '' : p.conSize)}"><td><span class="pl-proc-img" data-plid="${escHtml2(p.planLoadId == null ? '' : p.planLoadId)}">${p.selected ? '⏳' : '—'}</span><span class="pl-proc-state" data-plid="${escHtml2(p.planLoadId == null ? '' : p.planLoadId)}">${p.selected ? 'Idle' : 'Skipped'}</span></td><td style="text-align:center;font-weight:700;color:${p.selected ? '#2e7d32' : '#aaa'};">${selMark}</td><td>${escHtml2(p.planLoad)}</td><td style="text-align:center;"><input type="checkbox" class="pl-short-con"${isShortConT ? ' checked' : ''}${p.selected ? '' : ' disabled'}></td><td>${escHtml2(p.conIndex)}</td><td>${escHtml2(p.conSize)}</td><td>${escHtml2(p.conName1)}</td><td>${escHtml2(p.qtyConfirm)}</td><td>${escHtml2(p.convPal)}</td><td>${escHtml2(p.convRoll)}</td><td>${escHtml2(p.toText)}</td><td>${escHtml2(p.waveNo)}</td><td>${escHtml2(p.waveQty)}</td><td>${escHtml2(p.qtyShipped)}</td><td>${escHtml2(p.uom)}</td><td style="text-align:center;"><input type="checkbox"${p.convNotCal ? ' checked' : ''} disabled></td><td>${escHtml2(p.convPalIF)}</td><td>${escHtml2(p.convRollIF)}</td><td>${escHtml2(p.netWeight)}</td><td>${escHtml2(p.grossWeight)}</td><td>${escHtml2(p.inactive)}</td></tr>`;
						}
						html2 += '</tbody></table></td></tr>';
					}
				}

				html2 += '</tbody></table></td></tr>';
			}
		} else {
			html2 += '<tr><td colspan="7" style="text-align:center;color:#888;padding:20px;">No selected items in payload</td></tr>';
		}

		html2 += '</tbody></table></div>';

		form.addField({id: 'preview_grid', label: ' ', type: 'inlinehtml'}).defaultValue = html2;

		// Buttons
		form.addButton({id: 'startprocess', label: 'Start Process', functionName: 'UI_startProcess'});
		form.addButton({id: 'backbtn', label: 'Back', functionName: 'UI_btnBackToFilter'});

		form.updateDefaultValues({
			step: 'preview',
			submit_payload: payloadRaw,
		});

		response.writePage(form);

	} else if (step == 'ajaxsync') {

		// ################################################################################################
		// ===== AJAX endpoint — granularity = 1 PL per call (PL-level spinner pattern)
		//        action=process_pl   → update Wave + PL + TO + IF + IR for ONE pl-row
		//        action=save_sa_body → update SA lines (qty/reason/qty_old) + SA body fields (containers)
		//                              called ONCE per SA after all process_pl calls succeed
		//        Each call independent → fresh 1000-unit governance budget.
		// ################################################################################################
		var action = params.action || 'process_pl';  // default for safety
		var said = params.said;

		// Helper — set sublist value only if existing differs from new (return true if changed)
		function setIfDiff(rec, sublistId, fieldId, line, newVal) {
			var existing = rec.getSublistValue({sublistId: sublistId, fieldId: fieldId, line: line});
			var a = existing == null ? '' : String(existing);
			var b = newVal == null ? '' : String(newVal);
			if (a !== b) {
				rec.setSublistValue({sublistId: sublistId, fieldId: fieldId, line: line, value: newVal});
				return true;
			}
			return false;
		}

		// Helper — set body field only if existing differs from new (return true if changed)
		function setBodyIfDiff(rec, fieldId, newVal) {
			var existing = rec.getValue({fieldId: fieldId});
			var a = existing == null ? '' : String(existing);
			var b = newVal == null ? '' : String(newVal);
			if (a !== b) {
				rec.setValue({fieldId: fieldId, value: newVal});
				return true;
			}
			return false;
		}

		// Retry-on-collision helper — the ONLY 2 places in this script that do a full
		// record.load()+.save() (TO section, IF/IR section) are exposed to NetSuite's
		// concurrent-edit conflict. Retry up to 3 total attempts (1 + 2 retries), NO delay
		// between attempts (no server-side sleep API; record.load() itself provides the gap).
		// Retry ONLY on e.name === 'RCRD_HAS_BEEN_CHANGED' — every other error throws immediately.
		function withRetryOnCollision(fn) {
			var attempts = 0;
			var lastErr = null;
			while (attempts < 3) {
				attempts++;
				try {
					return fn();
				} catch (e) {
					lastErr = e;
					if (e && e.name === 'RCRD_HAS_BEEN_CHANGED' && attempts < 3) {
						continue;
					}
					throw e;
				}
			}
			throw lastErr;
		}

		var updated = [];
		var failed = [];

		// Helper to find sublist line index (reuse multi-field strategy)
		function findSaLineIdx(rec, sublistId, targetVal) {
			if (targetVal == null || targetVal === '') return -1;
			var fields = ['lineuniquekey', 'line', 'id', 'orderline', 'linesequencenumber'];
			for (var tf = 0; tf < fields.length; tf++) {
				try {
					var idx = rec.findSublistLineWithValue({sublistId: sublistId, fieldId: fields[tf], value: targetVal});
					if (idx >= 0) return idx;
				} catch (e) { /* ignore */ }
			}
			var lc = rec.getLineCount({sublistId: sublistId});
			for (var li = 0; li < lc; li++) {
				for (var tf2 = 0; tf2 < fields.length; tf2++) {
					try {
						var v = rec.getSublistValue({sublistId: sublistId, fieldId: fields[tf2], line: li});
						if (v != null && String(v) === String(targetVal)) return li;
					} catch (e) { /* ignore */ }
				}
			}
			return -1;
		}

		try {
			// ============================================================
			// ====== ACTION 1: process_pl — update Wave + PL + TO + IF + IR for ONE pl-row
			// ============================================================
			if (action === 'process_pl') {

				var entryJson = params.entry || '{}';
				var pkt = {};
				try { pkt = JSON.parse(entryJson); } catch (epj) { pkt = {}; }
				var reason = pkt.reason;
				var pl = pkt.pl || {};

				log.audit({title: 'process_pl: start', details:
					'said=' + said + ' planLoadId=' + pl.planLoadId + ' toId=' + pl.toId +
					' usage=' + runtime.getCurrentScript().getRemainingUsage()});

				if (!pl.toId || !pl.toLineId) {
					response.setHeader({name: 'Content-Type', value: 'application/json'});
					response.write(JSON.stringify({ok: false, said: said, planLoadId: pl.planLoadId, msg: 'Missing toId/toLineId'}));
					return;
				}

				// Fields we'll try when matching a TO line.
				var LINE_LOOKUP_FIELDS = [
					'lineuniquekey', 'line', 'id', 'orderline',
					'linesequencenumber', 'linenumber', 'transactionline',
				];
				function findLineIdx(rec, sublistId, targetVal) {
					if (targetVal == null || targetVal === '') return -1;
					for (var tf = 0; tf < LINE_LOOKUP_FIELDS.length; tf++) {
						try {
							var idx = rec.findSublistLineWithValue({
								sublistId: sublistId,
								fieldId: LINE_LOOKUP_FIELDS[tf],
								value: targetVal,
							});
							if (idx >= 0) return idx;
						} catch (e) { /* field may not exist */ }
					}
					var lc = rec.getLineCount({sublistId: sublistId});
					for (var li2 = 0; li2 < lc; li2++) {
						for (var tf2 = 0; tf2 < LINE_LOOKUP_FIELDS.length; tf2++) {
							try {
								var v = rec.getSublistValue({sublistId: sublistId, fieldId: LINE_LOOKUP_FIELDS[tf2], line: li2});
								if (v != null && String(v) === String(targetVal)) return li2;
							} catch (e) { /* ignore */ }
						}
					}
					return -1;
				}

				// ---- (Pre-a) Wave Line — submitFields (fast)
				//        Always: short shipment reason
				//        Conditional (pl.convNotCal=true): also write Conv PAL/Roll + NW/GW
				//          → write all 4 unconditionally when flag set (submitFields skips no-op writes server-side
				//             on identical values, so no extra cost for unchanged fields)
				if (pl.waveLineId) {
					try {
						var waveValues = {custrecord_wms_shortshipment_reason: reason};
						var waveExtras = [];
						if (pl.convNotCal === true || pl.convNotCal === 'true' || pl.convNotCal === 'T') {
							var convPalNum = parseFloat(pl.convPalIF);
							var convRollNum = parseFloat(pl.convRollIF);
							var nwNum = parseFloat(pl.netWeight);
							var gwNum = parseFloat(pl.grossWeight);
							if (!isNaN(convPalNum)) { waveValues.custrecord_twms_pallet = convPalNum; waveExtras.push('PAL=' + convPalNum); }
							if (!isNaN(convRollNum)) { waveValues.custrecord_twms_wavei_qty_roll = convRollNum; waveExtras.push('Roll=' + convRollNum); }
							if (!isNaN(nwNum)) { waveValues.custrecord_twms_wavei_nw = nwNum; waveExtras.push('NW=' + nwNum); }
							if (!isNaN(gwNum)) { waveValues.custrecord_twms_wavei_gw = gwNum; waveExtras.push('GW=' + gwNum); }
						}
						record.submitFields({
							type: 'customrecord_twms_wave_item',
							id: pl.waveLineId,
							values: waveValues,
							options: {enableSourcing: false, ignoreMandatoryFields: true},
						});
						log.audit({title: 'WaveLine saved', details: 'id=' + pl.waveLineId + ' reason=' + reason + (waveExtras.length ? ' | convNotCal extras: ' + waveExtras.join(', ') : '')});
						updated.push({type: 'WaveLine', id: pl.waveLineId, reason: reason, convNotCal: !!pl.convNotCal, extras: waveExtras});
					} catch (e) {
						log.error({title: 'WaveLine submitFields fail', details: 'id=' + pl.waveLineId + ' :: ' + (e.message || String(e))});
						failed.push({type: 'WaveLine', id: pl.waveLineId, msg: e.message || String(e)});
					}
				}

				// ---- Governing rule: effective qty (fallback already resolved client-side as
				//      qtyShippedIF ?? waveQuantity) = 0 or non-zero decides the branch.
				//      "Short whole container" (pl.shortCon) is scope-only, and only takes effect
				//      when the row is already zero (Container-level); a non-zero row is always Qty-level.
				var effectiveQty = parseFloat(pl.effectiveQty);
				if (isNaN(effectiveQty)) effectiveQty = 0;
				var isZero = (effectiveQty === 0);
				var shortConFlag = (pl.shortCon === true || pl.shortCon === 'true' || pl.shortCon === 'T');
				var isContainerLevel = isZero && shortConFlag;

				// ---- (pre) Phase check — Phase A = no IF exists yet for this TO. Needed ONLY to
				//      decide whether the TO line may be closed below (Phase B never touches isclosed).
				//      Cheap existence-only search; the full IF/IR id list is still looked up later
				//      for reason-sync (unchanged, existing logic).
				var phaseAActive = false;
				try {
					var ifExistCount = search.create({
						type: search.Type.TRANSACTION,
						filters: [
							['createdfrom', 'anyof', pl.toId], 'AND',
							['type', 'anyof', ['ItemShip']], 'AND',
							['mainline', 'is', 'T'], 'AND',
							['voided', 'is', 'F'],
						],
						columns: [search.createColumn({name: 'internalid'})],
					}).runPaged({pageSize: 1}).count;
					phaseAActive = (ifExistCount === 0);
				} catch (ePhase) {
					log.error({title: 'Phase check fail', details: 'toId=' + pl.toId + ' :: ' + (ePhase.message || String(ePhase))});
					phaseAActive = false;  // uncertain → do not touch isclosed
				}

				// ---- (a) TO line — load + match + save (retry-on-collision wrapped)
				var toSectionOk = true;
				try {
					withRetryOnCollision(function () {
						log.audit({title: 'usage: before TO load', details: 'toId=' + pl.toId + ' remaining=' + runtime.getCurrentScript().getRemainingUsage()});
						var toRec = record.load({type: record.Type.TRANSFER_ORDER, id: pl.toId, isDynamic: false});

						var lineIdx = -1;
						if (pl.planLoadId) {
							try {
								lineIdx = toRec.findSublistLineWithValue({
									sublistId: 'item',
									fieldId: 'custcol_to_plan_load_line',
									value: pl.planLoadId,
								});
							} catch (e) { /* field may not exist */ }
							if (lineIdx < 0) {
								var lcA = toRec.getLineCount({sublistId: 'item'});
								for (var liA = 0; liA < lcA; liA++) {
									try {
										var v = toRec.getSublistValue({sublistId: 'item', fieldId: 'custcol_to_plan_load_line', line: liA});
										if (v != null && String(v) === String(pl.planLoadId)) { lineIdx = liA; break; }
									} catch (e) { /* ignore */ }
								}
							}
						}
						if (lineIdx < 0 && pl.toLineId) {
							lineIdx = findLineIdx(toRec, 'item', pl.toLineId);
						}

						if (lineIdx < 0) {
							toSectionOk = false;
							failed.push({type: 'TO', id: pl.toId, planLoadId: pl.planLoadId, line: pl.toLineId, msg: 'Line not found (PL ' + pl.planLoadId + ')'});
							return;
						}

						var toChanged = false;

						// Qty Old preservation (custcol_shortshipment_qty_old) — stamp ONLY on first
						// change (currently empty), mirroring the existing SA-line pattern.
						try {
							var existingToOld = toRec.getSublistValue({sublistId: 'item', fieldId: 'custcol_shortshipment_qty_old', line: lineIdx});
							if (existingToOld == null || String(existingToOld).trim() === '') {
								var preChangeToQty = toRec.getSublistValue({sublistId: 'item', fieldId: 'quantity', line: lineIdx});
								if (preChangeToQty != null && String(preChangeToQty).trim() !== '') {
									toRec.setSublistValue({sublistId: 'item', fieldId: 'custcol_shortshipment_qty_old', line: lineIdx, value: preChangeToQty});
									toChanged = true;
								}
							}
						} catch (eOldTo) {
							log.error({title: 'TO qty_old fail', details: 'line=' + lineIdx + ' :: ' + (eOldTo.message || String(eOldTo))});
						}

						if (setIfDiff(toRec, 'item', 'custcol_shortshipment_reason', lineIdx, reason)) toChanged = true;
						// Qty-level, Phase A ONLY: write the new (non-zero) quantity. NetSuite hard-rejects
						// quantity=0 on a Transfer Order line ("must have a positive count", confirmed
						// empirically) — for isZero rows the line must be CLOSED instead (below), never
						// have its quantity touched at all; whatever value is already there becomes moot
						// once the line is closed. Phase B must NEVER touch quantity regardless of
						// isZero — the TO already finished its lifecycle via IF/IR, so lowering quantity
						// below what was already fulfilled/received is rejected by NetSuite itself
						// ("Transfer orders can not be overfulfilled or overreceived", confirmed live
						// 2026-09-06 testing a Qty-level short on an already-fulfilled TO line).
						if (!isZero && phaseAActive) {
							if (setIfDiff(toRec, 'item', 'quantity', lineIdx, effectiveQty)) toChanged = true;
						}

						// Line-level / Container-level (qty=0): close the TO line — Phase A ONLY, and
						// only if not already closed. Phase B: never touch isclosed (TO already finished
						// its lifecycle via IF/IR). Heavy Container is NEVER touched here (see ACTION 3).
						var closedNow = false;
						if (isZero && phaseAActive) {
							try {
								var alreadyClosed = toRec.getSublistValue({sublistId: 'item', fieldId: 'isclosed', line: lineIdx});
								var isClosedFlag = (alreadyClosed === true || alreadyClosed === 'T' || alreadyClosed === 'true');
								if (!isClosedFlag) {
									toRec.setSublistValue({sublistId: 'item', fieldId: 'isclosed', line: lineIdx, value: true});
									toChanged = true;
									closedNow = true;
								}
							} catch (eClose) {
								log.error({title: 'TO isclosed fail', details: 'line=' + lineIdx + ' :: ' + (eClose.message || String(eClose))});
							}
						}

						if (toChanged) {
							log.audit({title: 'usage: before TO save', details: 'id=' + pl.toId + ' remaining=' + runtime.getCurrentScript().getRemainingUsage()});
							// TO: keep triggers (business logic relies on them) → standard save
							toRec.save({ignoreMandatoryFields: true});
							log.audit({title: 'TO saved', details: 'id=' + pl.toId + ' line=' + lineIdx + ' reason=' + reason + ' qty=' + effectiveQty + ' closed=' + closedNow});
							updated.push({type: 'TO', id: pl.toId, line: lineIdx, reason: reason, qty: effectiveQty, closed: closedNow});
						}
					});
				} catch (e) {
					toSectionOk = false;
					log.error({title: 'TO load/update fail', details: 'id=' + pl.toId + ' :: ' + (e.message || String(e))});
					failed.push({type: 'TO', id: pl.toId, planLoadId: pl.planLoadId, msg: e.message || String(e)});
				}

				// ---- (a-2) Plan/Load record — submitFields (fast). Skipped entirely if the TO
				// section above failed — writing PL Detail fields (isinactive/short_qty_old/reason)
				// while the paired TO update never landed would leave an inconsistent partial state
				// that the UI reports as a row failure while the DB shows it half-done (found live
				// 2026-09-06 via the TO overfulfillment bug above: PL got stamped even though the TO
				// save threw before it ever committed).
				if (pl.planLoadId && toSectionOk) {
					try {
						var newShortCon = shortConFlag;
						var plValues = {
							custrecord_pl_shortshipment_reason: reason,
							custrecord_item_info_short_con: newShortCon,
							// custrecord_item_info_qty_confirm: NEVER written — original plan qty must
							// survive forever (Wave regeneration on Cancel Wave + Confirm relies on it).
						};
						var plNwNum = parseFloat(pl.netWeight);
						var plGwNum = parseFloat(pl.grossWeight);
						if (!isNaN(plNwNum)) plValues.custrecord_item_info_net_weight = plNwNum;
						if (!isNaN(plGwNum)) plValues.custrecord_item_info_gross_weight = plGwNum;

						// Qty Old preservation (custrecord_item_info_short_qty_old) — stamp ONLY on first
						// change, mirroring custcol_shortshipment_qty_old: preserve the original
						// (never-overwritten) planned quantity as the pre-short baseline.
						try {
							var plLookup = search.lookupFields({
								type: 'customrecord_exp_item_information_pl',
								id: pl.planLoadId,
								columns: ['custrecord_item_info_short_qty_old', 'custrecord_item_info_qty_confirm'],
							});
							var existingPlOld = plLookup.custrecord_item_info_short_qty_old;
							if (existingPlOld == null || String(existingPlOld).trim() === '') {
								var origQtyConfirm = plLookup.custrecord_item_info_qty_confirm;
								if (origQtyConfirm != null && String(origQtyConfirm).trim() !== '') {
									plValues.custrecord_item_info_short_qty_old = parseFloat(origQtyConfirm);
								}
							}
						} catch (eOldPl) {
							log.error({title: 'PL short_qty_old lookup fail', details: 'id=' + pl.planLoadId + ' :: ' + (eOldPl.message || String(eOldPl))});
						}

						// Line-level / Container-level (qty=0): inactivate this Detail row.
						if (isZero) {
							plValues.isinactive = true;
						}

						record.submitFields({
							type: 'customrecord_exp_item_information_pl',
							id: pl.planLoadId,
							values: plValues,
							options: {enableSourcing: false, ignoreMandatoryFields: true},
						});
						log.audit({title: 'PlanLoad saved', details: 'id=' + pl.planLoadId + ' reason=' + reason + ' shortCon=' + newShortCon + ' isZero=' + isZero + ' nw=' + plValues.custrecord_item_info_net_weight + ' gw=' + plValues.custrecord_item_info_gross_weight});
						updated.push({type: 'PlanLoad', id: pl.planLoadId, reason: reason, shortCon: newShortCon, inactive: !!plValues.isinactive, netWeight: plValues.custrecord_item_info_net_weight, grossWeight: plValues.custrecord_item_info_gross_weight});
					} catch (e) {
						log.error({title: 'PlanLoad submitFields fail', details: 'id=' + pl.planLoadId + ' :: ' + (e.message || String(e))});
						failed.push({type: 'PlanLoad', id: pl.planLoadId, msg: e.message || String(e)});
					}
				}

				// ---- (b) Find IR/IF for THIS TO, load + update + save (disableTriggers)
				try {
					log.audit({title: 'usage: before IF/IR search', details: 'toId=' + pl.toId + ' remaining=' + runtime.getCurrentScript().getRemainingUsage()});

					// Step 1: IF search (createdfrom = TO)
					var ifResults = search.create({
						type: search.Type.TRANSACTION,
						filters: [
							['createdfrom', 'anyof', pl.toId], 'AND',
							['type', 'anyof', ['ItemShip']], 'AND',
							['mainline', 'is', 'T'], 'AND',
							['voided', 'is', 'F'],
						],
						columns: [search.createColumn({name: 'internalid'})],
					}).run().getRange({start: 0, end: 100});
					var ifIds = [];
					for (var qa = 0; qa < ifResults.length; qa++) {
						var ifid = ifResults[qa].getValue('internalid');
						if (ifid) ifIds.push(ifid);
					}

					// Step 2: IR search (createdfrom = TO OR any of its IFs)
					var irIds = [];
					var createdFromValues = [pl.toId].concat(ifIds);
					try {
						var irResults = search.create({
							type: search.Type.TRANSACTION,
							filters: [
								['createdfrom', 'anyof', createdFromValues], 'AND',
								['type', 'anyof', ['ItemRcpt']], 'AND',
								['mainline', 'is', 'T'], 'AND',
								['voided', 'is', 'F'],
							],
							columns: [search.createColumn({name: 'internalid'})],
						}).run().getRange({start: 0, end: 200});
						for (var x = 0; x < irResults.length; x++) {
							var vv = irResults[x].getValue('internalid');
							if (vv) irIds.push(vv);
						}
					} catch (eir) {
						log.error({title: 'IR createdfrom search fail', details: 'TO=' + pl.toId + ' :: ' + (eir.message || String(eir))});
					}

					log.audit({title: 'IF/IR lookup', details: 'TO=' + pl.toId + ' → IF=[' + ifIds.join(',') + '] IR=[' + irIds.join(',') + ']'});

					var trxList = [];
					for (var qi = 0; qi < ifIds.length; qi++) trxList.push({type: record.Type.ITEM_FULFILLMENT, id: ifIds[qi]});
					for (var qj = 0; qj < irIds.length; qj++) trxList.push({type: record.Type.ITEM_RECEIPT, id: irIds[qj]});

					for (var tx = 0; tx < trxList.length; tx++) {
						var trxType = trxList[tx].type;
						var trxId = trxList[tx].id;
						var label = (trxType === record.Type.ITEM_FULFILLMENT ? 'IF' : 'IR');
						try {
							withRetryOnCollision(function () {
								log.audit({title: 'usage: before ' + label + ' load', details: 'id=' + trxId + ' remaining=' + runtime.getCurrentScript().getRemainingUsage()});
								var trxRec = record.load({type: trxType, id: trxId});
								var lineCount = trxRec.getLineCount({sublistId: 'item'});
								var didChange = false;
								var matchedLines = [];

								for (var li = 0; li < lineCount; li++) {
									var matched = false;

									if (pl.planLoadId) {
										try {
											var plv = trxRec.getSublistValue({sublistId: 'item', fieldId: 'custcol_to_plan_load_line', line: li});
											if (plv != null && String(plv) === String(pl.planLoadId)) matched = true;
										} catch (ee) { /* field may not exist */ }
									}
									if (!matched && pl.toLineId) {
										var srcFields = ['orderline', 'createdfromline', 'transferorderline'];
										for (var sf = 0; sf < srcFields.length; sf++) {
											try {
												var vvv = trxRec.getSublistValue({sublistId: 'item', fieldId: srcFields[sf], line: li});
												if (vvv != null && String(vvv) === String(pl.toLineId)) { matched = true; break; }
											} catch (ee2) { /* ignore */ }
										}
									}

									if (matched) {
										matchedLines.push(li);
										if (setIfDiff(trxRec, 'item', 'custcol_shortshipment_reason', li, reason)) didChange = true;
									}
								}

								if (didChange) {
									log.audit({title: 'usage: before ' + label + ' save', details: 'id=' + trxId + ' remaining=' + runtime.getCurrentScript().getRemainingUsage()});
									// IF/IR: triggers can be skipped → faster save
									trxRec.save({ignoreMandatoryFields: true, disableTriggers: true});
									log.audit({title: label + ' saved', details: 'id=' + trxId + ' lines=' + matchedLines.join(',') + ' reason=' + reason});
									updated.push({type: label, id: trxId, lines: matchedLines, reason: reason});
								}
							});
						} catch (e) {
							log.error({title: label + ' load/save fail', details: 'id=' + trxId + ' :: ' + (e.message || String(e))});
							failed.push({type: label, id: trxId, msg: e.message || String(e)});
						}
					}
				} catch (e) {
					log.error({title: 'IR/IF lookup fail', details: 'TO=' + pl.toId + ' :: ' + (e.message || String(e))});
					failed.push({type: 'IR/IF search', toId: pl.toId, msg: e.message || String(e)});
				}

				log.audit({
					title: 'process_pl: done',
					details: 'said=' + said + ' planLoadId=' + pl.planLoadId +
						' updated=' + updated.length + ' failed=' + failed.length +
						' usage_remaining=' + runtime.getCurrentScript().getRemainingUsage(),
				});
				if (failed.length > 0) {
					log.error({title: 'process_pl: failures', details: JSON.stringify(failed).substring(0, 3500)});
				}
				response.setHeader({name: 'Content-Type', value: 'application/json'});
				response.write(JSON.stringify({
					ok: failed.length === 0,
					said: said,
					planLoadId: pl.planLoadId,
					updated: updated,
					failed: failed,
				}));
				return;
			}

			// ============================================================
			// ====== ACTION 3: close_heavy_container — set isinactive=true on the Heavy Container
			//        row(s) matched by Container Index. Called ONCE per container by the client,
			//        ONLY after confirming every Plan Load Item Detail row sharing that container
			//        index succeeded in process_pl (Reliability fix — Heavy Container is NEVER set
			//        inside the per-row process_pl loop; if any row failed, this action is skipped
			//        client-side entirely for that container this run).
			// ============================================================
			if (action === 'close_heavy_container') {
				var conIndex = params.conIndex;
				var planLoadDetailId = params.planLoadDetailId;
				try {
					if (conIndex == null || String(conIndex).trim() === '') {
						response.setHeader({name: 'Content-Type', value: 'application/json'});
						response.write(JSON.stringify({ok: false, said: said, msg: 'Missing conIndex'}));
						return;
					}

					// custrecord_hc_container_index is only a per-SA sequence number (e.g. "2" for
					// "container #2 of this shipment") — it repeats across unrelated SAs (confirmed:
					// 338 rows share index "2" system-wide). MUST also filter by custrecord_hc_ref_sa
					// (the SA this Heavy Container row belongs to) or this can inactivate a completely
					// unrelated shipment's Heavy Container row. (Real incident 2026-09-06: without this
					// filter, 10 unrelated rows got wrongly inactivated in one call — reverted by hand.)
					// A THIRD filter, custrecord_hc_ref_pl_no, is also required: every time a Plan Load
					// is re-planned (old one Cancelled, new one created), the external process creates a
					// new Heavy Container row for the same container index WITHOUT inactivating the old
					// one — so container_index + ref_sa alone can still match multiple stale rows from
					// earlier re-plan generations (confirmed live on SA 2819679, container index 1: 3
					// active rows, only the one matching the CURRENT Plan Load id was correct). Resolve
					// the current Plan Load header id server-side from the Plan Load Item Detail id the
					// client sends (data-pl-id — a reliable internal id, unlike any displayed column
					// text/index) rather than trusting a client-parsed display value.
					var hcFilters = [
						['custrecord_hc_container_index', 'is', conIndex], 'AND',
						['custrecord_hc_ref_sa', 'anyof', said],
					];
					if (planLoadDetailId != null && String(planLoadDetailId).trim() !== '') {
						try {
							var plLookup = search.lookupFields({
								type: 'customrecord_exp_item_information_pl',
								id: planLoadDetailId,
								columns: ['custrecord_item_info_plan_load'],
							});
							var plHeaderRef = plLookup.custrecord_item_info_plan_load;
							var plHeaderId = (plHeaderRef && plHeaderRef.length > 0) ? plHeaderRef[0].value : null;
							if (plHeaderId) {
								hcFilters.push('AND', ['custrecord_hc_ref_pl_no', 'anyof', plHeaderId]);
							}
						} catch (eLookup) {
							log.error({title: 'close_heavy_container: Plan Load lookup failed', details: 'planLoadDetailId=' + planLoadDetailId + ' :: ' + (eLookup.message || String(eLookup))});
						}
					}
					var hcResults = search.create({
						type: 'customrecord_heavy_container',
						filters: hcFilters,
						columns: [search.createColumn({name: 'internalid'})],
					}).run().getRange({start: 0, end: 10});

					if (hcResults.length === 0) {
						failed.push({type: 'HeavyContainer', conIndex: conIndex, msg: 'No Heavy Container row found for this Container Index'});
					} else {
						for (var hci = 0; hci < hcResults.length; hci++) {
							var hcId = hcResults[hci].getValue('internalid');
							try {
								record.submitFields({
									type: 'customrecord_heavy_container',
									id: hcId,
									values: {isinactive: true},
									options: {enableSourcing: false, ignoreMandatoryFields: true},
								});
								log.audit({title: 'HeavyContainer inactivated', details: 'id=' + hcId + ' conIndex=' + conIndex});
								updated.push({type: 'HeavyContainer', id: hcId, conIndex: conIndex});
							} catch (eHc) {
								log.error({title: 'HeavyContainer submitFields fail', details: 'id=' + hcId + ' :: ' + (eHc.message || String(eHc))});
								failed.push({type: 'HeavyContainer', id: hcId, conIndex: conIndex, msg: eHc.message || String(eHc)});
							}
						}
					}
				} catch (e) {
					log.error({title: 'close_heavy_container fail', details: 'conIndex=' + conIndex + ' :: ' + (e.message || String(e))});
					failed.push({type: 'HeavyContainer', conIndex: conIndex, msg: e.message || String(e)});
				}

				response.setHeader({name: 'Content-Type', value: 'application/json'});
				response.write(JSON.stringify({
					ok: failed.length === 0,
					said: said,
					conIndex: conIndex,
					updated: updated,
					failed: failed,
				}));
				return;
			}

			// ============================================================
			// ====== ACTION 2: save_sa_body — SA lines + SA body (called once per SA after all PLs done)
			// ============================================================
			if (action === 'save_sa_body') {

				var entriesJson = params.entry || '[]';
				var entries = [];
				try { entries = JSON.parse(entriesJson); } catch (eje) { entries = []; }

				log.audit({title: 'save_sa_body: start', details:
					'said=' + said + ' entries=' + entries.length +
					' usage=' + runtime.getCurrentScript().getRemainingUsage()});

				try {
					log.audit({title: 'usage: before SA load', details: 'id=' + said + ' remaining=' + runtime.getCurrentScript().getRemainingUsage()});
					var saRec = record.load({type: SA_RECORD_TYPE, id: said, isDynamic: false});
					var saChanged = false;
					var saLineUpdates = [];

					// SA lines — qty + reason + qty_old per selected entry
					for (var ei = 0; ei < entries.length; ei++) {
						var entry = entries[ei];
						if (!entry.saLineId) continue;
						var saSumQty = parseFloat(entry.totalQtyShippedDisp);
						if (isNaN(saSumQty)) saSumQty = 0;

						var saLineIdx = findSaLineIdx(saRec, 'item', entry.saLineId);
						if (saLineIdx < 0) {
							log.error({title: 'SA line not found', details: 'said=' + said + ' saLineId=' + entry.saLineId});
							failed.push({type: 'SA line', id: said, line: entry.saLineId, msg: 'Line not found on SA'});
							continue;
						}

						// Preserve original qty into custcol_shortshipment_qty_old (only if empty)
						var changedSA_Old = false;
						try {
							var existingOld = saRec.getSublistValue({sublistId: 'item', fieldId: 'custcol_shortshipment_qty_old', line: saLineIdx});
							if (existingOld == null || String(existingOld).trim() === '') {
								var origSaQty = parseFloat(entry.saQty);
								if (!isNaN(origSaQty)) {
									saRec.setSublistValue({sublistId: 'item', fieldId: 'custcol_shortshipment_qty_old', line: saLineIdx, value: origSaQty});
									changedSA_Old = true;
								}
							}
						} catch (eOld) {
							log.error({title: 'SA qty_old fail', details: 'line=' + saLineIdx + ' :: ' + (eOld.message || String(eOld))});
						}

						var changedSA_Reason = setIfDiff(saRec, 'item', 'custcol_shortshipment_reason', saLineIdx, entry.reason);

						// Preserve Rate + Tax Code — some SAs (with Price Level / Volume Pricing /
						// workflows / tax recalc) have NS reset `rate` to 0 and/or strip `taxcode`
						// when `quantity` changes. We snapshot both before changing qty, then
						// restore them. NS will re-derive `amount` and tax totals from preserved
						// rate/taxcode on save.
						var existingRate = null;
						var existingAmount = null;
						var existingTaxCode = null;
						try {
							existingRate = saRec.getSublistValue({sublistId: 'item', fieldId: 'rate', line: saLineIdx});
							existingAmount = saRec.getSublistValue({sublistId: 'item', fieldId: 'amount', line: saLineIdx});
							existingTaxCode = saRec.getSublistValue({sublistId: 'item', fieldId: 'taxcode', line: saLineIdx});
						} catch (ePre) { /* field may not exist on this account */ }
						var changedSA_Qty = setIfDiff(saRec, 'item', 'quantity', saLineIdx, saSumQty);
						if (changedSA_Qty) {
							if (existingRate != null && String(existingRate).trim() !== '') {
								try {
									saRec.setSublistValue({sublistId: 'item', fieldId: 'rate', line: saLineIdx, value: existingRate});
									log.audit({title: 'SA line: rate preserved', details:
										'line=' + saLineIdx + ' rate=' + existingRate +
										' (was amount=' + existingAmount + ', qty ' + entry.saQty + ' → ' + saSumQty + ')'});
								} catch (eSetRate) {
									log.error({title: 'SA rate restore fail', details: 'line=' + saLineIdx + ' :: ' + (eSetRate.message || String(eSetRate))});
								}
							}
							if (existingTaxCode != null && String(existingTaxCode).trim() !== '') {
								try {
									saRec.setSublistValue({sublistId: 'item', fieldId: 'taxcode', line: saLineIdx, value: existingTaxCode});
									log.audit({title: 'SA line: taxcode preserved', details: 'line=' + saLineIdx + ' taxcode=' + existingTaxCode});
								} catch (eSetTax) {
									log.error({title: 'SA taxcode restore fail', details: 'line=' + saLineIdx + ' :: ' + (eSetTax.message || String(eSetTax))});
								}
							}
						}

						// Conv overrides — when any selected PL on this entry has convNotCal=true,
						// sum the user-entered Conv PAL/Roll + NW/GW across those PLs (only PLs
						// with the flag set contribute) and write them onto the SA line. PLs with
						// convNotCal=false skip these fields entirely (preserves current behavior).
						var changedSA_Conv = false;
						var convExtras = [];
						var entryPls = (entry.planLoads || []).filter(function (p) {
							return p && p.selected && (p.convNotCal === true || p.convNotCal === 'true' || p.convNotCal === 'T');
						});
						if (entryPls.length > 0) {
							var sumPalSA = 0, sumRollSA = 0, sumNwSA = 0, sumGwSA = 0;
							var hasPal = false, hasRoll = false, hasNw = false, hasGw = false;
							for (var ep = 0; ep < entryPls.length; ep++) {
								var ep_pl = entryPls[ep];
								var n1 = parseFloat(ep_pl.convPalIF);
								var n2 = parseFloat(ep_pl.convRollIF);
								var n3 = parseFloat(ep_pl.netWeight);
								var n4 = parseFloat(ep_pl.grossWeight);
								if (!isNaN(n1)) { sumPalSA += n1; hasPal = true; }
								if (!isNaN(n2)) { sumRollSA += n2; hasRoll = true; }
								if (!isNaN(n3)) { sumNwSA += n3; hasNw = true; }
								if (!isNaN(n4)) { sumGwSA += n4; hasGw = true; }
							}
							// Flag the SA line that Do not Cal Conv was applied — user spec: write only when TRUE
							if (setIfDiff(saRec, 'item', 'custcol_donot_cal_conv', saLineIdx, true)) { changedSA_Conv = true; convExtras.push('DoNotCalConv=T'); }
							if (hasPal && setIfDiff(saRec, 'item', 'custcol_conv_of_unit_pal', saLineIdx, sumPalSA)) { changedSA_Conv = true; convExtras.push('PAL=' + sumPalSA); }
							if (hasRoll && setIfDiff(saRec, 'item', 'custcol_conv_of_unit_roll', saLineIdx, sumRollSA)) { changedSA_Conv = true; convExtras.push('Roll=' + sumRollSA); }
							if (hasNw && setIfDiff(saRec, 'item', 'custcol_net_weight', saLineIdx, sumNwSA)) { changedSA_Conv = true; convExtras.push('NW=' + sumNwSA); }
							if (hasGw && setIfDiff(saRec, 'item', 'custcol_gross_weight', saLineIdx, sumGwSA)) { changedSA_Conv = true; convExtras.push('GW=' + sumGwSA); }
						}

                        log.debug({
                            title: 'SA line check : ' + saLineIdx,
                            details: {
                                changedSA_Reason: changedSA_Reason,
                                changedSA_Qty: changedSA_Qty,
                                changedSA_Old: changedSA_Old,
                                changedSA_Conv: changedSA_Conv,
                            }
                        });

						if (changedSA_Reason || changedSA_Qty || changedSA_Old || changedSA_Conv) {
							saChanged = true;
							var lineUpd = {saLineId: entry.saLineId, lineIdx: saLineIdx};
							if (changedSA_Reason) lineUpd.reason = entry.reason;
							if (changedSA_Qty) lineUpd.quantity = saSumQty;
							if (changedSA_Old) lineUpd.qty_old = parseFloat(entry.saQty);
							if (changedSA_Conv) lineUpd.convExtras = convExtras;
							saLineUpdates.push(lineUpd);
							log.audit({
								title: 'SA line: ' + said + ' line=' + saLineIdx,
								details: 'reason=' + entry.reason + ', qty=' + saSumQty +
									(changedSA_Old ? ', qty_old=' + entry.saQty : '') +
									(changedSA_Conv ? ' | convNotCal: ' + convExtras.join(', ') : ''),
							});
						}
					}

					// SA body fields
					if (entries.length > 0) {
						var bodyTotal = entries[0].totalContainerDisp;
						var bodyBreakdownArr = entries[0].containerBreakdown || [];
						var bodyBreakdownJson = JSON.stringify(bodyBreakdownArr);

						if (bodyTotal != null && String(bodyTotal).trim() !== '') {
							var bodyTotalNum = parseInt(bodyTotal, 10);
							if (!isNaN(bodyTotalNum)) {
								if (setBodyIfDiff(saRec, 'custbody_total_container', bodyTotalNum)) saChanged = true;
							}
						}
						if (setBodyIfDiff(saRec, 'custbody_total_container_text', bodyBreakdownJson)) saChanged = true;
					}

					if (saChanged) {
						log.audit({title: 'usage: before SA save', details: 'id=' + said + ' remaining=' + runtime.getCurrentScript().getRemainingUsage()});
						saRec.save({ignoreMandatoryFields: true});
						log.audit({title: 'SA saved', details: 'id=' + said + ' lineUpdates=' + saLineUpdates.length});
						updated.push({
							type: 'SA',
							id: said,
							totalContainer: (entries[0] || {}).totalContainerDisp,
							lineUpdates: saLineUpdates,
						});
					}
				} catch (e) {
					log.error({title: 'SA body/save fail', details: 'id=' + said + ' :: ' + (e.message || String(e))});
					failed.push({type: 'SA body', id: said, msg: e.message || String(e)});
				}

				log.audit({
					title: 'save_sa_body: done',
					details: 'said=' + said + ' updated=' + updated.length + ' failed=' + failed.length +
						' usage_remaining=' + runtime.getCurrentScript().getRemainingUsage(),
				});
				if (failed.length > 0) {
					log.error({title: 'save_sa_body: failures', details: JSON.stringify(failed).substring(0, 3500)});
				}
				response.setHeader({name: 'Content-Type', value: 'application/json'});
				response.write(JSON.stringify({
					ok: failed.length === 0,
					said: said,
					updated: updated,
					failed: failed,
				}));
				return;
			}

			// Unknown action
			response.setHeader({name: 'Content-Type', value: 'application/json'});
			response.write(JSON.stringify({ok: false, said: said, msg: 'Unknown action: ' + action}));
		} catch (e) {
			response.setHeader({name: 'Content-Type', value: 'application/json'});
			var emsg = e.message || String(e);
			log.error({title: 'ajaxsync: exception', details: 'said=' + said + ' action=' + action + ' :: ' + emsg + '\nstack: ' + (e.stack || '')});
			response.write(JSON.stringify({ok: false, said: said, action: action, msg: emsg}));
		}
	}
}
