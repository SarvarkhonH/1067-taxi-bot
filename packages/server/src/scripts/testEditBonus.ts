// Carefully tests whether we can WRITE a client's cashback bonus on kas1067.
// Reads -> sets +7 -> verifies -> reverts to original. Usage: tsx testEditBonus.ts [phone]
import "../env";
import { env } from "../env";
import { KasLiveSource } from "../kas/client";

const phone = process.argv[2] ?? "+998973165311"; // low-stakes test client
const client = new KasLiveSource({ baseUrl: env.KAS_BASE_URL, username: env.KAS_USERNAME, password: env.KAS_PASSWORD });

const bonusOf = async () => (await client.fetchByPhone(phone)).find((m) => m.type === "client")?.points ?? null;

const orig = await bonusOf();
console.log(`client ${phone} — current bonus: ${orig}`);
if (orig === null) {
  console.log("no client found for that phone");
  process.exit(0);
}

const testVal = orig + 7;
console.log(`\nsetting bonus -> ${testVal} …`);
console.log("result:", JSON.stringify(await client.setClientBonus(phone, testVal)));
console.log("verify:", await bonusOf(), `(expected ${testVal})`);

console.log(`\nreverting -> ${orig} …`);
console.log("result:", JSON.stringify(await client.setClientBonus(phone, orig)));
console.log("verify:", await bonusOf(), `(orig ${orig})`);

process.exit(0);
