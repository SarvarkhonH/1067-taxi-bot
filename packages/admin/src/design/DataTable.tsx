// ═══════════════════════════════════════════════════════════════════════════
// 📋 DataTable — v2 ning eng ko'p ishlatiladigan komponenti.
//
// Eski panelda har ko'rinish o'z <table> ini inline stil bilan qo'lda yozardi
// va NATIJADA: 0 ta saralanadigan jadval, har xil qidiruv xatti-harakati,
// eksport 27 joyda qo'lda, ommaviy amal umuman yo'q.
//
// Bu yerda hammasi bir marta: saralash · qidiruv · filtr-chiplar · sahifalash ·
// ko'p-tanlov + ommaviy amal paneli · CSV · qator→drill-down · zich rejim ·
// skeleton/bo'sh/xato holatlari.
// ═══════════════════════════════════════════════════════════════════════════
import type { ReactNode } from "react";
import { Button, Empty, ErrorState, SearchInput, cssVar } from "./kit";
import { csvName, downloadCsv } from "../lib/csv";
import { useTable, type UseTableOpts } from "../lib/useTable";

export interface Column<T> {
  key: string;
  label: string;
  /** Katak mazmuni. Berilmasa `String(row[key])`. */
  render?: (row: T) => ReactNode;
  /** CSV uchun xom qiymat (render JSX bo'lishi mumkin). */
  csv?: (row: T) => string | number | null | undefined;
  /** Saralash qiymati. Berilsa ustun saralanadi. */
  sort?: (row: T) => string | number | null | undefined;
  align?: "num" | "mid";
  /** Ustun kengligi (px yoki %). */
  width?: string;
  /** Kichik ekranda yashiriladi. */
  hideSmall?: boolean;
}

export interface FilterChip {
  label: string;
  active: boolean;
  onClick: () => void;
}

export function DataTable<T>({
  rows,
  columns,
  error,
  onRetry,
  rowKey,
  onRowClick,
  rowTone,
  searchText,
  searchPlaceholder,
  chips,
  toolbar,
  bulkActions,
  exportName,
  emptyTitle = "Hech narsa topilmadi",
  emptySub,
  dense,
  pageSize = 50,
  initialSort,
}: {
  rows: T[] | null | undefined;
  columns: Column<T>[];
  error?: string | null;
  onRetry?: () => void;
  /** Ko'p-tanlov va React kaliti uchun barqaror id. */
  rowKey?: (row: T) => string | number;
  /** Qator bosilganda — odatda drill-down panelini ochadi. */
  onRowClick?: (row: T) => void;
  /** Qatorni chap qirrasida belgilash (tiqilib qolgan / bloklangan). */
  rowTone?: (row: T) => "bad" | "warn" | undefined;
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  chips?: FilterChip[];
  /** Qidiruv o'ngidagi qo'shimcha boshqaruvlar. */
  toolbar?: ReactNode;
  /** Tanlangan qatorlar ustidan amallar. */
  bulkActions?: (selected: T[], clear: () => void) => ReactNode;
  /** CSV fayl nomi asosi. Berilmasa eksport tugmasi ko'rinmaydi. */
  exportName?: string;
  emptyTitle?: string;
  emptySub?: string;
  dense?: boolean;
  pageSize?: number;
  initialSort?: UseTableOpts<T>["initialSort"];
}) {
  const t = useTable<T>({
    rows,
    searchText,
    sortValue: (row, key) => columns.find((c) => c.key === key)?.sort?.(row),
    pageSize,
    initialSort,
    rowKey,
  });

  const loading = rows == null && !error;

  const exportCsv = (): void => {
    const cols = columns.filter((c) => c.csv || c.sort || !c.render);
    downloadCsv(
      csvName(exportName ?? "jadval"),
      cols.map((c) => c.label),
      // Eksport HAR DOIM ko'rinayotgan (filtrlangan+saralangan) TO'LIQ ro'yxat,
      // faqat joriy sahifa emas — operator "eksport" bosганда shu kutiladi.
      t.allRows.map((r) => cols.map((c) => (c.csv ? c.csv(r) : c.sort ? c.sort(r) : String((r as Record<string, unknown>)[c.key] ?? "")))),
    );
  };

  const hasSelection = t.selected.size > 0;

  return (
    <div className="tb-wrap">
      {hasSelection && bulkActions ? (
        <div className="tb-bulk">
          <span className="tb-bulk-n">{t.selected.size} ta tanlandi</span>
          {bulkActions(t.selectedRows, t.clearSelection)}
          <div className="a2-spacer" />
          <Button size="sm" variant="ghost" onClick={t.clearSelection}>
            Bekor qilish
          </Button>
        </div>
      ) : (
        <div className="tb-tools">
          {searchText && (
            <SearchInput value={t.q} onChange={t.setQ} placeholder={searchPlaceholder ?? "Qidirish…"} />
          )}
          {chips?.map((c) => (
            <Button key={c.label} size="sm" variant={c.active ? "primary" : "ghost"} onClick={c.onClick}>
              {c.label}
            </Button>
          ))}
          {toolbar}
          <div className="a2-spacer" />
          <span className="tb-count">
            {t.total === t.rawTotal ? `${t.total} ta` : `${t.total} / ${t.rawTotal} ta`}
          </span>
          {exportName && (
            <Button size="sm" variant="ghost" onClick={exportCsv} disabled={t.total === 0} title="Ko'rinayotgan barcha qatorlarni CSV'ga">
              ⤓ CSV
            </Button>
          )}
        </div>
      )}

      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : !loading && t.total === 0 ? (
        <Empty
          title={emptyTitle}
          sub={emptySub ?? (t.q ? "Qidiruvni o'zgartiring yoki filtrlarni tozalang." : undefined)}
          action={t.q ? <Button size="sm" onClick={() => t.setQ("")}>Qidiruvni tozalash</Button> : undefined}
        />
      ) : (
        <div className="tb-scroll">
          <table className={`tb${dense ? " tb-dense" : ""}${onRowClick ? " tb-clickable" : ""}`}>
            <thead>
              <tr>
                {rowKey && bulkActions && (
                  <th className="tb-check">
                    <input
                      type="checkbox"
                      checked={t.allOnPageSelected}
                      onChange={t.toggleAllOnPage}
                      aria-label="Sahifadagi hammasini tanlash"
                    />
                  </th>
                )}
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={[c.align === "num" ? "tb-num" : c.align === "mid" ? "tb-mid" : "", c.hideSmall ? "a2-hide-sm" : ""]
                      .filter(Boolean)
                      .join(" ")}
                    style={c.width ? cssVar({ width: c.width }) : undefined}
                  >
                    {c.sort ? (
                      <button
                        type="button"
                        className={`tb-sort${t.sort?.key === c.key ? " tb-sort-on" : ""}`}
                        onClick={() => t.toggleSort(c.key)}
                        title="Saralash"
                      >
                        {c.label}
                        <span className="tb-caret" aria-hidden>
                          {t.sort?.key === c.key ? (t.sort.dir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 8 }, (_, i) => (
                  <tr className="tb-sk" key={`sk-${i}`}>
                    {rowKey && bulkActions && <td />}
                    {columns.map((c) => (
                      <td key={c.key}>
                        <div className="a2-sk" style={cssVar({ "--h": "12px", "--w": "70%" })} />
                      </td>
                    ))}
                  </tr>
                ))}
              {t.rows.map((row, i) => {
                const tone = rowTone?.(row);
                return (
                  <tr
                    key={rowKey ? rowKey(row) : i}
                    aria-selected={t.isSelected(row) || undefined}
                    className={tone ? `tb-row-${tone}` : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {rowKey && bulkActions && (
                      <td className="tb-check" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={t.isSelected(row)}
                          onChange={() => t.toggleRow(row)}
                          aria-label="Qatorni tanlash"
                        />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={[c.align === "num" ? "tb-num" : c.align === "mid" ? "tb-mid" : "", c.hideSmall ? "a2-hide-sm" : ""]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {t.pageCount > 1 && (
        <div className="tb-foot">
          <Button size="sm" variant="ghost" onClick={() => t.setPage(t.page - 1)} disabled={t.page === 0}>
            ‹ Oldingi
          </Button>
          <span className="tb-page">
            {t.page + 1} / {t.pageCount}
          </span>
          <Button size="sm" variant="ghost" onClick={() => t.setPage(t.page + 1)} disabled={t.page >= t.pageCount - 1}>
            Keyingi ›
          </Button>
          <div className="a2-spacer" />
          <span className="tb-page">{t.pageSize} tadan</span>
        </div>
      )}
    </div>
  );
}
