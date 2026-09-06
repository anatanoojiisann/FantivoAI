export function createSubscriptionPlanId(existingIds: Iterable<string>, randomUuid = () => crypto.randomUUID()) {
  const existing = new Set(existingIds);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = randomUuid().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
    if (!suffix) continue;
    const id = `sub_${suffix}`;
    if (!existing.has(id)) return id;
  }
  throw new Error("无法生成订阅计划标识，请重试。");
}
