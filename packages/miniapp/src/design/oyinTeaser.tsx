// 👀 MEHMON-TEASER — taklif havolasi orqali kelgan, raqami hali ULANMAGAN odam ko'radigan ekran.
//
// Nima uchun kerak: bot chiroyli sovrin-kartochkasi yuboradi, odam "🎮 O'yinni ochish" bosadi —
// va `GuestApp`da `oyin` tab bo'lmagani uchun DO'KON ro'yxatiga tushib qolardi. Ya'ni butun viral
// halqa oxirgi qadamda uzilardi: sovrin va'da qilinadi, do'kon ko'rsatiladi.
//
// Bu ekran a'zo ma'lumotini SO'RAMAYDI (`/api/oyin/teaser` ochiq) — faqat sovrinlar va mavsum
// holati. Yagona harakat: raqamni ulash.
//
// 2026-08-03 QAYTA QURILDI, uchta aniq kamchilik uchun:
//  1) MAVSUM YOPIQ bo'lsa ham "ball yig'ishni boshlang" deb chaqirardi — bo'lmagan o'yinga
//     taklif (DIZAYN_QOIDALARI #8: va'da qilingan narsa REAL berilishi shart). Endi matn
//     fazaga qarab o'zgaradi va yopiq mavsumda hech narsa va'da qilinmaydi.
//  2) Tarmoq yiqilsa `return null` edi — mehmon BO'M-BO'SH ekran ko'rardi (faqat pastdagi
//     "Ulash" paneli). Endi xato + "Qayta urinish".
//  3) Ekran botdagi qizil-oltin sovg'a kartochkasidan va uy ekranidagi yangi qizil posterdan
//     BUTUNLAY boshqacha (oq/binafsha) edi. Endi u aynan O'SHA poster (`.nh-oyin*`).
import { useCallback, useEffect, useState } from "react";
import { OYIN_FINAL_LOCK_MS, type OyinTeaserResponse } from "@t1067/shared";
import { api } from "../api";
// ⏳ Sanoq va faza matnlari UY KARTASI bilan BITTA manbadan (`seasonCountdown`) — ikki ekran
// bir xil mavsum haqida boshqa-boshqa gapirmasligi uchun.
import { seasonCountdown } from "../uy";

export function OyinTeaser({ onLink, busy }: { onLink: () => void; busy: boolean }) {
  const [data, setData] = useState<OyinTeaserResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [bad, setBad] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setFailed(false);
    setData(null);
    api.oyinTeaser().then(setData).catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    let alive = true;
    api.oyinTeaser().then((d) => { if (alive) setData(d); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (failed) {
    return (
      <div className="nh-tsr">
        <div className="nh-tsr-bad">
          <div className="nh-tsr-bad-i" aria-hidden="true">📡</div>
          <div className="nh-tsr-bad-t">Mukofotlar yuklanmadi</div>
          <div className="nh-tsr-bad-s">Internet aloqasi uzilgan ko'rinadi. Ulanishni tekshirib, qayta urinib ko'ring.</div>
          <button type="button" className="nh-tsr-bad-b" onClick={load}>Qayta urinish</button>
        </div>
      </div>
    );
  }

  // Skeleton REAL layoutning nusxasi (#11): poster + 2×2 sovrin panjarasi.
  if (!data) {
    return (
      <div className="nh-tsr">
        <div className="nh-skel nh-tsr-sk-post" />
        <div className="nh-tsr-rail">
          {[0, 1, 2, 3].map((i) => <div key={i} className="nh-skel nh-tsr-sk-p" />)}
        </div>
      </div>
    );
  }

  // 🕰 MAVSUM FAZASI — TO'RT holat, ikki emas. Avval `closed = !configured || ended` bo'lib,
  // YAKUNLANGAN mavsum ham, HALI TUZILMAGAN mavsum ham bir xil "TEZ ORADA" derdi: tugagan
  // narsani "tez orada boshlanadi" deb ko'rsatish ochiq yolg'on (DIZAYN_QOIDALARI #6/#8).
  const phase = data.season.phase;
  const ended = data.season.configured && phase === "ended";
  const upcoming = data.season.configured && phase === "upcoming";
  // To'rtinchi holat — "unset" (mavsum hali TUZILMAGAN) — quyidagi zanjirlarning OXIRGI
  // `else` shoxi. Alohida o'zgaruvchi ataylab yo'q: bo'lsa ishlatilmay o'lik kod bo'lardi.
  const cd = seasonCountdown(upcoming ? data.season.startIso : data.season.endIso, upcoming);
  // 🔒 Oxirgi 48 soat: hozir ulangan mehmon bu mavsumda CHIPTA OLOLMAYDI (uy kartasi va
  // `oyin.tsx` bilan bir xil qoida) — unga "chipta olib sovg'a yuting" deyish yolg'on bo'lardi.
  const final48 = data.season.configured && phase === "active" && cd.leftMs <= OYIN_FINAL_LOCK_MS;
  const open = (upcoming || phase === "active") && data.season.configured && !final48;
  const shots = data.prizes.slice().sort((a, b) => b.price - a.price).slice(0, 4);
  const slots = data.prizes.reduce((s, p) => s + p.limit, 0);

  return (
    <div className="nh-tsr">
      {/* Uy ekranidagi QIZIL POSTERNING O'ZI — bot yuborgan kartochka bilan bir xil til.
          Butun poster bosiladi: mehmonda yagona harakat — raqamni ulash. */}
      <div className="nh-oyin">
        <button type="button" className="nh-oyin-hero" onClick={onLink} disabled={busy} aria-label="Raqamni ulash">
          <span className="nh-oyin-conf" aria-hidden="true" />
          <span className="nh-oyin-gift" aria-hidden="true">🎁</span>
          <span className="nh-oyin-h1">BEPUL</span>
          <span className="nh-oyin-h2">SOVG'ALAR</span>
          {/* Matnlar 2 satrga sig'adigan qilib qisqartirilgan va `.nh-tsr .nh-oyin-lead` ga
              2 satrlik joy AJRATILGAN — shunda poster balandligi HAR fazada bir xil bo'ladi
              va yuqoridagi skeleton unga teng tura oladi (#11). */}
          <span className="nh-oyin-lead">
            {open ? <>Bepul karta olib, <b>sovg'alar</b> egasi bo'ling!</>
              : final48 ? <>Karta olish yopildi — <b>mukofot yaqin!</b></>
                : ended ? <>Dastur davri yakunlandi — <b>keyingisi</b> yaqin!</>
                  : <>Yangi davr <b>tayyorlanmoqda</b>.</>}
          </span>

          {/* Sanoq FAQAT mavsum ochiq bo'lganda RAQAM ko'rsatadi; yakunlangan va hali
              tuzilmagan mavsum ENDI BOSHQA-BOSHQA gapiradi (avval ikkalasi "TEZ ORADA" edi). */}
          <span className="nh-oyin-cd">
            <span className="nh-oyin-cd-ic" aria-hidden="true">{open ? "📅" : final48 ? "🔒" : ended ? "🏁" : "🔔"}</span>
            <span className="nh-oyin-cd-tx">
              {open
                ? <><small>{upcoming ? "DASTUR BOSHLANISHIGA" : "SOVG'ALAR TOPSHIRILISHIGA"}</small><b>{cd.text}</b></>
                : final48 ? <><small>MUKOFOT KUNIGA</small><b>{cd.text}</b></>
                  : ended ? <><small>SHU DAVR</small><b>YAKUNLANDI</b></>
                    : <><small>YANGI DAVR</small><b>TAYYORLANMOQDA</b></>}
            </span>
          </span>

          {shots.length > 0 && (
            <span className="nh-oyin-shots">
              {shots.map((p) => (
                <span key={p.key} className="nh-oyin-shot">
                  {p.photoUrl && !bad.has(p.key)
                    ? <img src={p.photoUrl} alt="" loading="lazy" onError={() => setBad((b) => new Set(b).add(p.key))} />
                    : <span className="nh-oyin-shot-em">{p.icon}</span>}
                </span>
              ))}
            </span>
          )}

          {data.prizes.length > 0 && (
            <span className="nh-oyin-badge">⭐ {data.prizes.length} TA REAL SOVG'A</span>
          )}
        </button>

        <button type="button" className={`nh-oyin-cta${open ? "" : " is-soon"}`} disabled={busy} onClick={onLink}>
          <span className="nh-oyin-cta-ic" aria-hidden="true">📱</span>
          <span>{busy ? "ULANMOQDA…" : "RAQAMNI ULASH"}</span>
          <span className="nh-oyin-cta-go" aria-hidden="true">›</span>
        </button>

        {/* 4 qadam — "bepul" so'zi qanday ishlashini DARHOL tushuntiradi. Mavsum yopiq bo'lsa
            ham qoladi: bu mexanikaning TA'RIFI ("shunday ishlaydi"), hozirgi va'da emas. */}
        <div className="nh-oyin-steps">
          {([["🚕", "Safar qil"], ["⭐", "Ball yig'"], ["🎟", "Karta ol"], ["🎁", "Sovg'a ol"]] as const).map(([em, tx], i) => (
            <div key={tx} className="nh-oyin-step">
              <span className="nh-oyin-step-em">{em}</span>
              <span className="nh-oyin-step-tx">{i + 1}. {tx}</span>
            </div>
          ))}
        </div>
      </div>

      {data.prizes.length > 0 && (
        <>
          <div className="nh-tsr-h">
            🎁 {open || final48 ? "Mukofotlar" : ended ? "Shu davrda o'ynalgan mukofotlar" : "Shunday mukofotlar o'ynaladi"}
            <small>
              {open ? `Jami ${slots} ta karta · egasi mukofot kunida aniqlanadi`
                : final48 ? `Jami ${slots} ta karta tarqatildi · mukofot kuni yaqin`
                  : ended ? "Mukofot egalari aniqlandi" : "Yangi davrda ro'yxat yangilanadi"}
            </small>
          </div>
          <div className="nh-tsr-rail">
            {data.prizes.map((p) => (
              <div key={p.key} className="nh-tsr-p">
                <div className="nh-tsr-p-im">
                  {p.photoUrl && !bad.has(p.key)
                    ? <img src={p.photoUrl} alt="" loading="lazy" onError={() => setBad((b) => new Set(b).add(p.key))} />
                    : p.icon}
                </div>
                <div className="nh-tsr-p-b">
                  <div className="nh-tsr-p-n">{p.name}</div>
                  <div className="nh-tsr-p-m">{p.valueLabel || `${p.limit} o'rin`}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="nh-tsr-foot">
        <span className="nh-tsr-logo">{data.sponsor.name[0] ?? "B"}</span>
        <span>Homiy — <b>{data.sponsor.name}</b></span>
      </div>
      <div className="nh-tsr-legal">Sodiqlik kartasi — mukofot kunida qatnashish huquqi. Mukofot egasi tasodifiy aniqlanadi.</div>
    </div>
  );
}
