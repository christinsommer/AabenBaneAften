export async function appRequest(payload?: Record<string, unknown>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch("/api/app", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
      ...(payload ? {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      } : {}),
    });
    const data = await response.json().catch(() => {
      throw new Error("Serveren sendte et uventet svar. Genindlæs siden og prøv igen.");
    }) as { authenticated?: boolean; error?: string; warning?: string };
    if (!response.ok) throw new Error(data?.error || "Kunne ikke kontakte serveren. Prøv igen.");
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Serveren svarede ikke i tide. Prøv igen.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function requireLoginSession(data: { authenticated?: boolean }) {
  if (!data.authenticated) {
    throw new Error("Login kunne ikke bevares. Kontrollér, at cookies er tilladt for aabenbaneaften.dk, og prøv igen.");
  }
}
