import "../env";
import { env } from "../env";
import { KasLiveSource } from "../kas/client";

const client = new KasLiveSource({ baseUrl: env.KAS_BASE_URL, username: env.KAS_USERNAME, password: env.KAS_PASSWORD });
const data = await client.getJson("api/companyInformation");
console.log("systemRentalEndDate =", data.systemRentalEndDate);
console.log("full companyInformation:", JSON.stringify(data, null, 2));
process.exit(0);
