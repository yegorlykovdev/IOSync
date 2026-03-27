/**
 * Spreadsheet-style keyboard navigation, multi-cell selection, and clipboard
 * for table grids.
 *
 * - handleCellKeyDown: call from onKeyDown on any input/select in a table cell.
 *   Handles ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Tab, Shift+Tab, Enter.
 *
 * - useGridClipboard: attach to a table container ref. Provides:
 *   • Rectangular multi-cell selection (click-drag or Shift+click)
 *   • Ctrl+C / Cmd+C: copies selected rectangle as tab/newline-separated TSV,
 *     or single cell value when no selection exists
 *   • Ctrl+V / Cmd+V: single-cell native for inputs; multi-cell rectangular
 *     paste of tab/newline-separated values from the focused cell
 */

import { useEffect, useRef, type RefObject } from "react";

// ── Constants ────────────────────────────────────────────────────────────

const SELECTED_CLASS = "grid-cell-selected";

// ── DOM helpers ─────────────────────────────────────────────────────────

function getEditable(td: Element): HTMLInputElement | HTMLSelectElement | null {
  return td.querySelector<HTMLInputElement | HTMLSelectElement>(
    "input:not([disabled]):not([type='checkbox']), select:not([disabled])"
  );
}

function getTbodyRows(el: Element): HTMLTableRowElement[] {
  const tbody = el.closest("tbody");
  if (!tbody) return [];
  return Array.from(tbody.querySelectorAll<HTMLTableRowElement>(":scope > tr"));
}

function cellIndex(td: Element): number {
  const row = td.closest("tr");
  if (!row) return -1;
  return Array.from(row.children).indexOf(td as Element);
}

function focusEditable(el: HTMLInputElement | HTMLSelectElement) {
  el.focus();
  if (el instanceof HTMLInputElement) el.select();
}

function shouldMoveHorizontally(
  direction: "left" | "right",
  active: HTMLElement
): boolean {
  if (active instanceof HTMLSelectElement) return true;
  if (!(active instanceof HTMLInputElement)) return false;

  const { selectionStart, selectionEnd, value } = active;
  if (selectionStart === null || selectionEnd === null) return false;

  const fullySelected = selectionStart === 0 && selectionEnd === value.length;
  if (fullySelected) return true;

  if (direction === "left") {
    return selectionStart === 0 && selectionEnd === 0;
  }

  return selectionStart === value.length && selectionEnd === value.length;
}

/** Extract the display value from a table cell (input, select, or text content). */
function getCellValue(td: Element): string {
  const ed = getEditable(td);
  if (ed instanceof HTMLInputElement) return ed.value;
  if (ed instanceof HTMLSelectElement) {
    const text = ed.options[ed.selectedIndex]?.text ?? "";
    return text === "—" ? "" : text;
  }
  // Read-only cell: use text content
  return td.textContent?.trim() ?? "";
}

// ── Grid movement ───────────────────────────────────────────────────────

function move(
  direction: "up" | "down" | "left" | "right",
  origin: Element
): boolean {
  const td = origin.closest("td");
  if (!td) return false;
  const row = td.closest("tr");
  if (!row) return false;
  const col = cellIndex(td);
  const rows = getTbodyRows(td);
  const ri = rows.indexOf(row as HTMLTableRowElement);
  if (ri === -1) return false;

  // Blur origin so its onBlur/commit fires before we navigate
  if (origin instanceof HTMLInputElement || origin instanceof HTMLSelectElement) {
    origin.blur();
  }

  if (direction === "up" || direction === "down") {
    const targetRi = direction === "up" ? ri - 1 : ri + 1;
    if (targetRi < 0 || targetRi >= rows.length) return false;
    const targetTd = rows[targetRi].children[col];
    if (!targetTd) return false;
    const ed = getEditable(targetTd);
    if (ed) {
      focusEditable(ed);
      return true;
    }
    return false;
  }

  // left / right: find next editable cell, wrapping to adjacent row
  const step = direction === "right" ? 1 : -1;
  const cells = Array.from(row.children);

  for (let i = col + step; i >= 0 && i < cells.length; i += step) {
    const ed = getEditable(cells[i]);
    if (ed) {
      focusEditable(ed);
      return true;
    }
  }

  // Wrap to adjacent row
  const nextRi = ri + step;
  if (nextRi >= 0 && nextRi < rows.length) {
    const nextCells = Array.from(rows[nextRi].children);
    const start = step === 1 ? 0 : nextCells.length - 1;
    for (let i = start; i >= 0 && i < nextCells.length; i += step) {
      const ed = getEditable(nextCells[i]);
      if (ed) {
        focusEditable(ed);
        return true;
      }
    }
  }

  return false;
}

// ── Selection helpers ───────────────────────────────────────────────────

interface SelectionRect {
  anchorRow: number;
  anchorCol: number;
  currentRow: number;
  currentCol: number;
  /** The tbody that owns this selection */
  tbody: HTMLTableSectionElement;
}

function selectionBounds(sel: SelectionRect) {
  return {
    minRow: Math.min(sel.anchorRow, sel.currentRow),
    maxRow: Math.max(sel.anchorRow, sel.currentRow),
    minCol: Math.min(sel.anchorCol, sel.currentCol),
    maxCol: Math.max(sel.anchorCol, sel.currentCol),
  };
}

function clearSelectionHighlight(container: Element) {
  container
    .querySelectorAll(`.${SELECTED_CLASS}`)
    .forEach((el) => el.classList.remove(SELECTED_CLASS));
}

function paintSelection(sel: SelectionRect) {
  const { minRow, maxRow, minCol, maxCol } = selectionBounds(sel);
  const rows = Array.from(
    sel.tbody.querySelectorAll<HTMLTableRowElement>(":scope > tr")
  );
  for (let r = minRow; r <= maxRow; r++) {
    if (r >= rows.length) break;
    const cells = rows[r].children;
    for (let c = minCol; c <= maxCol; c++) {
      if (c >= cells.length) break;
      cells[c].classList.add(SELECTED_CLASS);
    }
  }
}

function isSingleCell(sel: SelectionRect): boolean {
  return sel.anchorRow === sel.currentRow && sel.anchorCol === sel.currentCol;
}

function serializeSelection(sel: SelectionRect): string {
  const { minRow, maxRow, minCol, maxCol } = selectionBounds(sel);
  const rows = Array.from(
    sel.tbody.querySelectorAll<HTMLTableRowElement>(":scope > tr")
  );
  const lines: string[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    if (r >= rows.length) break;
    const cells = rows[r].children;
    const cols: string[] = [];
    for (let c = minCol; c <= maxCol; c++) {
      if (c >= cells.length) {
        cols.push("");
      } else {
        cols.push(getCellValue(cells[c]));
      }
    }
    lines.push(cols.join("\t"));
  }
  return lines.join("\n");
}

// ── Public: cell keydown handler ────────────────────────────────────────

/**
 * Call from onKeyDown on any input/select inside a table cell.
 * Handles ArrowUp, ArrowDown, Tab, Shift+Tab, Enter.
 */
export function handleCellKeyDown(e: React.KeyboardEvent<HTMLElement>) {
  const active = e.currentTarget;

  switch (e.key) {
    case "ArrowUp":
      // Let selects use native arrow behavior
      if (active instanceof HTMLSelectElement) return;
      if (move("up", active)) e.preventDefault();
      break;
    case "ArrowDown":
      if (active instanceof HTMLSelectElement) return;
      if (move("down", active)) e.preventDefault();
      break;
    case "ArrowLeft":
      if (shouldMoveHorizontally("left", active) && move("left", active)) {
        e.preventDefault();
      }
      break;
    case "ArrowRight":
      if (shouldMoveHorizontally("right", active) && move("right", active)) {
        e.preventDefault();
      }
      break;
    case "Tab":
      if (move(e.shiftKey ? "left" : "right", active)) e.preventDefault();
      break;
    case "Enter":
      if (move("down", active)) e.preventDefault();
      break;
  }
}

// ── Public: clipboard + selection hook ───────────────────────────────────

/**
 * Attach to a table container for multi-cell selection, copy, and paste.
 *
 * Selection:
 * - Click a cell to start selection (blurs any active input)
 * - Drag to extend to a rectangular range
 * - Shift+click to extend from the anchor cell
 * - Escape or clicking into an input to edit clears the selection
 *
 * Copy (Ctrl/Cmd+C):
 * - With selection: copies the rectangle as tab/newline TSV
 * - Without selection: copies the focused cell value
 *
 * Paste (Ctrl/Cmd+V):
 * - Multi-cell paste (tab/newline separated) fills from the focused cell
 * - Single-cell paste is native for inputs; matches option text for selects
 */
export function useGridClipboard(
  containerRef: RefObject<HTMLElement | null>,
  readOnly: boolean
) {
  const selectionRef = useRef<SelectionRect | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── Selection helpers (local) ─────────────────────────────────────

    function clearSel() {
      selectionRef.current = null;
      clearSelectionHighlight(container!);
    }

    function updateSel(sel: SelectionRect) {
      clearSelectionHighlight(container!);
      selectionRef.current = sel;
      paintSelection(sel);
    }

    function findCellAt(target: EventTarget | null): { td: HTMLTableCellElement; row: number; col: number; tbody: HTMLTableSectionElement } | null {
      if (!(target instanceof Element)) return null;
      const td = target.closest("td") as HTMLTableCellElement | null;
      if (!td || !container!.contains(td)) return null;
      const tr = td.closest("tr");
      if (!tr) return null;
      const tbody = tr.closest("tbody");
      if (!tbody) return null;
      const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>(":scope > tr"));
      const row = rows.indexOf(tr as HTMLTableRowElement);
      if (row === -1) return null;
      const col = cellIndex(td);
      return { td, row, col, tbody };
    }

    // ── Mouse handlers ────────────────────────────────────────────────

    function handleMouseDown(e: MouseEvent) {
      // Only primary button
      if (e.button !== 0) return;

      // Don't intercept clicks on checkboxes
      if (e.target instanceof HTMLInputElement && e.target.type === "checkbox") return;

      const cell = findCellAt(e.target);
      if (!cell) return;

      // If the user clicked directly on an already-focused input/select, let them edit
      const activeEl = document.activeElement;
      if (
        activeEl instanceof HTMLInputElement &&
        activeEl.type !== "checkbox" &&
        cell.td.contains(activeEl) &&
        e.target === activeEl
      ) {
        clearSel();
        return;
      }

      // Shift+click extends from existing anchor
      if (e.shiftKey && selectionRef.current && selectionRef.current.tbody === cell.tbody) {
        e.preventDefault();
        updateSel({
          ...selectionRef.current,
          currentRow: cell.row,
          currentCol: cell.col,
        });
        return;
      }

      // Start new selection
      e.preventDefault();

      // Blur active input so its commit fires
      if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLSelectElement) {
        activeEl.blur();
      }

      draggingRef.current = true;
      updateSel({
        anchorRow: cell.row,
        anchorCol: cell.col,
        currentRow: cell.row,
        currentCol: cell.col,
        tbody: cell.tbody,
      });
    }

    function handleMouseMove(e: MouseEvent) {
      if (!draggingRef.current || !selectionRef.current) return;

      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return;
      const td = el.closest("td") as HTMLTableCellElement | null;
      if (!td || !container!.contains(td)) return;

      const tr = td.closest("tr");
      if (!tr) return;
      const tbody = tr.closest("tbody");
      if (tbody !== selectionRef.current.tbody) return;

      const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>(":scope > tr"));
      const row = rows.indexOf(tr as HTMLTableRowElement);
      if (row === -1) return;
      const col = cellIndex(td);

      if (row !== selectionRef.current.currentRow || col !== selectionRef.current.currentCol) {
        updateSel({
          ...selectionRef.current,
          currentRow: row,
          currentCol: col,
        });
      }
    }

    function handleMouseUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;

      // If single cell click (no drag), focus the editable element for editing
      const sel = selectionRef.current;
      if (sel && isSingleCell(sel)) {
        const rows = Array.from(sel.tbody.querySelectorAll<HTMLTableRowElement>(":scope > tr"));
        const td = rows[sel.anchorRow]?.children[sel.anchorCol];
        if (td) {
          const ed = getEditable(td);
          if (ed) {
            clearSel();
            focusEditable(ed);
            return;
          }
        }
      }
    }

    // ── Keyboard ──────────────────────────────────────────────────────

    function handleKeyDown(e: KeyboardEvent) {
      // Escape clears selection
      if (e.key === "Escape" && selectionRef.current) {
        clearSel();
        return;
      }
    }

    // When an input/select gains focus (user tabbed or clicked into edit mode), clear selection
    function handleFocusIn(e: FocusEvent) {
      if (
        e.target instanceof HTMLInputElement &&
        e.target.type !== "checkbox" &&
        container!.contains(e.target)
      ) {
        if (selectionRef.current && !draggingRef.current) {
          clearSel();
        }
      } else if (
        e.target instanceof HTMLSelectElement &&
        container!.contains(e.target)
      ) {
        if (selectionRef.current && !draggingRef.current) {
          clearSel();
        }
      }
    }

    // ── Copy ──────────────────────────────────────────────────────────

    function handleCopy(e: ClipboardEvent) {
      // Multi-cell selection copy takes priority
      const sel = selectionRef.current;
      if (sel && !isSingleCell(sel)) {
        e.preventDefault();
        const tsv = serializeSelection(sel);
        e.clipboardData?.setData("text/plain", tsv);
        return;
      }

      // Fall through to single-cell copy
      const active = document.activeElement;
      if (
        !active ||
        !container!.contains(active) ||
        !(active instanceof HTMLInputElement || active instanceof HTMLSelectElement)
      )
        return;

      // If input has a partial text selection, let browser copy natively
      if (active instanceof HTMLInputElement) {
        const { selectionStart, selectionEnd } = active;
        if (
          selectionStart !== null &&
          selectionEnd !== null &&
          selectionStart !== selectionEnd
        )
          return;

        // No selection — copy entire cell value
        if (active.value) {
          e.preventDefault();
          e.clipboardData?.setData("text/plain", active.value);
        }
        return;
      }

      // Select — copy displayed option text
      if (active instanceof HTMLSelectElement) {
        const text = active.options[active.selectedIndex]?.text ?? "";
        if (text && text !== "—") {
          e.preventDefault();
          e.clipboardData?.setData("text/plain", text);
        }
      }
    }

    // ── Paste ─────────────────────────────────────────────────────────

    function handlePaste(e: ClipboardEvent) {
      if (readOnly) return;
      const active = document.activeElement;
      if (!active || !container!.contains(active)) return;

      const text = e.clipboardData?.getData("text/plain");
      if (!text) return;

      // Parse clipboard as TSV (rows split by newline, columns by tab)
      const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
      const isMultiCell = lines.length > 1 || lines[0].includes("\t");

      if (!isMultiCell) {
        // Single value — let browser handle for inputs
        if (active instanceof HTMLInputElement) return;

        // For selects, try to match pasted text to an option
        if (active instanceof HTMLSelectElement) {
          e.preventDefault();
          matchSelectOption(active, text.trim());
        }
        return;
      }

      // ── Multi-cell paste ──────────────────────────────────────────
      e.preventDefault();

      const td = active.closest("td");
      if (!td) return;
      const row = td.closest("tr");
      if (!row) return;
      const startCol = cellIndex(td);
      const rows = getTbodyRows(td);
      const startRow = rows.indexOf(row as HTMLTableRowElement);

      for (let r = 0; r < lines.length; r++) {
        const cols = lines[r].split("\t");
        const targetRowIdx = startRow + r;
        if (targetRowIdx >= rows.length) break;
        const targetRow = rows[targetRowIdx];

        for (let c = 0; c < cols.length; c++) {
          const targetCol = startCol + c;
          if (targetCol >= targetRow.children.length) break;

          const ed = getEditable(targetRow.children[targetCol]);
          if (!ed) continue;

          setCellValue(ed, cols[c].trim());
        }
      }
    }

    // ── Attach listeners ──────────────────────────────────────────────

    container.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    container.addEventListener("keydown", handleKeyDown);
    container.addEventListener("focusin", handleFocusIn);
    container.addEventListener("copy", handleCopy);
    container.addEventListener("paste", handlePaste);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      container.removeEventListener("keydown", handleKeyDown);
      container.removeEventListener("focusin", handleFocusIn);
      container.removeEventListener("copy", handleCopy);
      container.removeEventListener("paste", handlePaste);
      clearSel();
    };
  }, [containerRef, readOnly]);
}

// ── Helpers for programmatic cell value setting ─────────────────────────

const nativeInputSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "value"
)!.set!;

/** Set an input or select value programmatically, triggering React handlers. */
function setCellValue(
  el: HTMLInputElement | HTMLSelectElement,
  value: string
) {
  if (el instanceof HTMLInputElement) {
    // Use native setter + events so React's onChange fires
    nativeInputSetter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    // Trigger blur → commit/save
    el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
  } else if (el instanceof HTMLSelectElement) {
    matchSelectOption(el, value);
  }
}

function matchSelectOption(select: HTMLSelectElement, text: string) {
  const lower = text.toLowerCase();
  const option = Array.from(select.options).find(
    (o) => o.value === text || o.text.toLowerCase() === lower
  );
  if (option) {
    select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
}
