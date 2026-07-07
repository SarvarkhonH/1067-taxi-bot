// 🍽 RESTORAN (feature "restoran", RESTORAN_PLAN.md) — R1: katalog o'qish only. Savat/checkout
// R2'da qo'shiladi. V1 = CONCIERGE: narx REAL SO'M (D1), buyurtma operator orqali telefon bilan
// tayyorlanadi — bu ekran hozircha faqat "ko'rish" (shop.tsx katalog qismi bilan bir xil patternda).
import { useEffect, useState } from "react";
import type { MeResponse, MenuItemView, RestaurantView } from "@t1067/shared";
import { formatNumber } from "@t1067/shared";
import { api, apiUrl } from "./api";
import { haptic } from "./telegram";
import { EmptyState, Skeleton } from "./design/components";

// Xizmatlar'dagi bilan bir xil "09:00-22:00" formatini o'qish — mustaqil nusxa (services.tsx'ga
// bog'lanish restoran chunk'ini keraksiz og'irlashtirmasin).
function openNow(wh?: string | null): boolean | null {
  if (!wh) return null;
  const m = /^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/.exec(wh.trim());
  if (!m) return null;
  const cur = new Date().getHours() * 60 + new Date().getMinutes();
  const a = Number(m[1]) * 60 + Number(m[2]);
  const b = Number(m[3]) * 60 + Number(m[4]);
  return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
}

function OpenBadge({ wh }: { wh?: string | null }) {
  const o = openNow(wh);
  if (o === null) return null;
  return <span className={"svc-open" + (o ? "" : " closed")}>{o ? "Ochiq" : "Yopiq"}{wh ? ` · ${wh}` : ""}</span>;
}

function RestaurantCard({ r, onOpen }: { r: RestaurantView; onOpen: (r: RestaurantView) => void }) {
  return (
    <button className="rst-card glass" onClick={() => { haptic(); onOpen(r); }}>
      <div className="rst-card-photo-wrap">
        {r.hasPhoto ? (
          <img className="rst-card-photo" src={apiUrl(`/api/restoran/photo/${r.id}`)} loading="lazy" decoding="async" alt="" />
        ) : (
          <div className="rst-card-photo rst-card-noimg">🍽</div>
        )}
      </div>
      <div className="rst-card-body">
        <div className="rst-card-name">{r.name}</div>
        <div className="rst-card-meta">
          <OpenBadge wh={r.workHours} />
          {r.avgRating > 0 && <span className="rst-rating">★ {r.avgRating.toFixed(1)}</span>}
        </div>
        <div className="rst-card-fee">
          {r.deliveryFeeSom > 0 ? `Yetkazish ${formatNumber(r.deliveryFeeSom)} so'm` : "Bepul yetkazish"}
          {r.minOrderSom > 0 && ` · min ${formatNumber(r.minOrderSom)}`}
        </div>
      </div>
    </button>
  );
}

function CatalogSkeleton() {
  return (
    <div className="rst-grid">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rst-card glass">
          <Skeleton h={110} />
          <div style={{ padding: "10px 12px" }}>
            <Skeleton h={14} w="70%" />
            <div style={{ height: 6 }} />
            <Skeleton h={11} w="45%" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RestaurantDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const [data, setData] = useState<{ restaurant: RestaurantView | null; items: MenuItemView[] } | null>(null);
  useEffect(() => {
    setData(null);
    api.restoranDetail(id).then(setData).catch(() => setData({ restaurant: null, items: [] }));
  }, [id]);

  if (!data) {
    return (
      <div className="view">
        <button className="rst-back" onClick={onBack}>‹ Orqaga</button>
        <Skeleton h={140} />
        <div style={{ height: 12 }} />
        <Skeleton h={60} />
      </div>
    );
  }
  if (!data.restaurant) {
    return (
      <div className="view">
        <button className="rst-back" onClick={onBack}>‹ Orqaga</button>
        <EmptyState icon="🍽" text="Restoran topilmadi" />
      </div>
    );
  }
  const r = data.restaurant;
  const sections = new Map<string, MenuItemView[]>();
  for (const it of data.items) {
    if (!sections.has(it.section)) sections.set(it.section, []);
    sections.get(it.section)!.push(it);
  }

  return (
    <div className="view">
      <button className="rst-back" onClick={onBack}>‹ Orqaga</button>
      <div className="rst-hero">
        {r.hasPhoto ? (
          <img className="rst-hero-photo" src={apiUrl(`/api/restoran/photo/${r.id}`)} alt="" />
        ) : (
          <div className="rst-hero-photo rst-card-noimg">🍽</div>
        )}
        <div className="rst-hero-info">
          <div className="rst-hero-name">{r.name}</div>
          <div className="rst-card-meta">
            <OpenBadge wh={r.workHours} />
            {r.avgRating > 0 && <span className="rst-rating">★ {r.avgRating.toFixed(1)} ({r.reviewCount})</span>}
          </div>
          {r.address && <div className="muted fs12">{r.address}</div>}
          <div className="rst-card-fee">
            {r.deliveryFeeSom > 0 ? `Yetkazish ${formatNumber(r.deliveryFeeSom)} so'm` : "Bepul yetkazish"}
            {r.minOrderSom > 0 && ` · min buyurtma ${formatNumber(r.minOrderSom)} so'm`}
            {` · ~${r.prepMinutes} daq`}
          </div>
        </div>
      </div>
      {data.items.length === 0 ? (
        <EmptyState icon="📋" text="Menyu hali kiritilmagan" />
      ) : (
        [...sections.entries()].map(([section, items]) => (
          <div key={section} className="rst-section">
            <div className="rst-section-title">{section}</div>
            {items.map((it) => (
              <div key={it.id} className={"rst-item" + (it.available ? "" : " unavailable")}>
                {it.hasPhoto ? (
                  <img className="rst-item-photo" src={apiUrl(`/api/restoran/menuphoto/${it.id}`)} loading="lazy" decoding="async" alt="" />
                ) : (
                  <div className="rst-item-photo rst-card-noimg">🍲</div>
                )}
                <div className="rst-item-body">
                  <div className="rst-item-name">{it.name}</div>
                  {it.desc && <div className="rst-item-desc">{it.desc}</div>}
                  <div className="rst-item-price">{formatNumber(it.priceSom)} so'm{!it.available && " · tugagan"}</div>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

export function RestoranView({ me: _me, onBanner: _onBanner }: { me: MeResponse; onBanner?: (msg: string) => void }) {
  const [list, setList] = useState<RestaurantView[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    api.restoranList().then((r) => setList(r.restaurants)).catch(() => setList([]));
  }, []);

  if (openId != null) return <RestaurantDetail id={openId} onBack={() => setOpenId(null)} />;

  return (
    <div className="view">
      {list === null ? (
        <CatalogSkeleton />
      ) : list.length === 0 ? (
        <EmptyState icon="🍽" text="Hozircha restoran yo'q — tez orada qo'shiladi" />
      ) : (
        <div className="rst-grid">
          {list.map((r) => (
            <RestaurantCard key={r.id} r={r} onOpen={(x) => setOpenId(x.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
