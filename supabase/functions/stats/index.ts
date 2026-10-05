/* ============================================================================
   stats — the only read path.

   Also public, and that is a deliberate call rather than an oversight. Its one
   client is the dashboard in the repo root, which is gitignored and opened
   from disk — so the endpoint it reads is reachable from anywhere, and gating
   on knowing the URL would be gating on nothing. What comes back is aggregate
   only — counts, averages, country totals. No address, no hash, no row-level
   anything, and nothing that could be joined back to a person.

   It is rate limited anyway, not to protect the data but so this cannot be
   used as free compute: a loop here costs the project money and gains the
   caller nothing.

   The body carries which blocks to return:

     {"show_stats": ["rate"]}   ->   {"rate": {...}}

   An absent, empty or unrecognised list returns the lot, and that default is
   what the dashboard relies on: it sends {} and takes everything, so a block
   added later arrives there without the page being edited. A list of names
   would go quietly stale and read as a block with no data.

   ---------------------------------------------------------------------------

   Self-contained like track/index.ts, and for the reason written out at length
   there: these two files are what the dashboard's one-file-at-a-time function
   editor can actually deploy, and what was deployed and verified is this shape.
   The boilerplate below repeats track's on purpose. hashIP especially has to
   stay identical to track's — a divergence there puts a visitor's reads and
   writes in different rate-limit buckets.
   ============================================================================ */

/* ---- Tunables ---------------------------------------------------------- */

/* Generous: the panel is read by a person, and a person refreshing is not a
   threat. The cap exists so this cannot be used as free compute. */
const MAX_STATS_PER_MIN = 60;

/* ---- PostgREST --------------------------------------------------------- */

/* Plain fetch rather than @supabase/supabase-js — the same reasoning as the
   track function, which carries the longer version of this comment. */

const DB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const DB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SALT = Deno.env.get("IP_SALT") ?? "";

const CONFIGURED = Boolean(DB_URL && DB_KEY);

function head(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: DB_KEY,
    Authorization: `Bearer ${DB_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/* Returns null when the call fails, which is distinct from a function that
   legitimately returns false — take_token's "you are over the limit". */
async function rpc<T>(fn: string, args: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${DB_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: head(),
      body: JSON.stringify(args),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/* ---- Rate limiting ----------------------------------------------------- */

/* True within the limit, false over it, null when the limiter is unreachable.
   The read path fails open for the same reason the write path does: a panel
   that shows nothing is a worse outcome than a few uncounted reads. */
function takeToken(
  ipHash: string,
  bucket: string,
  max: number,
  windowSeconds: number,
): Promise<boolean | null> {
  return rpc<boolean>("take_token", {
    p_ip: ipHash,
    p_bucket: bucket,
    p_max: max,
    p_window: `${windowSeconds} seconds`,
  });
}

/* ---- Identity ---------------------------------------------------------- */

function clientIP(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0].trim();
  return first || req.headers.get("cf-connecting-ip") || "";
}

/* Same salt, same shape as track — the two must agree, or a visitor who reads
   the panel lands in a different rate-limit bucket than the one their own
   writes went into. */
async function hashIP(ip: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${SALT}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ---- CORS -------------------------------------------------------------- */

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/* ---- Handler ----------------------------------------------------------- */

/* Must match the blocks get_stats() knows how to build. A name that is not
   here is dropped before the call, so a typo returns everything rather than
   an empty object that looks like a site with no visitors. */
const BLOCKS = ["views", "geo", "themes", "sections", "dev", "rate", "prefs"];

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!CONFIGURED) return json({ error: "not configured" }, 503);

  const ipHash = await hashIP(clientIP(req));
  const allowed = await takeToken(ipHash, "stats", MAX_STATS_PER_MIN, 60);
  if (allowed === false) return json({ error: "rate" }, 429);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* A body is optional. An unparseable or empty one is treated as absent
       rather than refused, because "show me everything" is a harmless thing
       to default to. */
  }

  const asked = Array.isArray(body.show_stats) ? body.show_stats : [];
  const show = asked
    .map((k) => String(k))
    .filter((k) => BLOCKS.indexOf(k) >= 0)
    .slice(0, BLOCKS.length);

  /* An empty list is passed as null, which get_stats() reads as "everything".
     Sending [] would work too — the function nullifs it — but null is the
     honest description of what the caller asked for. */
  const data = await rpc<Record<string, unknown>>("get_stats", {
    p_show: show.length ? show : null,
  });

  if (data === null) return json({ error: "unavailable" }, 503);

  return json(data, 200);
});
