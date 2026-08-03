// 👀 MEHMON-TEASER — taklif havolasi orqali kelgan, raqami hali ULANMAGAN odam ko'radigan ekran.
//
// Nima uchun kerak: bot chiroyli sovrin-kartochkasi yuboradi, odam "🎮 O'yinni ochish" bosadi —
// va `GuestApp`da `oyin` tab bo'lmagani uchun DO'KON ro'yxatiga tushib qolardi. Ya'ni butun viral
// halqa oxirgi qadamda uzilardi: sovrin va'da qilinadi, do'kon ko'rsatiladi.
//
// Bu ekran a'zo ma'lumotini SO'RAMAYDI (`/api/oyin/teaser` ochiq) — faqat sovrinlar va mavsum
// holati. Yagona harakat: raqamni ulash.
import { useEffect, useState } from "react";
import type { OyinTeaserResponse } from "@t1067/shared";
import { api } from "../api";
import "./feat/oyk.css";

export function OyinTeaser({ onLink, busy }: { onLink: () => void; busy: boolean }) {
  const [data, setData] = useState<OyinTeaserResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api.oyinTeaser().then((d) => { if (alive) setData(d); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (failed) return null;
  if (!data) {
    return (
      <div className="oyk-skel">
        <div className="oyk-skel-block oyk-skel-head" />
        <div className="oyk-skel-block oyk-skel-hero" />
      </div>
    );
  }

  const upcoming = data.season.phase === "upcoming";
  const closed = !data.season.configured || data.season.phase === "ended";
  const top = data.prizes[0];

  return (
    <div className="oyk oyk-teaser">
      <div className="oyk-scroll">
        <div className="oyk-head">
          <div className="oyk-title">🎮 BirJoy O'yinlar Mavsumi</div>
        </div>

        <div className="oyk-hero is-new">
          <div className="oyk-hero-glow" />
          <div className="oyk-hero-label">{closed ? "TEZ ORADA" : upcoming ? "TEZ ORADA BOSHLANADI" : "MAVSUM OCHIQ"}</div>
          <div className="oyk-hero-new-title">
            {top ? <>Bosh sovrin — {top.name}</> : <>Sovrinlar mavsumi</>}
          </div>
          <div className="oyk-hero-new-sub">
            Hech narsa to'lamaysiz. Taksida yuring — har safar <b>ball</b> beradi.
            Ball chiptaga aylanadi, chipta esa mavsum oxiridagi <b>jonli tirajga</b>.
          </div>
        </div>

        {data.prizes.length > 0 && (
          <div>
            <div className="oyk-rail-head">
              <div className="oyk-rail-title">🎁 Sovrinlar</div>
              <div className="oyk-rail-sub">{data.prizes.reduce((s, p) => s + p.limit, 0)} ta chipta</div>
            </div>
            <div className="oyk-rail">
              {data.prizes.map((p) => (
                <div key={p.key} className="oyk-pcard">
                  <div className="oyk-pcard-icon">
                    {p.photoUrl
                      ? <img src={p.photoUrl} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).replaceWith(document.createTextNode(p.icon)); }} />
                      : p.icon}
                  </div>
                  <div className="oyk-pcard-name">{p.name}</div>
                  <div className="oyk-pcard-meta">{p.valueLabel || `${p.limit} o'rin`}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button type="button" className="oyk-cta" disabled={busy} onClick={onLink}>
          <span className="oyk-cta-label">{busy ? "⏳ Ulanmoqda…" : "📱 Raqamni ulang — ball yig'ishni boshlang"}</span>
          <span className="oyk-cta-shine" />
        </button>

        <div className="oyk-sponsor">
          <div className="oyk-sponsor-logo">{data.sponsor.name[0] ?? "B"}</div>
          <div className="oyk-sponsor-text">Homiy — <b>{data.sponsor.name}</b></div>
        </div>
        <div className="oyk-legal">Chipta — tirajda qatnashish huquqi. G'olib tasodifiy tanlanadi.</div>
      </div>
    </div>
  );
}
