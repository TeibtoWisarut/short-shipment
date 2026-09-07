/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */

/**
 * @summary Client Script for Update Quantity Cut Short page
 *
 * @author Varaporn Noisakol <varaporn@teibto.com>
 *
 * @version 1
 *
 * @changes 1 Create Script
 */

var nlCurrentRecord, error, format, https, runtime, dialog, message, url, libCode;
var cRecord = null;
var SUITESCRIPT_ID = 'customscript_sl_update_qty_cutshort';

var MODULE = [];
MODULE.push('N/currentRecord');
MODULE.push('N/error');
MODULE.push('N/format');
MODULE.push('N/https');
MODULE.push('N/runtime');
MODULE.push('N/ui/dialog');
MODULE.push('N/ui/message');
MODULE.push('N/url');
MODULE.push('SuiteScripts/Library/Libraries Code 2.0.220622.js');

// ################################################################################################
// ===== Client Variable
// ################################################################################################
var timer = new Date().getTime();

define(MODULE,
	/**
	 * @param {currentRecord} _nlCurrentRecord
	 * @param {error} _error
	 * @param {format} _format
	 * @param {https} _https
	 * @param {runtime} _runtime
	 * @param {dialog} _dialog
	 * @param {message} _message
	 * @param {url} _url
	 * @param {libCode_220622} _libCode
	 */
	function (_nlCurrentRecord, _error, _format, _https, _runtime, _dialog, _message, _url, _libCode) {
		nlCurrentRecord = _nlCurrentRecord;
		error = _error;
		format = _format;
		https = _https;
		runtime = _runtime;
		dialog = _dialog;
		message = _message;
		url = _url;
		libCode = _libCode;

		return {
			pageInit: PageInit,
			fieldChanged: FieldChanged,
			saveRecord: SaveRecord,

			UI_btnBackToFilter: UI_btnBackToFilter,
			UI_startProcess: UI_startProcess,
		};
	});

// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// ########## Client Script Function
// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@

/**
 * Function to be executed after page is initialized.
 *
 * @param {Object} scriptContext
 * @param {Record} currentRecord scriptContext.currentRecord - Current form record
 * @param {string} mode scriptContext.mode - The mode in which the record is being accessed (create, copy, or edit)
 *
 * @since 2015.2
 */
function PageInit(scriptContext, currentRecord, mode) {
	currentRecord = scriptContext.currentRecord;
	mode = scriptContext.mode;
	cRecord = currentRecord;

	// ----- Bind handlers on the custom nested-table grid (rendered via inlinehtml)
	try {
		// Item checkbox change → cascade to SA + copy SA Reason + cascade to Plan/Load
		jQuery(document).off('change.shortorder', '.item-sel').on('change.shortorder', '.item-sel', function () {
			var $row = jQuery(this).closest('tr.item-row');
			var said = $row.attr('data-said');
			var lineid = $row.attr('data-lineid');
			var $saRow = jQuery('tr.sa-row[data-said="' + said + '"]');
			var $siblings = jQuery('tr.item-row[data-said="' + said + '"] .item-sel');
			var $plChildren = jQuery('tr.item-children[data-said="' + said + '"][data-lineid="' + lineid + '"]');

			if (this.checked) {
				// Tick SA checkbox (disabled but visually reflects state)
				$saRow.find('.sa-sel').prop('checked', true);
				// Copy SA Reason → this Item Reason (only if SA has a reason AND Item Reason is currently empty)
				var saReason = $saRow.find('.sa-reason').val();
				var $itemReason = $row.find('.item-reason');
				if (!!saReason && !$itemReason.val()) $itemReason.val(saReason);
				// Cascade: tick all Plan/Load checkboxes under this Item + enable short-con + enable Do not Cal Conv
				$plChildren.find('.pl-sel').prop('checked', true);
				$plChildren.find('.pl-short-con').prop('disabled', false);
				$plChildren.find('.pl-do-not-cal-conv').prop('disabled', false);
			} else {
				// If no sibling item is still checked, untick SA
				var anyChecked = $siblings.filter(':checked').length > 0;
				if (!anyChecked) $saRow.find('.sa-sel').prop('checked', false);
				// Cascade: untick all Plan/Load checkboxes under this Item + uncheck & disable short-con
				$plChildren.find('.pl-sel').prop('checked', false);
				var $sc = $plChildren.find('.pl-short-con');
				var anyWasChecked = $sc.filter(':checked').length > 0;
				$sc.prop('checked', false).prop('disabled', true);
				// Trigger recalc once if any short-con was previously checked (Qty Shipped + Total Container)
				if (anyWasChecked && $sc.length) $sc.first().trigger('change');
				// Disable Do not Cal Conv + reset 4 conv inputs to PL defaults on each pl-row of this item
				$plChildren.find('tr.pl-row').each(function () {
					var $plRow = jQuery(this);
					$plRow.find('.pl-do-not-cal-conv').prop('disabled', true);
					resetConvFromDefaults($plRow);
				});
			}
		});

		// Plan/Load checkbox change → cascade UP to Item + SA, toggle short-con disabled state
		// Helper: set the 4 conv-related inputs (Conv PAL/Roll IF, NW, GW) editable / readonly.
		//   editable=true  -> remove readonly + clear grey style
		//   editable=false -> set readonly + grey style (caller decides whether to reset values)
		function setConvInputsEditable($plRow, editable) {
			$plRow.find('.pl-conv-pal-if, .pl-conv-roll-if, .pl-net-weight, .pl-gross-weight').each(function () {
				var $i = jQuery(this);
				$i.prop('readonly', !editable);
				if (editable) {
					$i.css({background: '', color: ''});
				} else {
					$i.css({background: '#f5f5f5', color: '#666'});
				}
			});
		}

		// Reset Do not Cal Conv + 4 inputs back to PL defaults (used when pl-sel goes off).
		function resetConvFromDefaults($plRow) {
			var defaultConvNotCal = $plRow.attr('data-conv-not-cal-default') === 'T';
			$plRow.find('.pl-do-not-cal-conv').prop('checked', defaultConvNotCal);
			$plRow.find('.pl-conv-pal-if, .pl-conv-roll-if, .pl-net-weight, .pl-gross-weight').each(function () {
				var $i = jQuery(this);
				$i.val($i.attr('data-default') || '');
			});
			setConvInputsEditable($plRow, defaultConvNotCal);
		}

		// Do not Cal Conv checkbox toggle -> cascade editability to 4 conv-related inputs.
		jQuery(document).off('change.shortorder-convnotcal', '.pl-do-not-cal-conv').on('change.shortorder-convnotcal', '.pl-do-not-cal-conv', function () {
			var $plRow = jQuery(this).closest('tr.pl-row');
			setConvInputsEditable($plRow, this.checked);
		});

		// Recalculate Net/Gross Weight (Level 3) from the item's Weight of Unit conversion, live in
		// the browser — mirrors the server-side formula: conv (matching Weight of Unit) × item weight
		// (Level 2, read from the item-row's data-* attrs). Runs regardless of "Do not Cal Conv" state;
		// only applies when Weight of Unit is Pallet or Roll.
		function recalcWeightFromConv($plRow) {
			var said = $plRow.attr('data-said');
			var lineid = $plRow.attr('data-lineid');
			var $itemRow = jQuery('tr.item-row[data-said="' + said + '"][data-lineid="' + lineid + '"]');
			var weightOfUnit = $itemRow.attr('data-weight-of-unit') || '';
			if (weightOfUnit !== 'Pallet' && weightOfUnit !== 'Roll') return;

			var convVal = (weightOfUnit === 'Pallet')
				? $plRow.find('.pl-conv-pal-if').val()
				: $plRow.find('.pl-conv-roll-if').val();
			var conv = parseFloat(convVal);

            // console.log({ convVal });

			if (isNaN(conv)) return;

			var stdNetWeight = parseFloat($itemRow.attr('data-std-net-weight'));
			var grossWeightPerUnit = parseFloat($itemRow.attr('data-gross-weight'));
            // console.log({
            //     said: said,
            //     lineid: lineid,
            //     weightOfUnit: weightOfUnit,
            //     convVal: convVal,
            //     conv: conv,
            //     stdNetWeight: stdNetWeight,
            //     grossWeightPerUnit: grossWeightPerUnit

            // })
			if (!isNaN(stdNetWeight)) {
				$plRow.find('.pl-net-weight').val(parseFloat((conv * stdNetWeight).toFixed(0)));
			}
			if (!isNaN(grossWeightPerUnit)) {
				$plRow.find('.pl-gross-weight').val(parseFloat((conv * grossWeightPerUnit).toFixed(0)));
			}
		}
		jQuery(document).off('change.shortorder-weightcalc', '.pl-conv-pal-if, .pl-conv-roll-if').on('change.shortorder-weightcalc', '.pl-conv-pal-if, .pl-conv-roll-if', function () {
            console.log('[weightcalc] change fired — new value=' + jQuery(this).val());
			recalcWeightFromConv(jQuery(this).closest('tr.pl-row'));
		});

		jQuery(document).off('change.shortorder-pl', '.pl-sel').on('change.shortorder-pl', '.pl-sel', function () {
			var $plRow = jQuery(this).closest('tr.pl-row');
			var said = $plRow.attr('data-said');
			var lineid = $plRow.attr('data-lineid');
			var $itemRow = jQuery('tr.item-row[data-said="' + said + '"][data-lineid="' + lineid + '"]');
			var $itemSel = $itemRow.find('.item-sel');
			var $saRow = jQuery('tr.sa-row[data-said="' + said + '"]');
			var $plSiblings = jQuery('tr.pl-row[data-said="' + said + '"][data-lineid="' + lineid + '"] .pl-sel');

			// Toggle Short whole container based on Select state of THIS pl-row
			//   selected → enable (keep current checked state)
			//   unselected → uncheck + disable (and recalc Qty Shipped / Total Container)
			var $sc = $plRow.find('.pl-short-con');
			if (this.checked) {
				$sc.prop('disabled', false);
			} else {
				var wasChecked = $sc.is(':checked');
				$sc.prop('checked', false).prop('disabled', true);
				if (wasChecked) $sc.trigger('change');  // recalc Qty Shipped + Total Container
			}

			// Toggle Do not Cal Conv editability based on Select state of THIS pl-row
			//   selected → enable checkbox (user may toggle override)
			//   unselected → reset to PL default + disable + cascade 4 conv inputs back to defaults
			var $convNotCal = $plRow.find('.pl-do-not-cal-conv');
			if (this.checked) {
				$convNotCal.prop('disabled', false);
			} else {
				$convNotCal.prop('disabled', true);
				resetConvFromDefaults($plRow);
			}

			if (this.checked) {
				// CHECK: tick Item + SA (use .prop so item-sel handler isn't re-triggered → no down-cascade to siblings)
				$itemSel.prop('checked', true);
				$saRow.find('.sa-sel').prop('checked', true);
				// Copy SA Reason → Item Reason if SA has reason AND Item Reason empty
				var saReason = $saRow.find('.sa-reason').val();
				var $itemReason = $itemRow.find('.item-reason');
				if (!!saReason && !$itemReason.val()) $itemReason.val(saReason);
			} else {
				// UNCHECK: if NO sibling pl-sel still checked → untick Item; then check SA siblings
				var anyPlChecked = $plSiblings.filter(':checked').length > 0;
				if (!anyPlChecked) {
					$itemSel.prop('checked', false);
					// If no item-sel under same SA is still checked → untick SA
					var $itemSiblings = jQuery('tr.item-row[data-said="' + said + '"] .item-sel');
					var anyItemChecked = $itemSiblings.filter(':checked').length > 0;
					if (!anyItemChecked) $saRow.find('.sa-sel').prop('checked', false);
				}
			}
		});

		// Short whole container checkbox change → recalculate:
		//   1. "Qty Shipped" sum on parent item-row
		//   2. "Total Container" + "Total Container (Text)" on parent sa-row
		// (excludes pl-rows where short_con is checked OR inactive='T')
		jQuery(document).off('change.shortcon', '.pl-short-con').on('change.shortcon', '.pl-short-con', function () {
			var $plRow = jQuery(this).closest('tr.pl-row');
			var said = $plRow.attr('data-said');
			var lineid = $plRow.attr('data-lineid');
			console.log('[shortcon] change fired — said=' + said + ' lineid=' + lineid + ' checked=' + this.checked);

			// ----- (1) Item-row Qty Shipped (sum of pls under same item) -----
			var $itemRow = jQuery('tr.item-row[data-said="' + said + '"][data-lineid="' + lineid + '"]');
			var $itemPls = jQuery('tr.item-children[data-said="' + said + '"][data-lineid="' + lineid + '"] tr.pl-row');
			console.log('[shortcon] item-row found=' + $itemRow.length + ', item pls count=' + $itemPls.length);
			var sum = 0;
			$itemPls.each(function () {
				var $pl = jQuery(this);
				if ($pl.attr('data-inactive') === 'T') return;
				if ($pl.find('.pl-short-con').is(':checked')) return;
				var qsRaw = $pl.attr('data-qs');
				var qsv = parseFloat(qsRaw);
				if (isNaN(qsv) || qsRaw == null || String(qsRaw).trim() === '') {
					qsv = parseFloat($pl.attr('data-qc')) || 0;
				}
				sum += qsv;
			});
			// Smart 3-decimal: integer → bare; decimal → fix to 3 (keep trailing zeros)
			sum = parseFloat(sum.toFixed(3));
			var sumDisp = (sum === Math.floor(sum)) ? String(sum) : sum.toFixed(3);
			var $itemQsCell = $itemRow.find('.item-qty-shipped');
			console.log('[shortcon] item-qty-shipped cell found=' + $itemQsCell.length + ', new sum=' + sumDisp);
			$itemQsCell.text(sumDisp);

			// ----- (2) SA-row Total Container + Total Container (Text) -----
			// Aggregate across ALL pls under ALL items of this SA
			var $saRow = jQuery('tr.sa-row[data-said="' + said + '"]');
			var $saAllPls = jQuery('tr.item-children[data-said="' + said + '"] tr.pl-row');
			console.log('[shortcon] sa-row found=' + $saRow.length + ', SA all pls count=' + $saAllPls.length);

			var containerSet = {};
			var containerBySize = {};
			$saAllPls.each(function () {
				var $pl = jQuery(this);
				if ($pl.attr('data-inactive') === 'T') return;
				if ($pl.find('.pl-short-con').is(':checked')) return;
				var ci = ($pl.attr('data-con-index') || '').trim();
				if (!ci) return;
				containerSet[ci] = true;
				var cs = ($pl.attr('data-con-size') || '').trim() || '(no size)';
				if (!containerBySize[cs]) containerBySize[cs] = {};
				containerBySize[cs][ci] = true;
			});
			var totalCont = 0;
			for (var c in containerSet) { if (containerSet.hasOwnProperty(c)) totalCont++; }

			var breakdownArr = [];
			var breakdownTextParts = [];
			for (var sk in containerBySize) {
				if (!containerBySize.hasOwnProperty(sk)) continue;
				var cnt = 0;
				for (var ik in containerBySize[sk]) { if (containerBySize[sk].hasOwnProperty(ik)) cnt++; }
				breakdownArr.push({container_total: String(cnt), container_size: sk});
				breakdownTextParts.push(cnt + ' × ' + sk);
			}
			var breakdownText = breakdownTextParts.join(', ');
			var breakdownJson = JSON.stringify(breakdownArr);

			var $tcCell = $saRow.find('.sa-total-container');
			var $tctCell = $saRow.find('.sa-total-container-text');
			console.log('[shortcon] sa-total-container cell found=' + $tcCell.length + ', sa-total-container-text cell found=' + $tctCell.length);
			console.log('[shortcon] new totalCont=' + totalCont + ', breakdown=' + breakdownText);
			$tcCell.text(totalCont);
			$tctCell.text(breakdownText);
			// Refresh data attribute used by SaveRecord/Submit so AJAX payload picks up the new breakdown
			$saRow.attr('data-container-breakdown', breakdownJson);
			$tctCell.attr('data-container-breakdown', breakdownJson);
		});

		// SA Reason change → propagate to checked items in that SA (only if item Reason is empty)
		jQuery(document).off('change.shortorder-reason', '.sa-reason').on('change.shortorder-reason', '.sa-reason', function () {
			var $saRow = jQuery(this).closest('tr.sa-row');
			var said = $saRow.attr('data-said');
			var newVal = jQuery(this).val();
			if (!newVal) return;
			jQuery('tr.item-row[data-said="' + said + '"]').each(function () {
				var $r = jQuery(this);
				if ($r.find('.item-sel').is(':checked')) {
					var $itemReason = $r.find('.item-reason');
					if (!$itemReason.val()) $itemReason.val(newVal);
				}
			});
		});
	} catch (e) {
		// no-op
	}
}

/**
 * Function to be executed when field is changed.
 *
 * @param {Object} scriptContext
 * @param {Record} scriptContext.currentRecord - Current form record
 * @param {string} scriptContext.sublistId - Sublist name
 * @param {string} scriptContext.fieldId - Field name
 * @param {number} scriptContext.lineNum - Line number. Will be undefined if not a sublist or matrix field
 * @param {number} scriptContext.columnNum - Line number. Will be undefined if not a matrix field
 *
 * @since 2015.2
 */
function FieldChanged(scriptContext) {
	// Grid rendered via inlinehtml — no sublist field events to handle here.
	// All cascade logic lives in PageInit's jQuery DOM event handlers.
}

/**
 * Validation function to be executed when record is saved.
 *
 * @param {Object} scriptContext
 * @param {Record} scriptContext.currentRecord - Current form record
 * @returns {boolean} Return true if record is valid
 *
 * @since 2015.2
 */
function SaveRecord(scriptContext) {
	var currentRecord = scriptContext.currentRecord;

	// Detect page: only the grid page (step='submitted') has .item-sel checkboxes.
	// On Filter page (no step) or other pages → no .item-sel → skip grid validation.
	var hasGrid = false;
	try { hasGrid = jQuery('.item-sel').length > 0; } catch (e) { hasGrid = false; }
	if (!hasGrid) return true;

	// ----- Validate: at least one Item (and at least one Plan/Load under it) must be selected
	try {
		var checkedItems = jQuery('.item-sel:checked').length;
		var checkedPls = jQuery('.pl-sel:checked').length;
		if (checkedItems === 0 || checkedPls === 0) {
			var msg = 'กรุณาเลือก Item และ Plan/Load อย่างน้อย 1 รายการก่อน Submit';
			try { dialog.alert({title: 'No Selection', message: msg}); }
			catch (e) { alert(msg); }
			return false;
		}
	} catch (e) { /* if jQuery not ready, fall through to other checks */ }

	// ----- Validate: every checked Item line must have a Reason filled
	var missing = [];
	try {
		jQuery('.item-sel:checked').each(function () {
			var $row = jQuery(this).closest('tr.item-row');
			var reason = $row.find('.item-reason').val();
			if (!reason) {
				var said = $row.attr('data-said');
				var lineid = $row.attr('data-lineid');
				var $saRow = jQuery('tr.sa-row[data-said="' + said + '"]');
				var docNum = jQuery.trim($saRow.find('td').eq(2).text()) || said;
				missing.push('• ' + docNum + ' (Line ' + lineid + ')');
			}
		});
	} catch (e) {
		return true;
	}

	if (missing.length > 0) {
		var msg = 'กรุณาเลือก Reason ให้ Line Item ที่ติ๊กไว้:<br><br>' + missing.join('<br>');
		try {
			dialog.alert({title: 'Validation Error', message: msg});
		} catch (e) {
			alert('กรุณาเลือก Reason ให้ Line Item ที่ติ๊กไว้:\n\n' + missing.join('\n'));
		}
		return false;
	}

	// ----- Build payload: ONLY selected items + ONLY selected plan/loads
	//        + group container breakdown by SA from SELECTED pl-rows
	try {
		// PASS 1 — group selected data per SA (so we can compute SA-level container breakdown
		//          from selected pl-rows only)
		var saAggMap = {};  // {said: {containerBySize: {}, items: [...]}}
		var saOrder = [];

		jQuery('.item-sel:checked').each(function () {
			var $row = jQuery(this).closest('tr.item-row');
			var said = $row.attr('data-said');
			var saLineId = $row.attr('data-lineid');
			var $saRow = jQuery('tr.sa-row[data-said="' + said + '"]');
			var $reasonSel = $row.find('.item-reason');
			var reasonId = $reasonSel.val();
			var reasonText = $reasonSel.find('option:selected').text();
			var itemText = jQuery.trim($row.find('td').eq(1).text());
			var saQty = jQuery.trim($row.find('td').eq(2).text());
			// Take displayed page-2 values directly (do NOT recompute on preview)
			var pageTotalQtyShippedDisp = jQuery.trim($row.find('td').eq(3).text());     // Qty Shipped on item-row (already excludes inactive)
			var pageTotalContainerDisp = jQuery.trim($saRow.find('td').eq(9).text());   // Total Container
			var pageTotalContainerTextDisp = jQuery.trim($saRow.find('td').eq(10).text()); // Total Container (Text)

			// Gather ALL plan/loads under this item-row (with `selected` flag) —
			// preview shows every line + marks which were selected; ajaxsync filters by selected.
			var $plChildren = jQuery('tr.item-children[data-said="' + said + '"][data-lineid="' + saLineId + '"]');
			var planLoads = [];
			var anySelected = false;
			$plChildren.find('tr.pl-row').each(function () {
				var $pl = jQuery(this);
				var isSelected = $pl.find('.pl-sel').is(':checked');
				if (isSelected) anySelected = true;
				planLoads.push({
					selected: isSelected,
					planLoadId: $pl.attr('data-pl-id') || '',
					waveLineId: $pl.find('.col-wave-line').data('wave-line') != null ? String($pl.find('.col-wave-line').data('wave-line')) : '',
					toId: $pl.find('.col-to-id').data('to-id') != null ? String($pl.find('.col-to-id').data('to-id')) : '',
					toLineId: $pl.find('.col-to-line').data('to-line') != null ? String($pl.find('.col-to-line').data('to-line')) : '',
					// pl-row column indices (after adding Do not Cal Conv + NW + GW columns):
					// 0:Sel 1:PlanLoad 2:ShortCon 3:ConIndex 4:ConSize 5:ConName1
					// 6:SealNo1 7:QtyPlanLoad 8:SalesUnit 9:ConvPal(PL) 10:ConvRoll(PL)
					// 11:RefTransferOrder 12:ToLine(hidden) 13:ToId(hidden) 14:WaveNo
					// 15:WaveLine(hidden) 16:RefItemFulfillment 17:QtyShipped 18:Unit
					// 19:DoNotCalConv(checkbox) 20:ConvPal(IF)(input) 21:ConvRoll(IF)(input)
					// 22:NetWeight(input) 23:GrossWeight(input) 24:Inactive
					planLoad: jQuery.trim($pl.find('td').eq(1).text()),    // Plan Load
					// col 2 = Short whole container checkbox
					conIndex: jQuery.trim($pl.find('td').eq(3).text()),    // Container Index
					conSize: jQuery.trim($pl.find('td').eq(4).text()),     // Container Size
					conName1: jQuery.trim($pl.find('td').eq(5).text()),    // Containers Number1
					sealNo1: jQuery.trim($pl.find('td').eq(6).text()),     // Seal No1
					qtyConfirm: jQuery.trim($pl.find('td').eq(7).text()),  // Qty (Plan Load)
					salesUnit: jQuery.trim($pl.find('td').eq(8).text()),   // Sales Unit
					convPal: jQuery.trim($pl.find('td').eq(9).text()),     // Conv.of Unit (PAL) — PL
					convRoll: jQuery.trim($pl.find('td').eq(10).text()),   // Conv.of Unit (Roll) — PL
					toText: jQuery.trim($pl.find('td').eq(11).text()),     // Ref. Transfer Order
					// indices 12, 13 = hidden col-to-line, col-to-id
					waveNo: jQuery.trim($pl.find('td').eq(14).text()),    // Ref. Wave No.
					// index 15 = hidden col-wave-line
					refFulfillment: jQuery.trim($pl.find('td').eq(16).text()),  // Ref. Item Fulfillment
					qtyShipped: jQuery.trim($pl.find('td').eq(17).text()),       // Qty Shipped
					uom: jQuery.trim($pl.find('td').eq(18).text()),              // Unit (UOM)
					// col 19 = Do not Cal Conv (disabled checkbox) — read flag
					convNotCal: $pl.find('.pl-do-not-cal-conv').is(':checked'),
					// cols 20-23 = inputs (editable only when convNotCal=true)
					convPalIF: jQuery.trim($pl.find('.pl-conv-pal-if').val() || ''),
					convRollIF: jQuery.trim($pl.find('.pl-conv-roll-if').val() || ''),
					netWeight: jQuery.trim($pl.find('.pl-net-weight').val() || ''),
					grossWeight: jQuery.trim($pl.find('.pl-gross-weight').val() || ''),
					inactive: jQuery.trim($pl.find('td').eq(24).text()),         // Inactive (Yes/No)
					shortCon: $pl.find('.pl-short-con').is(':checked'),          // Short whole container (current state)
				});
			});

			// If item has no selected pl-row at all → skip item (cascade should prevent this anyway)
			if (!anySelected) return;

			// Lazy-init SA bucket
			if (!saAggMap[said]) {
				// Read container breakdown JSON directly from page-2 data attribute
				// (page-2 already computed it excluding inactive)
				var pageBreakdownRaw = $saRow.attr('data-container-breakdown') || '[]';
				var pageBreakdown = [];
				try { pageBreakdown = JSON.parse(pageBreakdownRaw); } catch (e) { pageBreakdown = []; }

				saAggMap[said] = {
					said: said,
					saTranid: jQuery.trim($saRow.find('td').eq(2).text()),
					piDoc: jQuery.trim($saRow.find('td').eq(1).text()),
					customer: jQuery.trim($saRow.find('td').eq(4).text()),
					// Page-2 SA-level displayed values (capture once, share across items of this SA)
					totalContainerDisp: pageTotalContainerDisp,
					totalContainerTextDisp: pageTotalContainerTextDisp,
					containerBreakdown: pageBreakdown,
					items: [],
				};
				saOrder.push(said);
			}

			saAggMap[said].items.push({
				saLineId: saLineId,
				itemText: itemText,
				saQty: saQty,
				totalQtyShippedDisp: pageTotalQtyShippedDisp,  // page-2 displayed value (excludes inactive)
				reason: reasonId,
				reasonText: reasonText,
				planLoads: planLoads,
			});
		});

		// PASS 2 — flatten into payload (one entry per item-row, sharing SA-level fields)
		var payload = [];
		for (var so = 0; so < saOrder.length; so++) {
			var sa = saAggMap[saOrder[so]];
			for (var ii = 0; ii < sa.items.length; ii++) {
				var item = sa.items[ii];
				payload.push({
					said: sa.said,
					saTranid: sa.saTranid,
					piDoc: sa.piDoc,
					customer: sa.customer,
					// page-2 SA-level displayed values (no recompute on preview)
					totalContainerDisp: sa.totalContainerDisp,
					totalContainerTextDisp: sa.totalContainerTextDisp,
					saLineId: item.saLineId,
					itemText: item.itemText,
					saQty: item.saQty,
					totalQtyShippedDisp: item.totalQtyShippedDisp,
					reason: item.reason,
					reasonText: item.reasonText,
					containerBreakdown: sa.containerBreakdown,  // SA-level, from page-2 data attr
					planLoads: item.planLoads,                  // ALL pl-rows (with `selected` flag)
				});
			}
		}

		var payloadJson = JSON.stringify(payload);
		console.log('SaveRecord payload (' + payload.length + ' item-rows, ' + saOrder.length + ' SAs):', payload);
		currentRecord.setValue({fieldId: 'submit_payload', value: payloadJson});
	} catch (e) {
		console.error('SaveRecord build payload error:', e);
		// Allow save anyway — server will handle empty payload gracefully
	}

	return true;
}

// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// ########## Custom UI Functions
// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@

// ----- AJAX orchestrator: process each PL (Plan/Load) row with its own spinner.
//        Each AJAX = 1 PL → fresh 1000-unit governance budget (no Suitelet limit hit).
//        When the LAST PL of an SA completes successfully, fire save_sa_body for that SA.
function UI_startProcess() {
	try {
		var cr = nlCurrentRecord.get();
		var payloadRaw = cr.getValue('submit_payload') || '[]';
		var payload = JSON.parse(payloadRaw);

		// Flatten payload → group selected PLs by toId.
		// Multiple PLs sharing the same TO must be processed SEQUENTIALLY (server-side
		// record.load + record.save is not safe to interleave on the same record — NS
		// rejects the second save with "Record has been changed"). PLs on different
		// TOs can still run in parallel, capped by MAX_INFLIGHT.
		// Also build entriesBySaid (for save_sa_body) keyed by said.
		var toGroups = {};       // toId → [{said, reason, pl}, ...] (FIFO within a TO)
		var toIdsList = [];      // insertion-order list of toIds (for fair scheduling)
		var entriesBySaid = {};
		var totalPlCount = 0;
		for (var i = 0; i < payload.length; i++) {
			var e = payload[i];
			if (!entriesBySaid[e.said]) entriesBySaid[e.said] = [];
			entriesBySaid[e.said].push(e);

			var pls = e.planLoads || [];
			for (var pj = 0; pj < pls.length; pj++) {
				var p = pls[pj];
				if (!p.selected) continue;
				var toKey = p.toId || ('__no_to__' + p.planLoadId);
				if (!toGroups[toKey]) {
					toGroups[toKey] = [];
					toIdsList.push(toKey);
				}
				toGroups[toKey].push({
					said: e.said,
					reason: e.reason,
					pl: p,
				});
				totalPlCount++;
			}
		}

		if (totalPlCount === 0) {
			try { dialog.alert({title: 'Nothing to process', message: 'No selected PLs found in payload.'}); }
			catch (e) { alert('No selected PLs found in payload.'); }
			return;
		}

		var activeTos = {};  // toId → true while a PL of that TO is in flight (serialize same-TO)

		// Count selected PLs per SA → know when an SA is "done" → trigger save_sa_body
		var saTotalPls = {};
		var saDonePls = {};
		var saSuccessPls = {};
		for (var gi = 0; gi < toIdsList.length; gi++) {
			var grpItems = toGroups[toIdsList[gi]];
			for (var gj = 0; gj < grpItems.length; gj++) {
				var sd = grpItems[gj].said;
				saTotalPls[sd] = (saTotalPls[sd] || 0) + 1;
				saDonePls[sd] = 0;
				saSuccessPls[sd] = 0;
			}
		}

		// Resolve ajaxsync URL — use the page's <form action="..."> attribute (which
		// NS sets up with all required URL params like script/deploy/compid).
		var $form = jQuery('form').first();
		var ajaxUrl = $form.attr('action');
		if (!ajaxUrl) {
			var pathname = window.location.pathname;
			var search = window.location.search || '';
			search = search.replace(/([?&])step=[^&]*/g, function (m, prefix) { return prefix === '?' ? '?' : ''; });
			search = search.replace(/\?&/, '?').replace(/[?&]$/, '');
			ajaxUrl = pathname + search;
		}

		// Collect NS form hidden tokens (CSRF-like fields NS requires)
		var nsTokens = {};
		$form.find('input[type=hidden]').each(function () {
			var name = this.name || '';
			if (!name) return;
			if (name === 'step') return;
			if (name === 'submit_payload') return;
			nsTokens[name] = this.value;
		});

		// Disable Start Process button to prevent double-click
		jQuery('input[onclick*="UI_startProcess"]').prop('disabled', true);

		var MAX_INFLIGHT = 12;
		var inflight = 0;
		var spinnerImg = '';
		try { spinnerImg = libCode.runningImgContent(); } catch (e) {
			try { spinnerImg = libCode.startImgContent(); } catch (ee) {}
		}

		function setPlStatus(plid, icon, text, color) {
			var $img = jQuery('.pl-proc-img[data-plid="' + plid + '"]');
			var $state = jQuery('.pl-proc-state[data-plid="' + plid + '"]');
			$img.html(icon);
			$state.text(text || '');
			if (color) $state.css('color', color);
		}

		function setSaStatus(said, icon, text, color) {
			var $img = jQuery('.proc-img[data-said="' + said + '"]');
			var $state = jQuery('.proc-state[data-said="' + said + '"]');
			$img.html(icon);
			$state.text(text || '');
			if (color) $state.css('color', color);
		}

		function parseAjaxResponse(resp) {
			try {
				if (resp && typeof resp === 'object' && resp.constructor === Object) return resp;
				var body = (typeof resp === 'string') ? resp : (resp && resp.responseText) || String(resp);
				body = String(body).replace(/<!--[\s\S]*?-->/g, '').trim();
				return JSON.parse(body);
			} catch (e) {
				var snippet = '';
				try { snippet = (typeof resp === 'string' ? resp : JSON.stringify(resp)).substring(0, 200); } catch (ee) { snippet = String(resp); }
				return {ok: false, msg: 'Bad response: ' + snippet};
			}
		}

		function formatFailMsg(data) {
			if (data.failed && data.failed.length) {
				return data.failed.map(function (f) { return (f.type || '') + (f.id ? ' ' + f.id : '') + ': ' + (f.msg || ''); }).join('; ');
			}
			return data.msg || 'Failed';
		}

		// Fire save_sa_body for an SA after all its PLs have completed.
		function fireSaveSaBody(said) {
			setSaStatus(said, spinnerImg ? '<img src="' + spinnerImg + '" width="18">' : '⟳', 'Saving SA body...', '#1f4e79');
			var entries = entriesBySaid[said] || [];
			var postParams = jQuery.extend({}, nsTokens, {
				step: 'ajaxsync',
				action: 'save_sa_body',
				said: said,
				entry: JSON.stringify(entries),
			});
			jQuery.post(ajaxUrl, postParams).done(function (resp) {
				var data = parseAjaxResponse(resp);
				if (data.ok) {
					var nUpd = (data.updated || []).length;
					setSaStatus(said, '✓', 'Done (' + nUpd + ' SA update' + (nUpd === 1 ? '' : 's') + ')', '#2e7d32');
				} else {
					setSaStatus(said, '✗', formatFailMsg(data), '#c62828');
				}
			}).fail(function (jqXHR, textStatus, error) {
				var serverMsg = (jqXHR && jqXHR.responseText) ? String(jqXHR.responseText).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 300) : '';
				var statusCode = jqXHR && jqXHR.status ? jqXHR.status : '';
				setSaStatus(said, '✗', 'Error' + (statusCode ? ' ' + statusCode : '') + ': ' + (serverMsg || error || 'request failed'), '#c62828');
			});
		}

		// Pick the next PL to fire: a toGroup that has remaining items and is not currently
		// being processed (activeTos[toId] === false). Returns null if no eligible work.
		function pickNextItem() {
			for (var ti = 0; ti < toIdsList.length; ti++) {
				var tid = toIdsList[ti];
				if (activeTos[tid]) continue;
				var grp = toGroups[tid];
				if (grp && grp.length > 0) {
					activeTos[tid] = true;
					return {toKey: tid, item: grp.shift()};
				}
			}
			return null;
		}

		function fireOne() {
			while (inflight < MAX_INFLIGHT) {
				var picked = pickNextItem();
				if (!picked) break;
				var toKey = picked.toKey;
				var item = picked.item;
				inflight++;
				var said = item.said;
				var pl = item.pl;
				var plid = pl.planLoadId;

				setPlStatus(plid, spinnerImg ? '<img src="' + spinnerImg + '" width="18">' : '⟳', 'Processing...', '#1f4e79');

				(function (saidLocal, plidLocal, itemLocal, toKeyLocal) {
					var postParams = jQuery.extend({}, nsTokens, {
						step: 'ajaxsync',
						action: 'process_pl',
						said: saidLocal,
						entry: JSON.stringify({reason: itemLocal.reason, pl: itemLocal.pl}),
					});
					jQuery.post(ajaxUrl, postParams).done(function (resp) {
						var data = parseAjaxResponse(resp);
						saDonePls[saidLocal] = (saDonePls[saidLocal] || 0) + 1;
						if (data.ok) {
							saSuccessPls[saidLocal] = (saSuccessPls[saidLocal] || 0) + 1;
							var nUpd = (data.updated || []).length;
							setPlStatus(plidLocal, '✓', 'Done (' + nUpd + ')', '#2e7d32');
						} else {
							setPlStatus(plidLocal, '✗', formatFailMsg(data), '#c62828');
						}
						// If this was the last PL for the SA → save_sa_body (only if at least 1 PL succeeded)
						if (saDonePls[saidLocal] === saTotalPls[saidLocal]) {
							if (saSuccessPls[saidLocal] > 0) {
								fireSaveSaBody(saidLocal);
							} else {
								setSaStatus(saidLocal, '✗', 'No PL succeeded — SA body not saved', '#c62828');
							}
						}
						activeTos[toKeyLocal] = false;
						inflight--;
						fireOne();
					}).fail(function (jqXHR, textStatus, error) {
						var serverMsg = '';
						try {
							if (jqXHR && jqXHR.responseText) {
								var raw = String(jqXHR.responseText).replace(/<!--[\s\S]*?-->/g, '').trim();
								try {
									var parsed = JSON.parse(raw);
									serverMsg = parsed.msg || JSON.stringify(parsed);
								} catch (e2) {
									serverMsg = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 300);
								}
							}
						} catch (e) {}
						var statusCode = jqXHR && jqXHR.status ? jqXHR.status : '';
						var fullMsg = 'Error' + (statusCode ? ' ' + statusCode : '') + (textStatus ? ' [' + textStatus + ']' : '') + ': ' + (serverMsg || error || 'request failed');
						console.error('AJAX fail [pl ' + plidLocal + ']', jqXHR, textStatus, error);
						setPlStatus(plidLocal, '✗', fullMsg, '#c62828');
						saDonePls[saidLocal] = (saDonePls[saidLocal] || 0) + 1;
						if (saDonePls[saidLocal] === saTotalPls[saidLocal]) {
							if (saSuccessPls[saidLocal] > 0) {
								fireSaveSaBody(saidLocal);
							} else {
								setSaStatus(saidLocal, '✗', 'No PL succeeded — SA body not saved', '#c62828');
							}
						}
						activeTos[toKeyLocal] = false;
						inflight--;
						fireOne();
					});
				})(said, plid, item, toKey);
			}
		}
		fireOne();
	} catch (e) {
		console.error('UI_startProcess error:', e);
		try { dialog.alert({title: 'Start Process Error', message: e.message || String(e)}); }
		catch (ee) { alert('Start Process Error: ' + (e.message || e)); }
	}
}

function UI_btnBackToFilter() {
	// Navigate to filter page (step='') by manually constructing the URL
	// with script + deploy + compid pulled from BOTH the form's hidden
	// inputs AND the page's query string (whichever has them).
	try {
		var script = '', deploy = '', compid = '';

		// Source 1: form hidden inputs (NS Suitelet form has these)
		var $form = jQuery('form').first();
		if ($form.length) {
			var fe = $form[0];
			if (fe.elements['script']) script = fe.elements['script'].value || '';
			if (fe.elements['deploy']) deploy = fe.elements['deploy'].value || '';
			if (fe.elements['compid']) compid = fe.elements['compid'].value || '';
		}

		// Source 2: URL query string (fill in any blanks)
		var qs = window.location.search || '';
		function readQ(name) {
			var m = qs.match(new RegExp('[?&]' + name + '=([^&]*)'));
			return m ? decodeURIComponent(m[1]) : '';
		}
		if (!script) script = readQ('script');
		if (!deploy) deploy = readQ('deploy');
		if (!compid) compid = readQ('compid');

		// Source 3: fall back to constant for script
		if (!script) script = SUITESCRIPT_ID;

		var pathname = window.location.pathname || '/app/site/hosting/scriptlet.nl';
		var parts = [];
		if (script) parts.push('script=' + encodeURIComponent(script));
		if (deploy) parts.push('deploy=' + encodeURIComponent(deploy));
		if (compid) parts.push('compid=' + encodeURIComponent(compid));
		parts.push('step=');  // empty step → filter form

		var targetUrl = pathname + '?' + parts.join('&');
		console.log('UI_btnBackToFilter →', targetUrl);

		window.onbeforeunload = null;
		window.location.href = targetUrl;
	} catch (e) {
		console.error('UI_btnBackToFilter error', e);
		window.onbeforeunload = null;
		window.history.back();
	}
}
