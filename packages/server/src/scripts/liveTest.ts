// Pull a CAPPED slice of real kas1067 data to prove the live integration,
// without touching the DB or .env. Usage: tsx src/scripts/liveTest.ts [pages=2] [size=100]
import "../env";
import { env } from "../env";
import { KasLiveSource } from "../kas/client";

const maxPages = Number(process.argv[2]) || 2;
const pageSize = Number(process.argv[3]) || 100;

const client = new KasLiveSource({
  baseUrl: env.KAS_BASE_URL,
  username: env.KAS_USERNAME,
  password: env.KAS_PASSWORD,
  pageSize,
  maxPages,
});

console.log(`Pulling up to ${maxPages} page(s) × ${pageSize} per type from ${env.KAS_BASE_URL} …\n`);
const members = await client.fetchMembers();
const drivers = members.filter((m) => m.type === "driver");
const clients = members.filter((m) => m.type === "client");
console.log(`Pulled ${members.length}: ${drivers.length} drivers, ${clients.length} clients\n`);

const showTop = (arr: typeof members, label: string) => {
  console.log(`Top ${label} by points:`);
  [...arr]
    .sort((a, b) => b.points - a.points)
    .slice(0, 8)
    .forEach((m) =>
      console.log(
        `  ${m.fullName.padEnd(22)} pts=${m.points}  trips=${m.trips}${m.rating ? `  ★${m.rating}` : ""}${m.carNumber ? `  ${m.carNumber}` : ""}`,
      ),
    );
  console.log("");
};
showTop(drivers, "drivers");
showTop(clients, "clients");

process.exit(0);
