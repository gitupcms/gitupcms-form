/** Browser: POSTs JSON to a CMS API route and returns its `data` (throws its `error`). */
export const post = async (url: string, body: unknown) => {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({ error: "Unexpected response." }));
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json.data;
};
