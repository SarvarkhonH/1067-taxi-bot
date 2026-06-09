// Test the booking READ endpoints live (no order is created). Usage: tsx testBooking.ts [phone] [addrQuery]
import "../env";
import { getDataSource } from "../kas";

const ds = getDataSource();
const phone = process.argv[2] ?? "+998973165311";
const query = process.argv[3] ?? "Koson";

console.log(`checkClient(${phone}):`);
console.log(JSON.stringify(await ds.checkClient(phone), null, 2));

console.log(`\nsearchAddresses("${query}"):`);
console.log(JSON.stringify(await ds.searchAddresses(query), null, 2));

console.log(`\ngetActiveBooking(${phone}):`);
console.log(JSON.stringify(await ds.getActiveBooking(phone), null, 2));

process.exit(0);
