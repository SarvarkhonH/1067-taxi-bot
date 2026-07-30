// ◍ ODAMLAR — eski panelning OLTITA tabini yutadi:
//   driver · client · botusers · x360 · banlist · blocked
// Tur/holat endi TAB emas, FILTR; `x360` esa alohida ekran emas, shu yerdagi
// drill-down panelining O'ZI.
import { useEffect, useMemo, useState } from "react";
import type { AdminBotUser, AdminBotUsersResponse } from "@t1067/shared";
import { adminApi, type Member360, type OprJurnalRow } from "../../api";
import { DataTable, type Column } from "../../design/DataTable";
import {
  Async,
  Badge,
  Button,
  ConfirmDialog,
  CopyButton,
  Dot,
  Drawer,
  Field,
  Input,
  KV,
  Panel,
  SkeletonRows,
  Tabs,
  useToast,
} from "../../design/kit";
import { ago, dt, num, phone as fmtPhone, tanga } from "../../lib/fmt";
import { closeEntity, navigate, useRoute } from "../../lib/routing";

type Filt = "all" | "linked" | "unlinked" | "online" | "driver";

export function Odamlar() {
  const route = useRoute();
  const [data, setData] = useState<AdminBotUsersResponse | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [filt, setFilt] = useState<Filt>("all");

  const load = (): void => {
    setErr(null);
    adminApi
      .botUsers()
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };
  useEffect(load, []);

  const rows = useMemo(() => {
    const all = data?.users ?? null;
    if (!all) return all;
    return all.filter((u) =>
      filt === "linked"
        ? u.linked
        : filt === "unlinked"
          ? !u.linked
          : filt === "online"
            ? u.online
            : filt === "driver"
              ? u.memberType === "driver"
              : true,
    );
  }, [data, filt]);

  const columns: Column<AdminBotUser>[] = [
    {
      key: "name",
      label: "Ism",
      sort: (u) => u.memberName || u.name,
      render: (u) => (
        <>
          <div className="tb-main a2-row">
            {u.online && <Dot tone="ok" live />}
            <span className="a2-truncate">{u.memberName || u.name || "—"}</span>
          </div>
          {u.username && <div className="tb-sub">@{u.username}</div>}
        </>
      ),
    },
    {
      key: "phone",
      label: "Telefon",
      sort: (u) => u.phone ?? "",
      csv: (u) => u.phone ?? "",
      render: (u) => (u.phone ? <span className="a2-num">{fmtPhone(u.phone)}</span> : <span className="a2-dim-2">—</span>),
    },
    {
      key: "linked",
      label: "Holat",
      align: "mid",
      sort: (u) => (u.linked ? 1 : 0),
      csv: (u) => (u.linked ? "ulangan" : "ulanmagan"),
      render: (u) =>
        u.linked ? (
          <Badge tone={u.memberType === "driver" ? "info" : "ok"}>{u.memberType === "driver" ? "haydovchi" : "mijoz"}</Badge>
        ) : (
          <Badge>ulanmagan</Badge>
        ),
    },
    {
      key: "lastActive",
      label: "Oxirgi faollik",
      align: "num",
      hideSmall: true,
      sort: (u) => new Date(u.lastActive).getTime(),
      csv: (u) => u.lastActive,
      render: (u) => (
        <span title={u.seenReliable ? "aniq" : "taxminiy (eski yozuv)"}>
          {ago(u.lastActive)}
          {!u.seenReliable && <span className="a2-dim-2"> ~</span>}
        </span>
      ),
    },
    {
      key: "joinedAt",
      label: "Qo'shilgan",
      align: "num",
      hideSmall: true,
      sort: (u) => new Date(u.joinedAt).getTime(),
      csv: (u) => u.joinedAt,
      render: (u) => dt(u.joinedAt),
    },
  ];

  return (
    <>
      <Panel flush>
        <DataTable
          rows={rows}
          error={err}
          onRetry={load}
          columns={columns}
          rowKey={(u) => u.telegramId}
          onRowClick={(u) => navigate("odamlar", u.telegramId)}
          searchText={(u) => `${u.name} ${u.memberName ?? ""} ${u.username ?? ""} ${u.phone ?? ""} ${u.telegramId}`}
          searchPlaceholder="Ism, @username, telefon, Telegram id…"
          chips={[
            { label: "Hammasi", active: filt === "all", onClick: () => setFilt("all") },
            { label: "Ulangan", active: filt === "linked", onClick: () => setFilt("linked") },
            { label: "Ulanmagan", active: filt === "unlinked", onClick: () => setFilt("unlinked") },
            { label: "Onlayn", active: filt === "online", onClick: () => setFilt("online") },
            { label: "Haydovchi", active: filt === "driver", onClick: () => setFilt("driver") },
          ]}
          exportName="odamlar"
          emptyTitle="Foydalanuvchi topilmadi"
          initialSort={{ key: "lastActive", dir: "desc" }}
        />
      </Panel>

      {data && (
        <div className="a2-row-wrap">
          <span className="a2-dim-2">
            Jami {num(data.total)} · ulangan {num(data.linked)} · bugun qo'shilgan {num(data.newToday)}
          </span>
          <span className="a2-dim-2">
            · Telegram'siz (faqat kas) mijozlar bu ro'yxatda yo'q — ularni ⌘K orqali telefon bo'yicha toping
          </span>
        </div>
      )}

      {route.id && <MemberDrawer telegramId={route.id} onClose={() => closeEntity(route)} />}
    </>
  );
}

// ─────────────────────────── DRILL-DOWN PANELI ───────────────────────────────
type DTab = "umumiy" | "pul" | "amallar" | "jurnal";

function MemberDrawer({ telegramId, onClose }: { telegramId: string; onClose: () => void }) {
  const [tab, setTab] = useState<DTab>("umumiy");
  const [user, setUser] = useState<AdminBotUser | null | undefined>(undefined);
  const [m360, setM360] = useState<Member360 | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setUser(undefined);
    setM360(undefined);
    setErr(null);
    adminApi
      .botUsers()
      .then((r) => {
        const u = r.users.find((x) => x.telegramId === telegramId) ?? null;
        setUser(u);
        if (u?.phone) {
          adminApi
            .member360(u.phone)
            .then(setM360)
            .catch(() => setM360(null));
        } else {
          setM360(null);
        }
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [telegramId]);

  const memberId = m360?.member.id ?? null;

  return (
    <Drawer
      open
      onClose={onClose}
      width={640}
      head={
        <div className="a2-col">
          <div className="a2-between">
            <div>
              <h2 className="a2-h2">{user?.memberName || user?.name || "Yuklanmoqda…"}</h2>
              {user?.phone && (
                <div className="a2-row a2-dim">
                  <span className="a2-num">{fmtPhone(user.phone)}</span>
                  <CopyButton value={user.phone} />
                </div>
              )}
            </div>
            <Button variant="ghost" size="sm" icon onClick={onClose} title="Yopish (Esc)">
              ✕
            </Button>
          </div>
          <div className="a2-row-wrap">
            {user?.online && (
              <Badge tone="ok">
                <Dot tone="ok" live /> onlayn
              </Badge>
            )}
            {user?.linked ? (
              <Badge tone={user.memberType === "driver" ? "info" : "ok"}>
                {user.memberType === "driver" ? "haydovchi" : "mijoz"}
              </Badge>
            ) : (
              <Badge tone="warn">raqam ulanmagan</Badge>
            )}
            {user?.isAdmin && <Badge tone="brand">admin</Badge>}
            {m360?.member.banned && <Badge tone="bad">bloklangan</Badge>}
            {m360?.member.riskFlag && <Badge tone="warn">naqd muzlatilgan</Badge>}
            {m360?.member.tier && <Badge>{m360.member.tier}</Badge>}
          </div>
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "umumiy", label: "Umumiy" },
              { value: "pul", label: "Pul" },
              { value: "amallar", label: "Amallar" },
              { value: "jurnal", label: "Jurnal" },
            ]}
          />
        </div>
      }
    >
      {err ? (
        <span className="a2-dim">{err}</span>
      ) : tab === "umumiy" ? (
        <div className="a2-col-4">
          <KV
            rows={[
              { k: "Telegram", v: <span className="a2-row"><span className="a2-mono">{telegramId}</span> <CopyButton value={telegramId} /></span> },
              { k: "Username", v: user?.username ? `@${user.username}` : "—" },
              { k: "Qo'shilgan", v: user ? dt(user.joinedAt) : "—" },
              { k: "Raqam ulangan", v: user?.linkedAt ? dt(user.linkedAt) : "—" },
              { k: "Oxirgi faollik", v: user ? `${ago(user.lastActive)}${user.seenReliable ? "" : " (taxminiy)"}` : "—" },
            ]}
          />
          <Async data={m360} skeleton={<SkeletonRows rows={4} h={22} />}>
            {(m) =>
              m ? (
                <KV
                  rows={[
                    { k: "Tanga", v: <Badge tone="coin">{tanga(m.member.coins)}</Badge> },
                    { k: "Safarlar (jami)", v: num(m.member.trips) },
                    { k: "Safarlar (30 kun)", v: num(m.rides30) },
                    { k: "Baholagan", v: num(m.ratings) },
                    { k: "Buyumlar", v: num(m.items) },
                    { k: "Gap (davra)", v: m.gap ?? "—" },
                    { k: "Ro'yxatdan o'tgan", v: dt(m.member.createdAt) },
                    { k: "BirJoy Plus", v: m.member.plusUntil ? `${dt(m.member.plusUntil)} gacha` : "yo'q" },
                  ]}
                />
              ) : (
                <span className="a2-dim">
                  {user?.phone ? "Bu raqam bo'yicha a'zo topilmadi." : "Raqam ulanmagan — a'zo ma'lumoti yo'q."}
                </span>
              )
            }
          </Async>
        </div>
      ) : tab === "pul" ? (
        <Async data={m360} skeleton={<SkeletonRows rows={6} />}>
          {(m) =>
            !m || m.txns.length === 0 ? (
              <span className="a2-dim">Tanga harakati yo'q.</span>
            ) : (
              <div className="a2-col">
                {m.txns.map((t, i) => (
                  <div className="a2-between" key={i}>
                    <div className="a2-col">
                      <span>{t.reason || t.kind}</span>
                      <span className="tb-sub">
                        {t.kind} · {dt(t.at)}
                      </span>
                    </div>
                    <span className={`a2-num ${t.amount >= 0 ? "a2-delta-up" : "a2-delta-down"}`}>
                      {t.amount >= 0 ? "+" : ""}
                      {num(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )
          }
        </Async>
      ) : tab === "amallar" ? (
        <MemberActions telegramId={telegramId} memberId={memberId} />
      ) : (
        <MemberJurnal memberId={memberId} />
      )}
    </Drawer>
  );
}

// ─────────────────────────────── AMALLAR ─────────────────────────────────────
function MemberActions({ telegramId, memberId }: { telegramId: string; memberId: number | null }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<string | null>(null);
  const [coins, setCoins] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmBan, setConfirmBan] = useState(false);

  const act = async (action: string, params: Record<string, unknown> = {}): Promise<void> => {
    setBusy(action);
    setOut(null);
    try {
      const r = await adminApi.oprAct(memberId, telegramId, action, params);
      setOut(r.message);
      toast(r.message, r.ok ? "ok" : "bad");
    } catch {
      toast("Bajarilmadi", "bad");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="a2-col-4">
      <Panel title="Tezkor">
        <div className="a2-row-wrap">
          <Button size="sm" loading={busy === "status_taxi"} onClick={() => act("status_taxi")}>
            📍 Taksi holati
          </Button>
          <Button size="sm" loading={busy === "balance"} onClick={() => act("balance")}>
            🪙 Balans
          </Button>
          <Button size="sm" loading={busy === "stats"} onClick={() => act("stats", { period: "oy" })}>
            📊 Oylik hisobot
          </Button>
        </div>
      </Panel>

      <Panel title="Xabar yuborish">
        <div className="a2-row">
          <Input value={msg} onChange={setMsg} placeholder="Mijozga xabar…" />
          <Button
            size="sm"
            variant="primary"
            disabled={!msg.trim()}
            loading={busy === "send_button"}
            onClick={() => act("send_button", { text: msg.trim() }).then(() => setMsg(""))}
          >
            Yuborish
          </Button>
        </div>
      </Panel>

      <Panel title="Tanga">
        <div className="a2-row">
          <Field label="Summa (± )">
            <Input value={coins} onChange={setCoins} placeholder="masalan 5000 yoki -5000" numeric />
          </Field>
          <Field label="Sabab">
            <Input value={reason} onChange={setReason} placeholder="nima uchun" />
          </Field>
          <Button
            size="sm"
            variant="primary"
            disabled={!Number(coins)}
            loading={busy === "coins"}
            onClick={() => act("coins", { amount: Number(coins), reason: reason.trim() }).then(() => setCoins(""))}
          >
            Qo'llash
          </Button>
        </div>
      </Panel>

      <Panel title="Cheklovlar">
        <div className="a2-row-wrap">
          <Button size="sm" variant="danger" loading={busy === "ban"} onClick={() => setConfirmBan(true)}>
            🚫 Naqdni muzlatish
          </Button>
          <Button size="sm" loading={busy === "unban"} onClick={() => act("unban")}>
            ✅ Muzlatishni olib tashlash
          </Button>
        </div>
      </Panel>

      {out && <div className="a2-panel a2-panel-pad a2-dim">{out}</div>}

      <ConfirmDialog
        open={confirmBan}
        onClose={() => setConfirmBan(false)}
        onConfirm={() => {
          setConfirmBan(false);
          void act("ban", { reason: reason.trim() || "operator" });
        }}
        title="Naqd yechishni muzlatamizmi?"
        body={<p className="a2-dim">Bu foydalanuvchi tangasini so'mga yecha olmaydi. Botdan foydalanish davom etadi.</p>}
        confirmLabel="Muzlatish"
        danger
      />
    </div>
  );
}

// ─────────────────────────────── JURNAL ──────────────────────────────────────
function MemberJurnal({ memberId }: { memberId: number | null }) {
  const [rows, setRows] = useState<OprJurnalRow[] | null | undefined>(undefined);
  useEffect(() => {
    adminApi
      .oprJurnal()
      .then((r) => setRows(r.items.filter((i) => memberId != null && i.targetId === memberId)))
      .catch(() => setRows(null));
  }, [memberId]);

  return (
    <Async data={rows} skeleton={<SkeletonRows rows={4} />}>
      {(list) =>
        list.length === 0 ? (
          <span className="a2-dim">Bu a'zo bo'yicha operator amallari yo'q.</span>
        ) : (
          <div className="a2-col">
            {list.map((r) => (
              <div className="a2-col" key={r.id}>
                <div className="a2-between">
                  <span>
                    <b>{r.actorRole}</b> <span className="a2-dim">— {r.action.replace(/^opr_/, "")}</span>
                  </span>
                  <span className="a2-dim-2">{dt(r.createdAt)}</span>
                </div>
                {r.detail && <span className="tb-sub">{r.detail}</span>}
              </div>
            ))}
          </div>
        )
      }
    </Async>
  );
}
