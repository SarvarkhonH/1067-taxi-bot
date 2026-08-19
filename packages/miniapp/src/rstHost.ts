// 🔌 MINI-APP MEZBON KO'PRIGI — biz Telegram O'RNIDA turamiz (2026-08-16).
//
// MUAMMO VA SABABI — o'lchandi (app.birjoy.online origin'idan), taxmin emas:
//
// Hamkor mini-appini `<iframe>` ga solganimizda biz uning MEZBONIGA aylanamiz. Rasmiy
// `telegram-web-app.js` mezbondan narsalar SO'RAYDI va javobni KUTADI. Telegram hammasiga
// javob beradi — biz esa hech biriga bermasdik.
//
// 1-o'lchov (ko'prik YO'Q):
//   iframe_ready · web_app_set_header_color · web_app_set_bottom_bar_color
//   web_app_request_theme · web_app_request_viewport · web_app_request_safe_area
//   web_app_request_content_safe_area · web_app_ready · web_app_expand
//   web_app_invoke_custom_method
//   → hech biriga javob yo'q: ilova ekran o'lchamini va xavfsiz-zonani BILMAYDI → UI moslashmaydi.
//
// 2-o'lchov (ko'prik BOR — javob berildi): yuqoridagilar + ikkita YANGI so'rov paydo bo'ldi:
//   **web_app_setup_main_button** va **web_app_setup_secondary_button**  (`{is_visible:false}`)
//   → ya'ni hamkorning asosiy harakat tugmasi (savat/buyurtma) — TELEGRAMNING MainButton'i.
//     Uni sahifa emas, MEZBON chizadi. Bizning freymda Telegram yo'q → tugma UMUMAN
//     chizilmaydi → «savatga bosib bo'lmayapti». Shuning uchun uni BIZ chizamiz (pastga qarang).
//
// PROTOKOL (telegram-web-app.js:24-45 dan tasdiqlandi):
//   · app → host:  window.parent.postMessage(JSON.stringify({eventType, eventData}), '*')
//   · host → app:  frame.contentWindow.postMessage(JSON.stringify({eventType, eventData}), origin)
//     SDK `event.source === window.parent` ni va `event.data` STRING (JSON) ekanini talab qiladi —
//     obyekt yuborilsa JSON.parse yiqiladi va xabar JIM tashlanadi.
//
// XAVFSIZLIK: app '*' bilan yuboradi, ya'ni istalgan sayt bizga soxta xabar yubora oladi →
// kiruvchi xabarda `origin` MAJBURIY tekshiriladi. Chiquvchi xabarda '*' EMAS, aniq origin.

type Json = Record<string, unknown>;

/** Mezbon chizadigan tugma holati (Telegram MainButton/SecondaryButton shartnomasi). */
export interface BottomButton {
  isVisible: boolean;
  isActive: boolean;
  isProgress: boolean;
  text: string;
  color?: string;
  textColor?: string;
  /** faqat secondary uchun: "left" | "right" | "top" | "bottom" */
  position?: string;
}

export interface ButtonsState {
  main: BottomButton;
  secondary: BottomButton;
  /** Hamkor O'Z orqaga tugmasini ko'rsatganmi. Ko'rsatgan bo'lsa — "orqaga" ULARGA yuboriladi
   *  (ilova ichida bir qadam ortga), aks holda BirJoy Uy sahifasiga chiqiladi. Telegram ham
   *  aynan shunday ishlaydi. */
  backVisible: boolean;
}

const EMPTY_BTN: BottomButton = { isVisible: false, isActive: true, isProgress: false, text: "" };
export const EMPTY_BUTTONS: ButtonsState = { main: EMPTY_BTN, secondary: EMPTY_BTN, backVisible: false };

/** Telegram mavzu parametrlari — bo'lmasa hamkor o'z standartini ishlatadi. */
function themeParams(): Json {
  const w = window as unknown as { Telegram?: { WebApp?: { themeParams?: Json } } };
  return w.Telegram?.WebApp?.themeParams ?? {};
}

function readBtn(prev: BottomButton, d: Json): BottomButton {
  return {
    isVisible: typeof d.is_visible === "boolean" ? d.is_visible : prev.isVisible,
    isActive: typeof d.is_active === "boolean" ? d.is_active : prev.isActive,
    isProgress: typeof d.is_progress_visible === "boolean" ? d.is_progress_visible : prev.isProgress,
    text: typeof d.text === "string" ? d.text : prev.text,
    color: typeof d.color === "string" ? d.color : prev.color,
    textColor: typeof d.text_color === "string" ? d.text_color : prev.textColor,
    position: typeof d.position === "string" ? d.position : prev.position,
  };
}

export interface HostBridge {
  /** Freym o'lchami o'zgarganda (yoki tugma paydo bo'lganda) qayta e'lon qilish. */
  sendViewport: () => void;
  /** Biz chizgan tugma bosildi → ilovaga xabar. */
  pressMain: () => void;
  pressSecondary: () => void;
  /** "Orqaga" bosildi. `true` qaytsa — ilovaga uzatildi (ilova ichida ortga), `false` bo'lsa
   *  hamkorda orqaga tugmasi yo'q va chaqiruvchi o'zi Uy sahifasiga chiqishi kerak. */
  pressBack: () => boolean;
  dispose: () => void;
}

/**
 * Freym uchun Telegram-mezbon protokolini yoqadi.
 *
 * @param frame       hamkor ilovasi turgan iframe
 * @param origin      hamkor origin'i (faqat shu manbadan kelgan xabar qabul qilinadi)
 * @param onClose     ilova "meni yop" desa
 * @param onButtons   tugma holati o'zgarganda — React shu holatga qarab tugmani chizadi
 * @param bottomInset biz chizadigan tugmalar egallagan balandlik (px) — ilovaga xabar
 *                    qilinadigan viewport shuncha KICHIK bo'ladi, aks holda ilovaning o'z
 *                    kontenti tugma ostida qolib ketadi (Telegram ham shunday qiladi).
 */
export function attachHostBridge(
  frame: HTMLIFrameElement,
  origin: string,
  onClose: () => void,
  onButtons: (s: ButtonsState) => void,
  bottomInset: () => number,
): HostBridge {
  let buttons: ButtonsState = EMPTY_BUTTONS;

  const send = (eventType: string, eventData?: unknown): void => {
    // STRING yuborilishi SHART — SDK JSON.parse qiladi (protokol izohi yuqorida).
    frame.contentWindow?.postMessage(JSON.stringify({ eventType, eventData }), origin);
  };

  const sendViewport = (): void => {
    const r = frame.getBoundingClientRect();
    // is_expanded/is_state_stable = true: freymimiz to'liq va turg'un o'lchamda — Telegram'dagi
    // "yarim ochiq varaq" holati bu yerda umuman yo'q.
    send("viewport_changed", {
      height: Math.max(0, Math.round(r.height - bottomInset())),
      width: Math.round(r.width),
      is_expanded: true,
      is_state_stable: true,
    });
  };

  // Xavfsiz zona NOL: freym allaqachon bizning xavfsiz maydonimiz ICHIDA (tepada topbar,
  // pastda tabbar). Ular yana o'z chetini qo'shsa kontent ikki marta suriladi va pastdagi
  // tugma ekrandan chiqib ketadi.
  const ZERO_INSET = { top: 0, bottom: 0, left: 0, right: 0 };

  const pushButtons = (next: ButtonsState): void => {
    buttons = next;
    onButtons(next);
    // Tugma paydo bo'lsa/yo'qolsa ilovaga qolgan joyni QAYTA aytamiz — bo'lmasa uning
    // pastki kontenti bizning tugma ostida ko'rinmay qoladi.
    sendViewport();
  };

  const onMsg = (e: MessageEvent): void => {
    if (e.origin !== origin) return; // '*' tufayli bu tekshiruv majburiy
    let type = "";
    let data: Json = {};
    try {
      const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      type = (d as { eventType?: string })?.eventType ?? "";
      data = ((d as { eventData?: Json })?.eventData ?? {}) as Json;
    } catch {
      return; // JSON emas — bizniki emas
    }

    switch (type) {
      // ── So'rov → javob ───────────────────────────────────────────────────
      case "web_app_request_viewport":
      case "web_app_expand": // "kattalash": biz allaqachon to'liq o'lchamdamiz, holatni tasdiqlaymiz
        sendViewport();
        break;
      case "web_app_request_theme":
        send("theme_changed", { theme_params: themeParams() });
        break;
      case "web_app_request_safe_area":
        send("safe_area_changed", ZERO_INSET);
        break;
      case "web_app_request_content_safe_area":
        send("content_safe_area_changed", ZERO_INSET);
        break;
      case "iframe_ready":
      case "web_app_ready":
        send("theme_changed", { theme_params: themeParams() });
        sendViewport();
        send("safe_area_changed", ZERO_INSET);
        send("content_safe_area_changed", ZERO_INSET);
        break;

      // ── Tugmalar — MEZBON chizadi (aynan shu yerda "savat bosilmaydi" hal bo'ladi) ──
      case "web_app_setup_main_button":
        pushButtons({ ...buttons, main: readBtn(buttons.main, data) });
        break;
      case "web_app_setup_secondary_button":
        pushButtons({ ...buttons, secondary: readBtn(buttons.secondary, data) });
        break;
      case "web_app_setup_back_button":
        pushButtons({ ...buttons, backVisible: data.is_visible === true });
        break;

      // ── Amallar ──────────────────────────────────────────────────────────
      case "web_app_close":
        onClose();
        break;
      case "web_app_open_link": {
        // Tashqi havola Telegram ichki brauzerida — freymda ochilsa hamkor ilovasi o'rnini bosardi.
        const url = typeof data.url === "string" ? data.url : "";
        const w = (window as unknown as { Telegram?: { WebApp?: { openLink?: (u: string) => void } } }).Telegram?.WebApp;
        if (url) { if (w?.openLink) w.openLink(url); else window.open(url, "_blank"); }
        break;
      }
      case "web_app_open_tg_link": {
        const path = typeof data.path_full === "string" ? data.path_full : "";
        const w = (window as unknown as { Telegram?: { WebApp?: { openTelegramLink?: (u: string) => void } } }).Telegram?.WebApp;
        if (path) w?.openTelegramLink?.(`https://t.me${path}`);
        break;
      }
      case "web_app_trigger_haptic_feedback": {
        const h = (window as unknown as {
          Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred?: (s: string) => void; notificationOccurred?: (t: string) => void; selectionChanged?: () => void } } };
        }).Telegram?.WebApp?.HapticFeedback;
        const t = data.type;
        if (t === "impact" && typeof data.impact_style === "string") h?.impactOccurred?.(data.impact_style);
        else if (t === "notification" && typeof data.notification_type === "string") h?.notificationOccurred?.(data.notification_type);
        else if (t === "selection_change") h?.selectionChanged?.();
        break;
      }
      case "web_app_invoke_custom_method": {
        // Qo'llab-quvvatlamaymiz, LEKIN javobsiz qoldirilsa ilovadagi va'da abadiy osilib
        // qoladi va ekran yuklanishda muzlashi mumkin — shuning uchun toza xato qaytaramiz.
        if (data.req_id !== undefined) send("custom_method_invoked", { req_id: data.req_id, error: "UNSUPPORTED" });
        break;
      }

      // ── Javob talab qilmaydiganlar (Telegram faqat o'z bezagini o'zgartirardi) ──
      case "web_app_set_header_color":
      case "web_app_set_bottom_bar_color":
      case "web_app_set_background_color":
      case "web_app_setup_closing_behavior":
      case "web_app_setup_swipe_behavior":
      case "web_app_set_emoji_status":
        break;

      default:
        if (type.startsWith("web_app_")) console.warn("[rst-host] javobsiz so'rov:", type, data);
    }
  };

  window.addEventListener("message", onMsg);

  return {
    sendViewport,
    pressMain: () => send("main_button_pressed"),
    pressSecondary: () => send("secondary_button_pressed"),
    pressBack: () => {
      if (!buttons.backVisible) return false;
      send("back_button_pressed");
      return true;
    },
    dispose: () => window.removeEventListener("message", onMsg),
  };
}
