// 🔬 PROBE (W2 №1 gate): connect to the kas1067 CLIENT Netty socket exactly like the official rider
// app and DUMP every status frame during a real order — so we can build kasClientSocket.ts on PROVEN
// host/port + frame semantics, never a guess (same discipline as the map-socket probe).
//
// Grounded in the APK decompile (client-apk-decomp):
//   host = ApiConstants.API_IP = 46.8.176.53                (NettyClient.java:78)
//   port = checkClient → clientServerPropertyDto.clientSocketPort  (ClientCheckResponseDto.java:160)
//   wire = line-delimited (\n), UTF-8, frames wrapped "#<...>"      (NettyClient.java:63,94)
//   req  = "#<STATUS|phone|secretKey|lat|lng>\r\n", STATUS ∈ auth|start|location  (ClientNettyRequestDto.java:106)
//   flow = connect → send auth → recv "auth_success" → send start → recv new_/take_/called_/in_place_booking
//
// USAGE:  pnpm --filter @t1067/server exec tsx src/scripts/probeClientSocket.ts <phone>
//         then place a REAL order for that phone (bot/app) → watch the frames land here.
//         Runs ~8 min then exits (or Ctrl-C). READ-ONLY: we only observe (auth+start = what the app does).
import "../env";
import net from "node:net";
import { getDataSource } from "../kas";

const HOST = "46.8.176.53";
const RUN_MS = 8 * 60_000;

interface ClientKasOps {
  readClientAuth(phone: string): Promise<{ secretKey: string | null; loginSmsCode: string | null }>;
  clientCheckClient(phone: string, secretKey: string): Promise<{ status: number; body: string }>;
}

function ts(): string {
  return new Date(Date.now() + 5 * 3600_000).toISOString().slice(11, 23); // Tashkent HH:mm:ss.mmm
}

async function main(): Promise<void> {
  const phone = process.argv[2];
  if (!phone) {
    console.error("usage: tsx src/scripts/probeClientSocket.ts <phone>  (e.g. 901234567)");
    process.exit(1);
  }
  const ds = getDataSource() as unknown as ClientKasOps;

  console.log(`[probe] reading operator-side auth for ${phone}…`);
  const auth = await ds.readClientAuth(phone);
  if (!auth.secretKey) {
    console.error(`[probe] no secretKey for ${phone} — this client has never logged into the kas app (or wrong phone).`);
    process.exit(1);
  }
  const secretKey = auth.secretKey;
  console.log(`[probe] secretKey ok (…${secretKey.slice(-4)}). fetching clientSocketPort via checkClient…`);

  const chk = await ds.clientCheckClient(phone, secretKey);
  let port = 0;
  try {
    const j = JSON.parse(chk.body) as { clientServerPropertyDto?: { clientSocketPort?: number; clientLocationTimer?: number } };
    port = Number(j.clientServerPropertyDto?.clientSocketPort ?? 0);
    console.log(`[probe] checkClient ok — clientSocketPort=${port} clientLocationTimer=${j.clientServerPropertyDto?.clientLocationTimer ?? "?"}`);
  } catch {
    console.error(`[probe] checkClient did not return JSON (status ${chk.status}):`, chk.body.slice(0, 200));
    process.exit(1);
  }
  if (!port) {
    console.error("[probe] clientSocketPort missing from checkClient — cannot connect.");
    process.exit(1);
  }

  console.log(`[probe] connecting TCP ${HOST}:${port} …`);
  const sock = net.connect(port, HOST);
  sock.setEncoding("utf8");
  sock.setKeepAlive(true, 30_000);

  const send = (status: string) => {
    const frame = `#<${status}|${phone}|${secretKey}|0.0|0.0>\r\n`;
    sock.write(frame);
    console.log(`${ts()}  → SENT ${status}`);
  };

  let buf = "";
  sock.on("connect", () => {
    console.log(`${ts()}  ✅ connected — sending auth`);
    send("auth");
  });
  sock.on("data", (chunk: string) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const raw = buf.slice(0, nl).replace(/\r/g, "");
      buf = buf.slice(nl + 1);
      if (!raw) continue;
      const inner = raw.replace(/^#?</, "").replace(/>$/, ""); // strip #< … >
      const status = inner.split("|")[0] ?? "";
      console.log(`${ts()}  ← FRAME  status="${status}"  raw=${inner}`);
      if (status === "auth_success") send("start"); // mirror the app: auth → start → then it streams booking status
    }
  });
  sock.on("error", (e) => console.error(`${ts()}  ⚠️ socket error:`, e.message));
  sock.on("close", () => console.log(`${ts()}  socket closed`));

  console.log(`[probe] listening ${RUN_MS / 60000} min — NOW place a real order for ${phone} and watch the frames.`);
  setTimeout(() => {
    console.log("[probe] time up — closing.");
    sock.destroy();
    process.exit(0);
  }, RUN_MS);
}

main().catch((e) => {
  console.error("[probe] fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
