// 🌐 K1 — ochiq (parolsiz) karta tekshiruv sahifasi. `TrackView` bilan BIR XIL naqsh: Telegram
// context'siz, oddiy brauzerdan ochiladi (?karta=<kod>), auth talab qilmaydi. Faqat plan §1
// sanagan maydonlar: karta · sovg'a · egasi (qisqartirilgan ism, rozilik bo'lsa avatar) · holat.
// `.oyk` ichida — o'yin kartasi bilan BIR XIL vizual til (`.oyk-cert*`), yangi uslub o'ylab
// topilmadi.
import { useEffect, useState } from "react";
import type { OyinCardVerifyResponse } from "@t1067/shared";
import { api } from "./api";
import { BirJoyMark } from "./design/birjoy";
import "./design/feat/oyk.css"; // bu sahifa ochilgandagina yuklanadi (kritik yo'lda emas)

function uzDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const months = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
  return `${d.getDate()}-${months[d.getMonth()]}, ${d.getFullYear()}`;
}

type LoadState = "loading" | "done" | "notfound" | "error";

export function CardVerifyView({ code }: { code: string }) {
  const [data, setData] = useState<OyinCardVerifyResponse | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    setState("loading");
    setData(null);
    api.oyinVerifyCard(code)
      .then((d) => { setData(d); setState("done"); })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        setState(/-> 404$/.test(msg) ? "notfound" : "error");
      });
  }, [code]);

  return (
    <div className="oyk" style={{ height: "100dvh", overflowY: "auto" }}>
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "28px 18px 40px", display: "flex", flexDirection: "column", gap: 18, alignItems: "center" }}>
        <BirJoyMark size={40} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 900 }}>BirJoy sodiqlik kartasi</div>
          <div style={{ fontSize: 11.5, color: "var(--oyk-text-3)", marginTop: 3 }}>Ochiq tekshiruv sahifasi — parolsiz</div>
        </div>

        {state === "loading" && <div className="oyk-cards-msg">Yuklanmoqda…</div>}
        {state === "error" && (
          <div className="oyk-cards-msg" style={{ textAlign: "center" }}>Tekshirib bo'lmadi — aloqa uzildi. Qayta urinib ko'ring.</div>
        )}
        {state === "notfound" && <div className="oyk-cards-msg">Bu manzil topilmadi</div>}

        {data && (
          <div style={{ width: "100%" }}>
            <div className="oyk-cert">
              <div className="oyk-cert-stub">
                <div className="oyk-cert-lbl">BirJoy karta</div>
                <div className="oyk-cert-no">{data.code}</div>
                <div className="oyk-cert-pz">{data.prizeIcon} {data.prizeName}</div>
                <div className={`oyk-cert-st${data.result === "won" ? " is-won" : ""}`}>
                  {data.result === "won" ? "🏆 Yutdi" : data.result === "lost" ? "O'ynadi" : "⏳ O'yinda"}
                </div>
              </div>
              <div className="oyk-cert-rows">
                <div className="oyk-cert-row">
                  <span>Egasi</span>
                  <b className="oyk-cert-owner">
                    {data.ownerPhotoUrl && <img className="oyk-cert-owner-av" src={data.ownerPhotoUrl} alt="" />}
                    {data.ownerName}
                  </b>
                </div>
                <div className="oyk-cert-row">
                  <span>Olingan</span>
                  <b>{uzDate(data.at)}</b>
                </div>
              </div>
            </div>
            {data.result === null && data.drawIso && (
              <div className="oyk-cert-teach" style={{ marginTop: 12 }}>
                <div className="oyk-cert-teach-li"><span className="oyk-cert-teach-em">📺</span><span><b>{uzDate(data.drawIso)}</b> kuni, Telegram jonli efirida o'ynaydi.</span></div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
