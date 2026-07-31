// 👔 JAMOA J3 (JAMOA_PLAN.md) — EGA paneli: xodimlar ro'yxati (bugungi holat +
// balans), xodim sahifasi (oy-jadval, qo'lda tuzatish, 💸 pul berish), korxona
// sozlamalari + OY TAQVIMI (kun bosilsa ish→dam→bayram→default aylanadi).
// Pul MATEMATIKASI serverda (shared computeDayPay) — bu fayl faqat ko'rsatadi.
import { Fragment, useEffect, useState } from "react";
import { adminApi } from "./api";

const som = (n: number) => n.toLocaleString("ru-RU").replace(/,/g, " ");
const WD = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"]; // isoWeekday 1..7

// ── server javob shakllari (staffAdminService bilan 1:1; api.ts type-only import qiladi) ──
export interface RosterEmp {
  id: number; telegramId: string; name: string; role: string; active: boolean;
  payType: string; monthlySalary: number; dailyRate: number; hourlyRate: number;
  todayIn: string | null; todayOut: string | null; todayStatus: string;
  monthEarned: number; monthMinutes: number; balance: number;
}
export interface RosterOrg { id: number; name: string; active: boolean; employees: RosterEmp[] }
export interface JamoaOverview { today: string; orgs: RosterOrg[] }
export interface DayRow {
  date: string; weekday: number; kind: "ish" | "dam" | "bayram";
  sessionId: number | null; dayStatus: string | null; checkIn: string | null; checkOut: string | null;
  minutesWorked: number; overtimeMin: number; amountEarned: number;
  autoClosed: boolean; confirmed: boolean; editedBy: string | null;
  shiftStartOvr: string | null; shiftEndOvr: string | null;
}
export interface EmpDetail {
  employee: {
    id: number; orgId: number; telegramId: string; name: string; role: string; active: boolean;
    payType: string; monthlySalary: number; dailyRate: number; hourlyRate: number;
    shiftStart: string | null; shiftEnd: string | null; workDays: string | null;
    graceMin: number | null; lunchMin: number | null; openingBalance: number; vacationDaysYr: number;
  };
  policy: { shiftStart: string; shiftEnd: string; workDays: string };
  month: string; days: DayRow[];
  ledger: { id: number; kind: string; amount: number; note: string | null; date: string; createdBy: string }[];
  totals: { monthEarned: number; plus: number; minus: number; balance: number; openingBalance: number };
}
export interface OrgRow {
  id: number; name: string; ownerTelegramId: string; active: boolean;
  divisorMode: string; fixedDivisor: number; graceMin: number; roundMin: number;
  lunchMin: number; lunchPaid: boolean; lunchThresholdMin: number;
  overtimeMode: string; overtimeMult: number; sickPct: number; vacationPct: number;
  holidayPaid: boolean; workDays: string; shiftStart: string; shiftEnd: string;
  calendar: Record<string, "ish" | "dam" | "bayram">;
}

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  ishda: { cls: "badge-ok", label: "🟢 ishda" },
  ketgan: { cls: "badge-muted", label: "🔵 ketgan" },
  kelmagan: { cls: "badge-bad", label: "⚪ kelmagan" },
  javobli: { cls: "badge-warn", label: "🟡 javobli" },
  kasallik: { cls: "badge-warn", label: "🤒 kasal" },
  tatil: { cls: "badge-warn", label: "🏖 ta'til" },
  bayram: { cls: "badge-muted", label: "🎉 bayram" },
};

const DAY_STATUSES = ["ishladi", "kelmadi", "javobli", "kasallik", "tatil", "bayram"] as const;

export function JamoaAdminView() {
  const [roster, setRoster] = useState<{ today: string; orgs: RosterOrg[] } | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [openEmp, setOpenEmp] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [msg, setMsg] = useState("");
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 3000); };

  const load = () => {
    adminApi.staffOverview().then(setRoster).catch(() => setRoster(null));
    adminApi.staffOrgs().then((r) => setOrgs(r.orgs)).catch(() => undefined);
  };
  useEffect(load, []);

  if (!roster) return <div className="card">Yuklanmoqda… (faqat EGA ko'ra oladi)</div>;

  return (
    <div>
      {msg && <div className="alert">{msg}</div>}
      {openEmp != null ? (
        <EmpDetailView empId={openEmp} onBack={() => { setOpenEmp(null); load(); }} flash={flash} />
      ) : (
        <>
          <div className="adm-toolbar" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button className="btn" onClick={() => setShowAdd((s) => !s)}>➕ Xodim qo'shish</button>
            <button className="btn" onClick={() => setShowSettings((s) => !s)}>⚙️ Korxona sozlamalari va taqvim</button>
          </div>
          {showAdd && <AddEmpForm orgs={orgs} onDone={() => { setShowAdd(false); load(); flash("✅ Xodim saqlandi"); }} flash={flash} />}
          {showSettings && <OrgSettings orgs={orgs} onChanged={() => { adminApi.staffOrgs().then((r) => setOrgs(r.orgs)).catch(() => undefined); }} flash={flash} />}
          {roster.orgs.map((org) => (
            <div key={org.id} className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-head"><div className="panel-title">🏢 {org.name}{!org.active && " (o'chirilgan)"} — {roster.today}</div></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Xodim</th><th>Bugun</th><th>Keldi</th><th>Ketdi</th><th>Shu oy</th><th>Qoldiq</th></tr></thead>
                  <tbody>
                    {org.employees.map((e) => {
                      const b = STATUS_BADGE[e.todayStatus] ?? { cls: "badge-bad", label: "⚪ kelmagan" };
                      return (
                        <tr key={e.id} style={{ cursor: "pointer", opacity: e.active ? 1 : 0.5 }} onClick={() => setOpenEmp(e.id)}>
                          <td className="td-name">{e.name}<div className="td-sub muted">{e.role || e.payType}</div></td>
                          <td><span className={"badge " + b.cls}>{b.label}</span></td>
                          <td>{e.todayIn ?? "—"}</td>
                          <td>{e.todayOut ?? "—"}</td>
                          <td>{som(e.monthEarned)} <span className="muted">({Math.floor(e.monthMinutes / 60)} soat)</span></td>
                          <td><b style={{ color: e.balance < 0 ? "#e05555" : undefined }}>{som(e.balance)}</b></td>
                        </tr>
                      );
                    })}
                    {org.employees.length === 0 && <tr><td colSpan={6} className="muted">Xodim yo'q — «➕ Xodim qo'shish»</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── ➕ xodim qo'shish ──
function AddEmpForm({ orgs, onDone, flash }: { orgs: OrgRow[]; onDone: () => void; flash: (t: string) => void }) {
  const [f, setF] = useState({ orgId: orgs[0]?.id ?? 0, telegramId: "", name: "", role: "operator", payType: "oylik", amount: "", openingBalance: "0", shiftStart: "", shiftEnd: "", workDays: "" });
  const set = (k: string, v: string | number) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    const amount = Number(f.amount.replace(/\s/g, ""));
    if (!f.telegramId.trim() || !f.name.trim() || !Number.isFinite(amount) || amount <= 0) { flash("❌ Telegram ID, ism va summa majburiy"); return; }
    const r = await adminApi.staffEmployeeSave({
      orgId: f.orgId || undefined,
      telegramId: f.telegramId.trim(),
      name: f.name.trim(),
      role: f.role.trim(),
      payType: f.payType,
      monthlySalary: f.payType === "oylik" ? amount : 0,
      dailyRate: f.payType === "kunlik" ? amount : 0,
      hourlyRate: f.payType === "soatlik" ? amount : 0,
      openingBalance: Number(f.openingBalance.replace(/\s/g, "")) || 0,
      shiftStart: f.shiftStart.trim() || null,
      shiftEnd: f.shiftEnd.trim() || null,
      workDays: f.workDays.trim() || null,
    }).catch(() => ({ ok: false, error: "tarmoq" }));
    if (!r.ok) { flash("❌ " + (r.error ?? "Saqlanmadi")); return; }
    onDone();
  };
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-title">➕ Yangi xodim</div>
      <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8, marginTop: 8 }}>
        {orgs.length > 1 && (
          <select className="inp" value={f.orgId} onChange={(e) => set("orgId", Number(e.target.value))}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        <input className="inp" placeholder="Telegram ID (raqam)" value={f.telegramId} onChange={(e) => set("telegramId", e.target.value)} />
        <input className="inp" placeholder="Ism Familiya" value={f.name} onChange={(e) => set("name", e.target.value)} />
        <input className="inp" placeholder="Lavozim (operator…)" value={f.role} onChange={(e) => set("role", e.target.value)} />
        <select className="inp" value={f.payType} onChange={(e) => set("payType", e.target.value)}>
          <option value="oylik">Oylik maosh</option><option value="kunlik">Kunlik stavka</option><option value="soatlik">Soatlik stavka</option>
        </select>
        <input className="inp" placeholder={f.payType === "oylik" ? "Oylik (so'm), mas. 3000000" : f.payType === "kunlik" ? "Kunlik (so'm)" : "Soatlik (so'm)"} value={f.amount} onChange={(e) => set("amount", e.target.value)} />
        <input className="inp" placeholder="Eski haq/qarz (so'm, ±)" value={f.openingBalance} onChange={(e) => set("openingBalance", e.target.value)} />
        <input className="inp" placeholder="Smena boshi (bo'sh=korxona)" value={f.shiftStart} onChange={(e) => set("shiftStart", e.target.value)} />
        <input className="inp" placeholder="Smena oxiri (mas. 18:00)" value={f.shiftEnd} onChange={(e) => set("shiftEnd", e.target.value)} />
        <input className="inp" placeholder="Ish kunlari (mas. 123456)" value={f.workDays} onChange={(e) => set("workDays", e.target.value)} />
      </div>
      <div style={{ marginTop: 8 }}><button className="btn" onClick={save}>💾 Saqlash</button></div>
      <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>Ish kunlari: 1=Du … 7=Ya (masalan 123456 = Du–Sha). Bo'sh qoldirilsa korxona sozlamasi ishlaydi.</div>
    </div>
  );
}

// ── 👤 xodim sahifasi ──
function EmpDetailView({ empId, onBack, flash }: { empId: number; onBack: () => void; flash: (t: string) => void }) {
  const [d, setD] = useState<EmpDetail | null>(null);
  const [month, setMonth] = useState<string>("");
  const [editDay, setEditDay] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [pay, setPay] = useState({ kind: "payout", amount: "", note: "" });
  // Bir urinish = bir kalit: tarmoq-retry AYNAN shu kalit bilan (ikki marta yozilmaydi),
  // MUVAFFAQIYATdan keyin esa yangisi olinadi (keyingi ongli to'lov yutilib ketmasin —
  // useMemo(ledger.length) varianti 100-qator cap'da qotib qolardi, tekshiruv B1).
  const newKey = () => `ui:${Date.now()}:${Math.floor(Math.random() * 1e6)}`;
  const [idemKey, setIdemKey] = useState(newKey);

  const load = (m?: string) => adminApi.staffEmployee(empId, m).then((r) => { setD(r); setMonth(r.month); }).catch(() => undefined);
  useEffect(() => { load(); }, [empId]);
  if (!d) return <div className="card">Yuklanmoqda…</div>;

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const nd = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1 + delta, 1));
    load(`${nd.getUTCFullYear()}-${String(nd.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  const doPay = async () => {
    const amount = Number(pay.amount.replace(/\s/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) { flash("❌ Summa noto'g'ri"); return; }
    const r = await adminApi.staffPay({ employeeId: empId, kind: pay.kind, amount, note: pay.note.trim() || undefined, idemKey }).catch(() => ({ ok: false, error: "tarmoq" }));
    if (!r.ok) { flash("❌ " + (r.error ?? "Yozilmadi")); return; }
    setIdemKey(newKey());
    setPay({ kind: "payout", amount: "", note: "" });
    flash("✅ Yozildi va xodimga xabar yuborildi");
    load(month);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <button className="btn" onClick={onBack}>← Ro'yxat</button>
        <div className="panel-title" style={{ flex: 1 }}>👤 {d.employee.name} <span className="muted">({d.employee.role || d.employee.payType} · TG {d.employee.telegramId}){!d.employee.active && " · ⛔ o'chirilgan"}</span></div>
        <button className="btn" onClick={() => setShowEdit((s) => !s)}>✏️ Tahrirlash</button>
      </div>
      {showEdit && <EditEmpForm emp={d.employee} onDone={() => { setShowEdit(false); load(month); flash("✅ Xodim yangilandi"); }} flash={flash} />}

      <div className="cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8, marginBottom: 12 }}>
        <div className="card"><div className="card-label">Shu oy hisoblangan</div><div className="card-value">{som(d.totals.monthEarned)}</div></div>
        <div className="card"><div className="card-label">Boshlang'ich</div><div className="card-value">{som(d.totals.openingBalance)}</div></div>
        <div className="card"><div className="card-label">Jami +</div><div className="card-value">{som(d.totals.plus)}</div></div>
        <div className="card"><div className="card-label">Jami −</div><div className="card-value">{som(d.totals.minus)}</div></div>
        <div className="card"><div className="card-label">💰 QOLDIQ</div><div className="card-value" style={{ color: d.totals.balance < 0 ? "#e05555" : "#3fb26f" }}>{som(d.totals.balance)}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-title">💸 Pul berish / bonus / jarima</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <select className="inp" value={pay.kind} onChange={(e) => setPay((p) => ({ ...p, kind: e.target.value }))}>
            <option value="payout">💸 Pul berdim</option><option value="bonus">🎁 Bonus (+)</option><option value="adjust">⚠️ Jarima/ushlab qolish (−)</option>
          </select>
          <input className="inp" placeholder="Summa (so'm)" value={pay.amount} onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))} />
          <input className="inp" style={{ flex: 1, minWidth: 160 }} placeholder={pay.kind === "payout" ? "Izoh (avans/oylik…)" : "Sabab (MAJBURIY)"} value={pay.note} onChange={(e) => setPay((p) => ({ ...p, note: e.target.value }))} />
          <button className="btn" onClick={doPay}>Yozish</button>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-head" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn" onClick={() => shiftMonth(-1)}>←</button>
          <div className="panel-title">📅 {month}</div>
          <button className="btn" onClick={() => shiftMonth(1)}>→</button>
          <div className="muted" style={{ marginLeft: "auto", fontSize: 12 }}>Smena: {d.policy.shiftStart}–{d.policy.shiftEnd} · kun bosilsa tuzatish ochiladi</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Kun</th><th>Holat</th><th>Keldi</th><th>Ketdi</th><th>Soat</th><th>Hisob</th><th></th></tr></thead>
            <tbody>
              {d.days.map((day) => {
                const isRest = day.kind !== "ish" && !day.sessionId;
                const st = day.dayStatus ?? (day.kind === "bayram" ? "bayram" : day.kind === "dam" ? "dam" : "");
                return (
                  <Fragment key={day.date}>
                    <tr style={{ cursor: "pointer", opacity: isRest ? 0.45 : 1 }} onClick={() => setEditDay(editDay === day.date ? null : day.date)}>
                      <td>{day.date.slice(8)} <span className="muted">{WD[day.weekday - 1]}</span></td>
                      <td>{st === "dam" ? <span className="badge badge-muted">dam</span> : st ? <span className={"badge " + (STATUS_BADGE[st]?.cls ?? "badge-muted")}>{st}</span> : "—"}
                        {day.autoClosed && " ⚠️"}{day.confirmed && " ✓"}{day.editedBy && " ✏️"}</td>
                      <td>{day.checkIn ?? "—"}</td>
                      <td>{day.checkOut ?? "—"}</td>
                      <td>{day.minutesWorked ? `${Math.floor(day.minutesWorked / 60)}:${String(day.minutesWorked % 60).padStart(2, "0")}` : "—"}{day.overtimeMin ? ` +${day.overtimeMin}d OT` : ""}</td>
                      <td>{day.amountEarned ? som(day.amountEarned) : "—"}</td>
                      <td>{day.shiftStartOvr && <span className="muted">{day.shiftStartOvr}–{day.shiftEndOvr}</span>}</td>
                    </tr>
                    {editDay === day.date && (
                      <tr>
                        <td colSpan={7}><DayEditor empId={empId} day={day} onSaved={() => { setEditDay(null); load(month); flash("✅ Kun yangilandi"); }} flash={flash} /></td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><div className="panel-title">📜 Kassa lentasi (oxirgi 100)</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Sana</th><th>Tur</th><th>Summa</th><th>Izoh</th><th>Kim</th></tr></thead>
            <tbody>
              {d.ledger.map((l) => (
                <tr key={l.id}>
                  <td>{l.date}</td>
                  <td>{l.kind === "earn" ? "hisob" : l.kind === "payout" ? "💸 to'lov" : l.kind === "bonus" ? "🎁 bonus" : "⚠️ jarima"}</td>
                  <td style={{ color: l.kind === "payout" || l.kind === "adjust" ? "#e05555" : "#3fb26f" }}>{l.kind === "payout" || l.kind === "adjust" ? "−" : "+"}{som(l.amount)}</td>
                  <td className="muted">{l.note ?? ""}</td>
                  <td className="muted">{l.createdBy === "system" ? "avto" : l.createdBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── ✏️ xodimni tahrirlash (oylik/smena/rol/faollik — G1 tekshiruv topgan bo'shliq) ──
function EditEmpForm({ emp, onDone, flash }: { emp: EmpDetail["employee"]; onDone: () => void; flash: (t: string) => void }) {
  const amount0 = emp.payType === "kunlik" ? emp.dailyRate : emp.payType === "soatlik" ? emp.hourlyRate : emp.monthlySalary;
  const [f, setF] = useState({
    name: emp.name, role: emp.role, telegramId: emp.telegramId, payType: emp.payType,
    amount: String(amount0), openingBalance: String(emp.openingBalance),
    shiftStart: emp.shiftStart ?? "", shiftEnd: emp.shiftEnd ?? "", workDays: emp.workDays ?? "",
    active: emp.active,
  });
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    const amount = Number(f.amount.replace(/\s/g, ""));
    if (!f.name.trim() || !Number.isFinite(amount)) { flash("❌ Ism va summa noto'g'ri"); return; }
    const r = await adminApi.staffEmployeeSave({
      id: emp.id,
      name: f.name.trim(), role: f.role.trim(), telegramId: f.telegramId.trim(), payType: f.payType,
      monthlySalary: f.payType === "oylik" ? amount : 0,
      dailyRate: f.payType === "kunlik" ? amount : 0,
      hourlyRate: f.payType === "soatlik" ? amount : 0,
      openingBalance: Number(f.openingBalance.replace(/\s/g, "")) || 0,
      shiftStart: f.shiftStart.trim() || null, shiftEnd: f.shiftEnd.trim() || null, workDays: f.workDays.trim() || null,
      active: f.active,
    }).catch(() => ({ ok: false, error: "tarmoq" }));
    if (!r.ok) { flash("❌ " + (r.error ?? "Saqlanmadi")); return; }
    onDone();
  };
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8 }}>
        <input className="inp" placeholder="Ism" value={f.name} onChange={(e) => set("name", e.target.value)} />
        <input className="inp" placeholder="Lavozim" value={f.role} onChange={(e) => set("role", e.target.value)} />
        <input className="inp" placeholder="Telegram ID" value={f.telegramId} onChange={(e) => set("telegramId", e.target.value)} />
        <select className="inp" value={f.payType} onChange={(e) => set("payType", e.target.value)}>
          <option value="oylik">Oylik</option><option value="kunlik">Kunlik</option><option value="soatlik">Soatlik</option>
        </select>
        <input className="inp" placeholder="Summa" value={f.amount} onChange={(e) => set("amount", e.target.value)} />
        <input className="inp" placeholder="Boshlang'ich balans" value={f.openingBalance} onChange={(e) => set("openingBalance", e.target.value)} />
        <input className="inp" placeholder="Smena boshi" value={f.shiftStart} onChange={(e) => set("shiftStart", e.target.value)} />
        <input className="inp" placeholder="Smena oxiri" value={f.shiftEnd} onChange={(e) => set("shiftEnd", e.target.value)} />
        <input className="inp" placeholder="Ish kunlari (123456)" value={f.workDays} onChange={(e) => set("workDays", e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
        <label className="muted"><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> faol (o'chirilsa botda /ish yopiladi, tarix saqlanadi)</label>
        <button className="btn" onClick={save}>💾 Saqlash</button>
      </div>
    </div>
  );
}

// ── kun tuzatish (audit bilan) ──
function DayEditor({ empId, day, onSaved, flash }: { empId: number; day: DayRow; onSaved: () => void; flash: (t: string) => void }) {
  const [f, setF] = useState({
    dayStatus: day.dayStatus ?? "ishladi",
    checkIn: day.checkIn ?? "",
    checkOut: day.checkOut ?? "",
    overtimeMin: String(day.overtimeMin || ""),
    shiftStartOvr: day.shiftStartOvr ?? "",
    shiftEndOvr: day.shiftEndOvr ?? "",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const save = async (confirm: boolean) => {
    const r = await adminApi.staffSessionSet({
      employeeId: empId,
      date: day.date,
      dayStatus: f.dayStatus,
      checkIn: f.checkIn.trim() || null,
      checkOut: f.checkOut.trim() || null,
      overtimeMin: f.overtimeMin.trim() ? Number(f.overtimeMin) : undefined,
      shiftStartOvr: f.shiftStartOvr.trim() || null,
      shiftEndOvr: f.shiftEndOvr.trim() || null,
      confirm,
    }).catch(() => ({ ok: false, error: "tarmoq" }));
    if (!r.ok) { flash("❌ " + (r.error ?? "Saqlanmadi")); return; }
    onSaved();
  };
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "6px 0" }}>
      <select className="inp" value={f.dayStatus} onChange={(e) => set("dayStatus", e.target.value)}>
        {DAY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <input className="inp" style={{ width: 90 }} placeholder="Keldi 09:00" value={f.checkIn} onChange={(e) => set("checkIn", e.target.value)} />
      <input className="inp" style={{ width: 90 }} placeholder="Ketdi 18:00" value={f.checkOut} onChange={(e) => set("checkOut", e.target.value)} />
      <input className="inp" style={{ width: 90 }} placeholder="OT daq" value={f.overtimeMin} onChange={(e) => set("overtimeMin", e.target.value)} />
      <input className="inp" style={{ width: 100 }} placeholder="Smena ovr boshi" value={f.shiftStartOvr} onChange={(e) => set("shiftStartOvr", e.target.value)} />
      <input className="inp" style={{ width: 100 }} placeholder="Smena ovr oxiri" value={f.shiftEndOvr} onChange={(e) => set("shiftEndOvr", e.target.value)} />
      <button className="btn" onClick={() => save(false)}>💾 Saqlash</button>
      <button className="btn" onClick={() => save(true)}>✅ Saqlash + tasdiqlash</button>
      <span className="muted" style={{ fontSize: 12 }}>O'zgartirish jurnalga yoziladi (✏️)</span>
    </div>
  );
}

// ── ⚙️ korxona sozlamalari + oy taqvimi ──
function OrgSettings({ orgs, onChanged, flash }: { orgs: OrgRow[]; onChanged: () => void; flash: (t: string) => void }) {
  const [orgId, setOrgId] = useState<number>(orgs[0]?.id ?? 0);
  const org = orgs.find((o) => o.id === orgId) ?? orgs[0];
  const now = new Date();
  const [calMonth, setCalMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [newOrg, setNewOrg] = useState({ name: "", ownerTelegramId: "" });
  if (!org) return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-title">🏢 Birinchi korxonani yarating</div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input className="inp" placeholder="Nomi (BirJoy ofis)" value={newOrg.name} onChange={(e) => setNewOrg((p) => ({ ...p, name: e.target.value }))} />
        <input className="inp" placeholder="Ega Telegram ID" value={newOrg.ownerTelegramId} onChange={(e) => setNewOrg((p) => ({ ...p, ownerTelegramId: e.target.value }))} />
        <button className="btn" onClick={async () => {
          const r = await adminApi.staffOrgCreate(newOrg.name, newOrg.ownerTelegramId).catch(() => ({ ok: false, error: "tarmoq" }));
          if (!r.ok) { flash("❌ " + (r.error ?? "")); return; }
          flash("✅ Korxona yaratildi"); onChanged();
        }}>Yaratish</button>
      </div>
    </div>
  );

  const patch = async (p: Record<string, unknown>) => {
    const r = await adminApi.staffOrgSave(org.id, p).catch(() => ({ ok: false, error: "tarmoq" }));
    if (!r.ok) { flash("❌ " + (r.error ?? "Saqlanmadi")); return; }
    flash("✅ Saqlandi"); onChanged();
  };

  // taqvim: kun bosilsa default→dam→bayram→ish→default aylanadi
  const cycleDay = async (date: string, cur: "ish" | "dam" | "bayram" | null, defaultKind: "ish" | "dam") => {
    const order: ("ish" | "dam" | "bayram" | null)[] = cur === null ? ["dam", "bayram", "ish", null] : cur === "dam" ? ["bayram", "ish", null] : cur === "bayram" ? ["ish", null] : [null];
    let next = order[0] ?? null;
    // defaultga teng override saqlanmasin
    if (next === defaultKind) next = order[1] ?? null;
    const r = await adminApi.staffCalendarSet(org.id, date, next).catch(() => ({ ok: false }));
    if (!r.ok) { flash("❌ Saqlanmadi"); return; }
    onChanged();
  };

  const [cy, cm] = calMonth.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(cy ?? 2026, cm ?? 1, 0)).getUTCDate();
  const firstWd = ((new Date(Date.UTC(cy ?? 2026, (cm ?? 1) - 1, 1)).getUTCDay() + 6) % 7); // 0=Du
  const shiftCal = (delta: number) => {
    const nd = new Date(Date.UTC(cy ?? 2026, (cm ?? 1) - 1 + delta, 1));
    setCalMonth(`${nd.getUTCFullYear()}-${String(nd.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ minWidth: 190 }} className="muted">{label}</span>{children}</div>
  );

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div className="card-title">⚙️ {org.name}</div>
        {orgs.length > 1 && <select className="inp" value={orgId} onChange={(e) => setOrgId(Number(e.target.value))}>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>}
      </div>
      <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
        <Row label="Smena (default)">
          <input className="inp" style={{ width: 70 }} defaultValue={org.shiftStart} onBlur={(e) => e.target.value !== org.shiftStart && patch({ shiftStart: e.target.value })} />
          <span>–</span>
          <input className="inp" style={{ width: 70 }} defaultValue={org.shiftEnd} onBlur={(e) => e.target.value !== org.shiftEnd && patch({ shiftEnd: e.target.value })} />
        </Row>
        <Row label="Ish kunlari (1=Du…7=Ya)">
          <input className="inp" style={{ width: 110 }} defaultValue={org.workDays} onBlur={(e) => e.target.value !== org.workDays && patch({ workDays: e.target.value })} />
          <span className="muted" style={{ fontSize: 12 }}>mas: 1234567=har kun · 123456=yakshanba dam · 12345=sh-yak dam</span>
        </Row>
        <Row label="Oylik bo'luvchi">
          <select className="inp" value={org.divisorMode} onChange={(e) => patch({ divisorMode: e.target.value })}>
            <option value="haqiqiy">haqiqiy ish kunlari</option><option value="qatiy">qat'iy songa</option>
          </select>
          {org.divisorMode === "qatiy" && <input className="inp" style={{ width: 60 }} defaultValue={org.fixedDivisor} onBlur={(e) => patch({ fixedDivisor: Number(e.target.value) })} />}
        </Row>
        <Row label="Kechikish kechirimi (daq)"><input className="inp" style={{ width: 70 }} defaultValue={org.graceMin} onBlur={(e) => Number(e.target.value) !== org.graceMin && patch({ graceMin: Number(e.target.value) })} /></Row>
        <Row label="Tushlik">
          <input className="inp" style={{ width: 70 }} defaultValue={org.lunchMin} onBlur={(e) => Number(e.target.value) !== org.lunchMin && patch({ lunchMin: Number(e.target.value) })} />
          <span className="muted">daq,</span>
          <label className="muted"><input type="checkbox" checked={org.lunchPaid} onChange={(e) => patch({ lunchPaid: e.target.checked })} /> to'lanadi (ayirilmaydi)</label>
        </Row>
        <Row label="Overtime">
          <select className="inp" value={org.overtimeMode} onChange={(e) => patch({ overtimeMode: e.target.value })}>
            <option value="off">yo'q</option><option value="qolda">qo'lda tasdiq</option><option value="avto">avto</option>
          </select>
          {org.overtimeMode !== "off" && <><span className="muted">×</span><input className="inp" style={{ width: 55 }} defaultValue={org.overtimeMult} onBlur={(e) => patch({ overtimeMult: Number(e.target.value) })} /></>}
        </Row>
        <Row label="Kasallik / Ta'til %">
          <input className="inp" style={{ width: 55 }} defaultValue={org.sickPct} onBlur={(e) => Number(e.target.value) !== org.sickPct && patch({ sickPct: Number(e.target.value) })} />
          <input className="inp" style={{ width: 55 }} defaultValue={org.vacationPct} onBlur={(e) => Number(e.target.value) !== org.vacationPct && patch({ vacationPct: Number(e.target.value) })} />
          <label className="muted"><input type="checkbox" checked={org.holidayPaid} onChange={(e) => patch({ holidayPaid: e.target.checked })} /> bayram to'lanadi</label>
        </Row>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn" onClick={() => shiftCal(-1)}>←</button>
          <b>📅 Oy taqvimi — {calMonth}</b>
          <button className="btn" onClick={() => shiftCal(1)}>→</button>
          <span className="muted" style={{ fontSize: 12 }}>kunni bosing: dam → bayram → ish(yakshanbani ishlatish) → default</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(38px,1fr))", gap: 4, marginTop: 8, maxWidth: 560 }}>
          {WD.map((w) => <div key={w} className="muted" style={{ textAlign: "center", fontSize: 12 }}>{w}</div>)}
          {Array.from({ length: firstWd }).map((_, i) => <div key={"pad" + i} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dnum = i + 1;
            const date = `${calMonth}-${String(dnum).padStart(2, "0")}`;
            const wd = ((firstWd + i) % 7) + 1;
            const override = org.calendar[date] ?? null;
            const defaultKind: "ish" | "dam" = org.workDays.includes(String(wd)) ? "ish" : "dam";
            const kind = override ?? defaultKind;
            const bg = kind === "bayram" ? "#7c5cd126" : kind === "dam" ? "#e0555522" : "#3fb26f22";
            const bd = override ? "2px solid #7c5cd1" : "1px solid transparent";
            return (
              <button key={date} onClick={() => cycleDay(date, override, defaultKind)}
                style={{ padding: "8px 0", borderRadius: 8, background: bg, border: bd, cursor: "pointer", color: "inherit" }}
                title={`${date}: ${kind}${override ? " (istisno)" : ""}`}>
                {dnum}<div style={{ fontSize: 9 }}>{kind === "bayram" ? "🎉" : kind === "dam" ? "dam" : "ish"}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}