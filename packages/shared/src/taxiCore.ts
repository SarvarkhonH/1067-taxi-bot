/**
 * The taxi core (1067-taxi) speaks its own words. The bot does not.
 *
 * Every screen, the booking sweep and the reward decision were written against
 * one booking vocabulary: `new`/`searching` while a car is being found,
 * `accepted`/`on_the_way` while it drives over, `arrived`, `started` once the
 * meter runs, `delivered` when it is paid, `cancel_by_*` when it is not. The
 * core says `pending`, `dispatching`, `in_progress`, `completed`,
 * `cancelled_client`…
 *
 * Nothing errors when those two lists disagree. The sweep sets the ride meter
 * only on `started`; an order that never showed `started` finishes through the
 * cancel branch. So every real ride would have shown the passenger
 * "❌ Buyurtma bekor qilindi" and paid no tanga — fleet-wide, silently. That is
 * why this lives here, where the CI shield runs it, and why an unknown word is
 * reported rather than passed through.
 */

/** Every value of the core's `order_status` enum, in its own order. */
export const CORE_ORDER_STATUSES = [
  "pending",
  "dispatching",
  "accepted",
  "driver_en_route",
  "driver_arrived",
  "in_progress",
  "completed",
  "cancelled_client",
  "cancelled_driver",
  "cancelled_dispatcher",
  "no_drivers",
  "expired",
] as const;

export type CoreOrderStatus = (typeof CORE_ORDER_STATUSES)[number];

const CORE_TO_BOOKING: Record<CoreOrderStatus, string> = {
  pending: "new",
  dispatching: "searching",
  // An operator is still trying to place it. To the passenger that is searching,
  // not over — telling them otherwise invites a second order for the same trip.
  no_drivers: "searching",
  accepted: "accepted",
  driver_en_route: "on_the_way",
  driver_arrived: "arrived",
  in_progress: "started",
  completed: "delivered",
  cancelled_client: "cancel_by_client",
  cancelled_driver: "cancel_by_driver",
  cancelled_dispatcher: "cancel_by_operator",
  expired: "cancel_by_server",
};

export function isCoreOrderStatus(s: string): s is CoreOrderStatus {
  return Object.prototype.hasOwnProperty.call(CORE_TO_BOOKING, s);
}

/**
 * Core status → the bot's booking status.
 *
 * `unknown` is set when the core used a word this table has never seen. The
 * value returned is then the raw word, which every consumer treats as "not
 * started, not finished" — the caller must alert, because that is exactly the
 * shape of the silent no-payout failure described above.
 */
export function coreStatusToBooking(status: string): { status: string; unknown: boolean } {
  const s = String(status ?? "").trim();
  if (isCoreOrderStatus(s)) return { status: CORE_TO_BOOKING[s], unknown: false };
  return { status: s, unknown: true };
}

/**
 * The core answered, and said no.
 *
 * Kept apart from every other failure on purpose. A write that got a reply —
 * 400, 404, 409 — did not happen, and it is safe to give the passenger their
 * tanga back. A write that got NO reply (timeout, refused connection, dropped
 * socket) may have happened: the core can apply a payment and die before it
 * answers. Treating those two alike is how a debt is paid twice.
 */
export class CoreHttpError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly detail: string,
  ) {
    super(`taxi core ${method} ${path} → HTTP ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "CoreHttpError";
  }
}

/**
 * Connection never opened — the request did not leave this machine, so nothing happened.
 * (A reset or a timeout is different: the core may have received it.)
 */
const NEVER_SENT_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]);

/** True when nobody can know whether the core acted — no answer came back. */
export function coreOutcomeUnknown(err: unknown): boolean {
  if (err instanceof CoreHttpError) return err.status >= 500 && err.status !== 501;
  const code = (err as { cause?: { code?: unknown }; code?: unknown } | null)?.cause?.code ?? (err as { code?: unknown } | null)?.code;
  if (typeof code === "string" && NEVER_SENT_CODES.has(code)) return false;
  return true;
}

/**
 * What the passenger reads when an order did not go through. Plain text — the Mini App renders it
 * as text and the bot escapes it, so markup would show up as literal tags.
 *
 * The core's own messages are English and written for engineers
 * ("Address not found in catalog"). A passenger in Koson can do one thing with
 * any of them: ring the dispatcher. A refusal because they already have a car
 * coming is the exception — that one they must hear.
 */
export function coreRiderMessage(err: unknown): string {
  const NL = String.fromCharCode(10);
  if (err instanceof CoreHttpError && err.status === 409) {
    return "Sizda faol buyurtma bor — avvalgisi hali tugamagan.";
  }
  if (err instanceof CoreHttpError && err.status >= 400 && err.status < 500) {
    return (
      "Buyurtma qabul qilinmadi. Manzilni qayta tanlab ko‘ring." + NL + NL +
      "Bo‘lmasa, taksini 1067 raqamiga qo‘ng‘iroq qilib chaqiring."
    );
  }
  return (
    "Hozir buyurtma yuborilmadi — tizimda vaqtincha nosozlik." + NL + NL +
    "Iltimos, taksini to‘g‘ridan-to‘g‘ri 1067 raqamiga qo‘ng‘iroq qilib chaqiring. Uzr so‘raymiz."
  );
}

/**
 * The core's own driver id, from a member's kasId — `bj_<id>` once the member
 * has been matched in the core. Anything else (a kas-era number, a `tg_` id)
 * names nobody in the core, so it is not sent: the plate alone identifies the
 * driver, and the core refuses a payment whose id and plate disagree.
 */
export function coreDriverIdFromKasId(kasId: string | null | undefined): number | undefined {
  const m = /^bj_(\d+)$/.exec(String(kasId ?? ""));
  if (!m) return undefined;
  const id = Number(m[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

/**
 * The one phone format the core stores: `+998` and nine digits.
 *
 * The core finds a passenger by exact match. The bot has stored the same person
 * as `998907773566`, `+998907773566` and, for family members, `907773566` —
 * sending those as-is creates a second client for one human, and their active
 * order becomes invisible to the double-order guard. Returns null when there are
 * not nine digits to work with.
 */
export function coreUzPhone(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  return `+998${digits.slice(-9)}`;
}

/**
 * The core reports trip distance in kilometres; the bot's ride records, fare
 * card and history were written for metres. Undefined stays undefined — a ride
 * with no recorded distance must not become a ride of 0 m.
 */
export function coreKmToMeters(km: number | string | null | undefined): number | undefined {
  if (km === null || km === undefined || km === "") return undefined;
  const n = Number(km);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 1000);
}

/**
 * A coordinate from the core, or nothing.
 *
 * `0` is a real number and a real place (the Gulf of Guinea). Every map and the
 * Telegram live pin accept it, so a missing position must never be reported as
 * zero — it drew the passenger's car in the ocean and zoomed the map to the
 * whole planet.
 */
export function coreCoord(v: number | string | null | undefined): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return undefined;
  return n;
}
