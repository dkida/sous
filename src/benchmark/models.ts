async function main(): Promise<void> {
  let pageToken: string | undefined;
  const models: { model: string; generateContent: boolean }[] = [];
  do {
    const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      console.log(JSON.stringify({ status: response.status, availableModels: [] }));
      process.exitCode = 1;
      return;
    }
    const data = await response.json();
    for (const model of data.models ?? []) {
      if (/^models\/(gemini-[a-z0-9.-]+-flash-lite(?:-[a-z0-9-]+)?|gemma-4-[a-z0-9-]+)$/.test(model.name)) {
        models.push({ model: model.name.slice(7), generateContent: model.supportedGenerationMethods?.includes("generateContent") ?? false });
      }
    }
    pageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : undefined;
  } while (pageToken);
  console.log(JSON.stringify({ availableModels: models }));
}

main().catch(() => {
  console.error("Model availability check failed; credentials and remote diagnostics omitted.");
  process.exitCode = 1;
});
