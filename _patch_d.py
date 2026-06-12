import io

p = "packages/server/src/api/server.ts"
s = open(p, encoding="utf-8").read()

old_wheel = '''  app.post("/api/wheel", requireUser, async (req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    res.json(await spinWheel(memberId));
  });'''
new_wheel = '''  app.post("/api/wheel", requireUser, async (req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    const { featureOn } = await import("../services/featureFlags");
    if (!(await featureOn("wheel"))) {
      res.json({ ok: false, reason: "disabled" });
      return;
    }
    res.json(await spinWheel(memberId));
  });'''
assert old_wheel in s
s = s.replace(old_wheel, new_wheel)

old_tr = '''    res.json(await transfer(memberId, String(b.phone), amount, { note: b.note ? String(b.note) : undefined }));
  });'''
new_tr = '''    const { featureOn } = await import("../services/featureFlags");
    if (!(await featureOn("transfers"))) {
      res.json({ ok: false, reason: "disabled" });
      return;
    }
    res.json(await transfer(memberId, String(b.phone), amount, { note: b.note ? String(b.note) : undefined }));
  });'''
assert old_tr in s
s = s.replace(old_tr, new_tr)

old_mint = '''  app.post("/api/items/mint", requireUser, rateLimit(10), withMember2(async (id, req) => {
    const { mintItem } = await import("../services/itemService");
    return mintItem(id, String((req.body as { code?: string })?.code ?? ""));
  }));'''
new_mint = '''  app.post("/api/items/mint", requireUser, rateLimit(10), withMember2(async (id, req) => {
    const { featureOn } = await import("../services/featureFlags");
    if (!(await featureOn("items"))) return { ok: false, reason: "disabled" };
    const { mintItem } = await import("../services/itemService");
    return mintItem(id, String((req.body as { code?: string })?.code ?? ""));
  }));'''
assert old_mint in s
s = s.replace(old_mint, new_mint)

anchor = '''  app.post("/api/items/buy", requireUser, rateLimit(10), withMember2(async (id, req) => {
    const { buyListedItem } = await import("../services/itemService");'''
assert anchor in s
plus_gap = '''  // 💎 1067 Plus (coin-paid subscription, pure sink)
  app.get("/api/plus", requireUser, withMember2(async (id) => {
    const { PLUS_PRICE } = await import("../services/plusService");
    const m = await prisma.member.findUnique({ where: { id }, select: { plusUntil: true, trips: true } });
    const active = !!m?.plusUntil && m.plusUntil.getTime() > Date.now();
    const hadTrial = !!(await prisma.coinTxn.findFirst({ where: { memberId: id, kind: "plus_sub" } }));
    return { active, until: m?.plusUntil ?? null, price: PLUS_PRICE, trialAvailable: !hadTrial && !m?.plusUntil, canBuy: (m?.trips ?? 0) >= 1 };
  }));
  app.post("/api/plus/subscribe", requireUser, rateLimit(5), withMember2(async (id) => {
    const { featureOn } = await import("../services/featureFlags");
    if (!(await featureOn("plus"))) return { ok: false, reason: "disabled" };
    const { subscribePlus } = await import("../services/plusService");
    return subscribePlus(id);
  }));

  // 👬 Gap (team circles)
  app.get("/api/gap", requireUser, withMember2(async (id) => {
    const { getGapView } = await import("../services/gapService");
    return getGapView(id);
  }));
  app.post("/api/gap/create", requireUser, rateLimit(5), withMember2(async (id, req) => {
    const { featureOn } = await import("../services/featureFlags");
    if (!(await featureOn("gap"))) return { ok: false, reason: "disabled" };
    const { createGap } = await import("../services/gapService");
    return createGap(id, String((req.body as { name?: string })?.name ?? ""));
  }));
  app.post("/api/gap/join", requireUser, rateLimit(5), withMember2(async (id, req) => {
    const { featureOn } = await import("../services/featureFlags");
    if (!(await featureOn("gap"))) return { ok: false, reason: "disabled" };
    const { joinGap } = await import("../services/gapService");
    return joinGap(id, String((req.body as { code?: string })?.code ?? ""));
  }));

'''
s = s.replace(anchor, plus_gap + anchor)

anchor2 = '''  app.get("/api/admin/stats", requireAdmin, async (req, res) => {'''
assert anchor2 in s
adminblock = '''  // kill-switch flags + mashina fondi + B2B corp accounts
  app.get("/api/admin/features", requireAdmin, async (_req, res) => {
    const { listFeatures, fundTotal } = await import("../services/featureFlags");
    res.json({ features: await listFeatures(), mashinaFund: await fundTotal() });
  });
  app.post("/api/admin/features", requireAdmin, async (req, res) => {
    const { setFeature, FEATURES, listFeatures } = await import("../services/featureFlags");
    const b = req.body as { name?: string; on?: boolean };
    if (!FEATURES.includes(b?.name as never)) {
      res.status(400).json({ error: "unknown feature" });
      return;
    }
    await setFeature(b.name as never, b.on !== false);
    res.json({ ok: true, features: await listFeatures() });
  });
  app.get("/api/admin/corps", requireAdmin, async (_req, res) => {
    const { listCorps } = await import("../services/corpService");
    res.json({ corps: await listCorps() });
  });
  app.post("/api/admin/corps", requireAdmin, async (req, res) => {
    const { createCorp } = await import("../services/corpService");
    const b = req.body as { name?: string; cap?: number };
    if (!b?.name) {
      res.status(400).json({ error: "name required" });
      return;
    }
    res.json(await createCorp(String(b.name), Math.floor(Number(b.cap ?? 30))));
  });
  app.post("/api/admin/corps/:id/employees", requireAdmin, async (req, res) => {
    const { addCorpEmployee } = await import("../services/corpService");
    const b = req.body as { phone?: string; name?: string };
    res.json(await addCorpEmployee(Number(req.params.id), String(b?.phone ?? ""), b?.name));
  });
  app.post("/api/admin/corps/:id/balance", requireAdmin, async (req, res) => {
    const { adjustCorpBalance } = await import("../services/corpService");
    res.json(await adjustCorpBalance(Number(req.params.id), Math.floor(Number((req.body as { delta?: number })?.delta ?? 0))));
  });
  app.get("/api/admin/corps/:id/report", requireAdmin, async (req, res) => {
    const { corpReport } = await import("../services/corpService");
    const r = await corpReport(Number(req.params.id));
    if (!r) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(r);
  });

'''
s = s.replace(anchor2, adminblock + anchor2)
open(p, "w", encoding="utf-8", newline="\n").write(s)
print("routes ok")

p = "packages/server/src/services/notifyService.ts"
s = open(p, encoding="utf-8").read()
old = "export async function pushEngineTick(bot: Bot): Promise<void> {"
assert old in s
s = s.replace(old, old + '''
  const { featureOn } = await import("./featureFlags");
  if (!(await featureOn("push"))) return;''')
open(p, "w", encoding="utf-8", newline="\n").write(s)

p = "packages/server/src/services/recruitService.ts"
s = open(p, encoding="utf-8").read()
idx = s.find("export async function payRecruitRevshare")
assert idx > 0
brace = s.find("{", s.find(")", idx))
s = s[:brace+1] + '''
  const { featureOn } = await import("./featureFlags");
  if (!(await featureOn("recruit"))) return;''' + s[brace+1:]
open(p, "w", encoding="utf-8", newline="\n").write(s)

p = "packages/server/src/index.ts"
s = open(p, encoding="utf-8").read()
old = "        await weeklyRecap(bot);"
assert old in s
s = s.replace(old, old + '''
        const { settleGapsWeekly } = await import("./services/gapService");
        if (new Date(Date.now() + 5 * 3600_000).getUTCDay() === 1) await settleGapsWeekly(bot).catch(() => null);''')
open(p, "w", encoding="utf-8", newline="\n").write(s)
print("gates+tick ok")
