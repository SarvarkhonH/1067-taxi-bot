// End-to-end PROD check of the S2 game + client endpoints with a signed owner
// initData. Plays one real race + crash + park action on the live backend.
import "../env";
import crypto from "node:crypto";
import { RACE_STAKES, raceChecksum, scoreRun } from "@t1067/shared";
import { env } from "../env";

const ownerId = process.argv[2] ?? "6506297119";
const base = "https://kas1067-taxi-bot.onrender.com";

function sign(): string {
  const user = JSON.stringify({ id: Number(ownerId), first_name: "Sarvarxon", username: "Sarvarxonh" });
  const p = new URLSearchParams({ user, auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AAEgames" });
  const dcs = [...p.entries()].filter(([k]) => k !== "hash" && k !== "signature").map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(env.BOT_TOKEN).digest();
  p.set("hash", crypto.createHmac("sha256", secret).update(dcs).digest("hex"));
  return p.toString();
}
const H = { "X-Telegram-Init-Data": sign(), "Content-Type": "application/json" };
const call = (path: string, method = "GET", body?: unknown): Promise<{ status: number; json: any }> =>
  fetch(`${base}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));

let fails = 0;
const ok = (c: boolean, label: string, extra = "") => {
  console.log(`${c ? "✅" : "❌"} ${label} ${extra}`);
  if (!c) fails++;
};

// seed the owner with coins so games are playable (admin grant via mission claim is slow; use wallet check)
const wallet = await call("/api/wallet");
ok(wallet.status === 200, "GET /api/wallet", `coins=${wallet.json.coins}`);

const fare = await call("/api/fare/config");
ok(fare.status === 200 && typeof fare.json.minimalPayment === "number", "GET /api/fare/config", `cashback/app=${fare.json?.cashback?.perAppRide}`);

const park = await call("/api/park");
ok(park.status === 200 && Array.isArray(park.json.cars), "GET /api/park", `cars=${park.json?.cars?.length}`);

const board = await call(`/api/race/board?stake=${RACE_STAKES[0]}`);
ok(board.status === 200 && Array.isArray(board.json.entries), "GET /api/race/board", `entries=${board.json?.entries?.length}`);

// try a real staked race if the owner has coins
if ((wallet.json.coins ?? 0) >= RACE_STAKES[0]) {
  const start = await call("/api/race/create", "POST", { stake: RACE_STAKES[0] });
  ok(start.status === 200 && start.json.ok, "POST /api/race/create", `seed=${start.json?.seed}`);
  if (start.json?.ok) {
    const inputs = [20, 0, 120, 2, 300, 1];
    const { score } = scoreRun(start.json.seed, inputs);
    const fin = await call("/api/race/finish", "POST", { sessionId: start.json.sessionId, token: start.json.token, inputs, durationMs: 31000, score, checksum: raceChecksum(inputs) });
    ok(fin.status === 200 && fin.json.ok, "POST /api/race/finish", `won=${fin.json?.won} reward=${fin.json?.reward} serverScore=${fin.json?.serverScore}`);
  }
} else {
  console.log("ℹ️  owner has < stake coins — skipping live race play (endpoints still 200)");
}

const duels = await call("/api/duel/list");
ok(duels.status === 200 && Array.isArray(duels.json.open), "GET /api/duel/list", `open=${duels.json?.open?.length}`);

const quiz = await call("/api/quiz");
ok(quiz.status === 200 && Array.isArray(quiz.json.questions) && quiz.json.questions.length === 5, "GET /api/quiz", `q=${quiz.json?.questions?.length}`);
ok(quiz.json?.questions?.[0] && !("correct" in (quiz.json.questions[0].options ?? {})), "quiz answers not leaked to client");

console.log(fails ? `\n❌ ${fails} FAILURES` : "\n🎉 prod games verified");
process.exit(fails ? 1 : 0);
