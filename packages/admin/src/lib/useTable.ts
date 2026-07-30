// 🧮 useTable — saralash · qidiruv · filtr · sahifalash · ko'p-tanlov.
//
// Eski panelda BIRORTA jadval saralanmasdi (grep: 0 ta sort-handler) va har
// ko'rinish o'z qidiruv `useState`ini yozardi. Bu hook shuni bir joyga yig'adi
// va DataTable bilan birga ishlaydi.
//
// Barcha ish MIJOZ tomonida: admin ro'yxatlari server tomonidan allaqachon
// cheklangan (take: 100-500), ya'ni server-side sahifalash uchun yangi backend
// ishi shart emas. Ro'yxat kattalashsa — bu hook o'rniga server-filtr keladi,
// lekin DataTable API'si o'zgarmaydi.
import { useMemo, useState } from "react";

export interface SortState {
  key: string;
  dir: "asc" | "desc";
}

export interface UseTableOpts<T> {
  rows: T[] | null | undefined;
  /** Matn-qidiruv uchun har qatordan qidiriladigan matnni yig'ib beradi. */
  searchText?: (row: T) => string;
  /** Saralash qiymati (raqam yoki matn). Ustun kaliti bo'yicha. */
  sortValue?: (row: T, key: string) => string | number | null | undefined;
  /** Faol filtrlar: qator o'tsa `true`. */
  filters?: ((row: T) => boolean)[];
  pageSize?: number;
  initialSort?: SortState;
  /** Ko'p-tanlov uchun barqaror kalit (qator id). Berilmasa tanlov o'chadi. */
  rowKey?: (row: T) => string | number;
}

export function useTable<T>({
  rows,
  searchText,
  sortValue,
  filters,
  pageSize = 50,
  initialSort,
  rowKey,
}: UseTableOpts<T>) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());

  const filtered = useMemo(() => {
    let out = rows ?? [];
    for (const f of filters ?? []) out = out.filter(f);
    const term = q.trim().toLowerCase();
    if (term && searchText) {
      // Bir necha so'z — HAMMASI topilishi kerak ("ali 90" → ism VA raqam)
      const words = term.split(/\s+/);
      out = out.filter((r) => {
        const hay = searchText(r).toLowerCase();
        return words.every((w) => hay.includes(w));
      });
    }
    if (sort && sortValue) {
      const dir = sort.dir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        const av = sortValue(a, sort.key);
        const bv = sortValue(b, sort.key);
        // bo'sh qiymatlar HAR DOIM oxirida (yo'nalishdan qat'i nazar) — aks holda
        // "desc" bosilganda ro'yxat boshi bo'sh kataklar bilan to'lardi
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv), "uz") * dir;
      });
    }
    return out;
  }, [rows, filters, q, searchText, sort, sortValue]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () => filtered.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [filtered, safePage, pageSize],
  );

  const toggleSort = (key: string): void => {
    setPage(0);
    setSort((s) => (s?.key !== key ? { key, dir: "desc" } : s.dir === "desc" ? { key, dir: "asc" } : null));
  };

  const keyOf = rowKey ?? (() => undefined as unknown as string);
  const toggleRow = (row: T): void => {
    if (!rowKey) return;
    const k = keyOf(row);
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };
  const allOnPageSelected = !!rowKey && pageRows.length > 0 && pageRows.every((r) => selected.has(keyOf(r)));
  const toggleAllOnPage = (): void => {
    if (!rowKey) return;
    setSelected((p) => {
      const n = new Set(p);
      if (allOnPageSelected) pageRows.forEach((r) => n.delete(keyOf(r)));
      else pageRows.forEach((r) => n.add(keyOf(r)));
      return n;
    });
  };
  const selectedRows = useMemo(
    () => (rowKey ? filtered.filter((r) => selected.has(keyOf(r))) : []),
    [filtered, selected, rowKey, keyOf],
  );

  return {
    q,
    setQ: (v: string) => {
      setQ(v);
      setPage(0);
    },
    sort,
    toggleSort,
    page: safePage,
    setPage,
    pageCount,
    pageSize,
    total: filtered.length,
    rawTotal: rows?.length ?? 0,
    rows: pageRows,
    allRows: filtered,
    // ko'p-tanlov
    selected,
    selectedRows,
    toggleRow,
    toggleAllOnPage,
    allOnPageSelected,
    clearSelection: () => setSelected(new Set()),
    isSelected: (row: T) => !!rowKey && selected.has(keyOf(row)),
  };
}
