/**
 * Spreadsheet-style keyboard navigation and clipboard for table grids.
 *
 * - handleCellKeyDown: call from onKeyDown on any input/select in a table cell.
 *   Handles ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Tab, Shift+Tab, Enter.
 *
 * - useGridClipboard: attach to a table container ref. Handles Ctrl+C (copy full
 *   cell value when nothing is selected) and Ctrl+V (single-cell native for inputs;
 *   multi-cell rectangular paste of tab/newline-separated values).
 */

import { useEffect, type RefObject } from "react";

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

// ── Public: clipboard hook ──────────────────────────────────────────────

/**
 * Attach to a table container for copy/paste support.
 * - Ctrl+C: copies full cell value when no text is selected, or select option text.
 * - Ctrl+V: single-cell paste is native for inputs. Multi-cell paste (tab/newline
 *   separated) fills a rectangular range from the focused cell.
 */
export function useGridClipboard(
  containerRef: RefObject<HTMLElement | null>,
  readOnly: boolean
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function handleCopy(e: ClipboardEvent) {
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

    container.addEventListener("copy", handleCopy);
    container.addEventListener("paste", handlePaste);
    return () => {
      container.removeEventListener("copy", handleCopy);
      container.removeEventListener("paste", handlePaste);
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
