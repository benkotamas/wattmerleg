export type HeatingRebuildResponse = { success: boolean; message: string };

function errorCode(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export async function interpretHeatingRebuildResponse(
  response: Pick<Response, "ok" | "status" | "text">,
): Promise<HeatingRebuildResponse> {
  const text = await response.text();
  let body: unknown = null;
  if (text.trim()) {
    try { body = JSON.parse(text); } catch { body = null; }
  }
  if (response.ok && body && typeof body === "object") {
    const analyzedDays = (body as { analyzedDays?: unknown }).analyzedDays;
    if (typeof analyzedDays === "number")
      return { success: true, message: `${analyzedDays} nap újraszámítva.` };
  }
  const code = errorCode(body);
  if (response.status === 504)
    return { success: false, message: "Az újraszámítás túllépte a szerver időkorlátját. Az első időjárási adatfeltöltés hosszabb lehet; próbáld meg később újra." };
  if (response.status === 409 || code === "ANALYSIS_ALREADY_RUNNING")
    return { success: false, message: "Már fut egy historikus elemzés, vagy egy korábbi megszakadt futás zárolása még aktív. Várj, vagy ellenőrizd a futási zárolást." };
  return { success: false, message: `Az újraszámítás nem sikerült: ${code ?? "ismeretlen szerverhiba"}.` };
}
