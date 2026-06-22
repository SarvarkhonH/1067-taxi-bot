// 📡 Driver-app REST wrapper — talks to /api/driverApp/* on http://46.8.176.53/kas1067/. Used by
// the bot's /driver_login flow + future driver-side features (qarz, history, queue push). Auth is
// (carNumber, secretKey) in the body — NO Bearer, NO cookie. Unlike the kas admin client, this
// requires NO server-side login: each call carries the driver's own creds, scoped only to that
// driver's data.
//
// In KAS_MODE=mock we never hit the network — login returns a deterministic fake so the bot UI
// flow can be exercised in tests. The mock secretKey is recognisable ("mock-…") so a stray live
// call rejects fast.
import { env } from "../env";

const APP_VERSION = "12.6"; // matches the latest decompiled APK (uz.kas1067.driver, versionCode 126)
const TIMEOUT_MS = 10_000;

function driverBase(): string {
  // env.KAS_BASE_URL is "http://46.8.176.53/kas1067" with no trailing slash.
  return `${env.KAS_BASE_URL.replace(/\/$/, "")}/api/driverApp`;
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<{ status: number; data: T | null; rawText: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${driverBase()}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=utf-8", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data: T | null = null;
    try {
      data = text ? (JSON.parse(text) as T) : null;
    } catch {
      /* non-JSON body → caller gets raw + null data */
    }
    return { status: res.status, data, rawText: text };
  } finally {
    clearTimeout(t);
  }
}

export interface DriverLoginResult {
  ok: boolean;
  phoneNumber?: string; // driver's registered phone (kas confirms which number got the SMS)
  smsCentreNumber1?: string;
  smsCentreNumber2?: string;
  /** kas's "tentative" secretKey — the device-bound identity. NOT proven until SMS confirms. */
  preliminaryKey?: string;
  status?: number;
  error?: string;
}

/** Step 1 of driver auth: kas sends an SMS to the registered driver phone. Returns the centres
 *  the SMS will originate from (the rider sees "from 4040" etc.) and a "preliminary" secretKey
 *  that we DO NOT store — the SMS-confirm step is the one that issues the live key. */
export async function driverLogin(carNumber: string, deviceSerial: string): Promise<DriverLoginResult> {
  const car = carNumber.replace(/\s/g, "").toUpperCase();
  if (env.KAS_MODE === "mock") {
    // Deterministic mock: any plausible plate "succeeds" without a network call.
    if (car.length < 4) return { ok: false, error: "carNumber too short" };
    return {
      ok: true,
      phoneNumber: "+99890******7",
      smsCentreNumber1: "4040",
      smsCentreNumber2: "4070",
      preliminaryKey: `mock-prelim-${car}`,
    };
  }
  try {
    const r = await postJson<{ phoneNumber?: string; smsCentreNumber1?: string; smsCentreNumber2?: string; secretKey?: string }>(
      "driverLogin/",
      { carNumber: car, deviceSerial, appVersion: APP_VERSION },
    );
    if (r.status >= 300 || !r.data) {
      return { ok: false, status: r.status, error: r.rawText.slice(0, 200) || `HTTP ${r.status}` };
    }
    return {
      ok: true,
      status: r.status,
      phoneNumber: r.data.phoneNumber,
      smsCentreNumber1: r.data.smsCentreNumber1,
      smsCentreNumber2: r.data.smsCentreNumber2,
      preliminaryKey: r.data.secretKey,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface DriverConfirmSmsResult {
  ok: boolean;
  /** The CONFIRMED secretKey — what gets sealed and used for every future /driverApp/* call. */
  secretKey?: string;
  status?: number;
  error?: string;
}

/** Step 2: the driver reads the SMS code, types it back. kas validates and returns the live
 *  secretKey. Mock: any 4-6 digit code accepted, returns a deterministic key. */
export async function driverConfirmSms(carNumber: string, smsCode: string): Promise<DriverConfirmSmsResult> {
  const car = carNumber.replace(/\s/g, "").toUpperCase();
  const code = smsCode.replace(/\D/g, "");
  if (code.length < 4 || code.length > 6) return { ok: false, error: "invalid SMS code length" };
  if (env.KAS_MODE === "mock") {
    return { ok: true, secretKey: `mock-secret-${car}` };
  }
  try {
    const r = await postJson<{ secretKey?: string }>("driverConfirmSms/", { carNumber: car, smsCode: code, appVersion: APP_VERSION });
    if (r.status >= 300 || !r.data?.secretKey) {
      return { ok: false, status: r.status, error: r.rawText.slice(0, 200) || `HTTP ${r.status}` };
    }
    return { ok: true, status: r.status, secretKey: r.data.secretKey };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** A stable per-member deviceSerial so kas sees us as "the same device" between calls. Real APK
 *  uses the Android Settings.Secure.ANDROID_ID; we synthesise one tied to our bot + memberId so
 *  the bot becomes one logical device per driver in kas's view. */
export function botDeviceSerial(memberId: number): string {
  return `1067bot-${memberId}`;
}
