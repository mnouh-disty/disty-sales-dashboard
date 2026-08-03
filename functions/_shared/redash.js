function requestConfig(secretUrl, apiKey) {
  const configured = clean(secretUrl);

  if (!configured) {
    throw new Error("missing_configuration");
  }

  let url;

  try {
    url = new URL(configured);
  } catch {
    throw new Error("invalid_configuration");
  }

  if (url.protocol !== "https:") {
    throw new Error("invalid_configuration");
  }

  const sourceMatch = url.pathname.match(/^\/queries\/(\d+)\/source\/?$/);

  if (sourceMatch) {
    url.pathname = `/api/queries/${sourceMatch[1]}/results.json`;
  }

  if (
    url.pathname.match(/^\/api\/queries\/\d+\/results\/?$/)
  ) {
    url.pathname = url.pathname.replace(/\/results\/?$/, "/results.json");
  }

  if (clean(apiKey) && !url.searchParams.has("api_key")) {
    url.searchParams.set("api_key", clean(apiKey));
  }

  return {
    url: url.toString(),
    headers: {
      Accept: "application/json",
      "User-Agent": "Disty-Sales-Dashboard/2.0",
    },
  };
}
