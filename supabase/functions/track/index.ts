/* ============================================================================
   track — the only write path into the analytics tables.

   Deployed with --no-verify-jwt, deliberately. That makes the URL public,
   which is the point: the site ships no key of any kind, so this endpoint is
   the single door, and a door that needs a key would mean shipping the key.
   What protects the tables is that they are reachable only from here — RLS is
   on with no policy for any role, and anon has been revoked outright.

   Which leaves the endpoint itself, and that is what the rate limiter is for.
   Not credentials: volume. See the rate limiter below for what it does and,
   more usefully, what it cannot do.

   The caller's address is hashed and the address itself is discarded. It is
   never logged and never stored.

   ---------------------------------------------------------------------------

   This file is self-contained, and that is a decision rather than an accident.
   It was first written split across functions/_shared/ — db.ts, ip.ts, geo.ts,
   rate.ts — which is the shape the Supabase CLI bundles happily. It is not the
   shape the dashboard's function editor can take: that editor holds one file
   at a time, and importing a sibling from it resolves to nothing. So the shared
   modules were merged in, the deploy that was verified is this flattened
   version, and the split was deleted rather than left in the tree beside it.

   Leaving it would have been the worse option by a distance. A _shared/ folder
   next to a self-contained index.ts reads as the live structure, and the next
   person to run `supabase functions deploy` would ship it — replacing a working
   function with one that was never the thing tested, and doing it silently,
   because a missing import only fails once the function is cold-started by real
   traffic.

   The cost is that the boilerplate below — head, rpc, clientIP, hashIP, CORS,
   json — is written a second time in stats/index.ts. That repetition is the
   price of the dashboard path, and the house duplicates small helpers on
   purpose anyway; what it must not do is duplicate them and then differ. The
   two copies of hashIP especially: same salt, same shape, or a visitor who
   reads the panel lands in a different rate-limit bucket than the one their own
   writes went into. Edit one, edit the other.
   ============================================================================ */

/* ---- Tunables ---------------------------------------------------------- */

/* A ceiling on REQUESTS, not on events and not on visitors, and the
   arithmetic is what sets it: a visit flushes one batch every fifteen
   seconds, so one attentive visitor is about four requests a minute.

   This was 20 to begin with, which reads generous and is not — it is five
   visitors. Five is fine for a home connection and wrong for every other
   kind. An office, a campus, a cafe, a mobile carrier's NAT: hundreds of
   people behind one address, and the sixth of them to open the page in a
   minute would have their batch dropped. Silently, because a stat that
   failed is not worth an error — which is exactly what makes a too-tight
   limit here so expensive. Nobody would ever report it, and the figures
   would just be quietly low forever.

   120 is thirty concurrent visitors behind one address, past anything this
   site will see, and still two requests a second — a rate no person and no
   crowd reaches, and one every naive script exceeds inside its first
   second. The gap between those two is where the number belongs. */
const MAX_EVENTS_PER_MIN = 120;
const MAX_EVENTS_PER_BATCH = 50;

/* Per provider, before moving to the next. */
const GEO_TIMEOUT_MS = 4000;

/* How long a resolved address is trusted before it is looked up again. */
const GEO_TTL_HOURS = 24;

/* ---- Allowed values ---------------------------------------------------- */

const KINDS = ["view", "theme", "dwell", "dev", "pref"];
const THEMES = ["light", "dark", "system"];

/* The four switches in the dev card, and the values each one can take. A pref
   row carries the pair in its `name` as "<pref>.<value>" — "turn.shatter",
   "sfx.on" — so the aggregate is one group-by and nothing downstream needs a
   lookup table to read it.

   Listed per pref rather than as one shared on/off list because `turn` is the
   exception: its values are mode names, so that list has to be the modes
   pageturn.js actually publishes. A value missing from it is dropped on
   arrival — the visitor watches the mode run and no row is ever written. A
   silent hole rather than a visible error, which is why `bloom` is named
   here: the shipped default, in PAGETURN.modes, and missing from the first
   version of this list. `none` is the dev card's spelling for the empty mode,
   which the site supports as a value rather than as a way of spelling "off". */
const PREFS: Record<string, string[]> = {
  turn: ["none", "fall", "shatter", "bloom"],
  sfx: ["on", "off"],
  churn: ["on", "off"],
  fade: ["on", "off"],
};

/* Must list every section id the page can report, and must stay in step with
   the `kind` check in schema.sql and the client's section list. An unknown id
   is dropped rather than stored, so a renamed section shows up as a missing
   row here rather than as a junk row in the aggregates. */
const SECTIONS = [
  "top",
  "work",
  "capabilities",
  "approach",
  "about",
  "contact",
  "rate",
];

/* A tab left open overnight is not "time spent viewing" — the client stops its
   clock when the page is hidden — but a client is not obliged to be that
   honest, so the ceiling is applied here too. One hour per event. */
const MAX_DWELL_SECONDS = 3600;

/* ---- PostgREST --------------------------------------------------------- */

/* Plain fetch rather than @supabase/supabase-js. The client library would be
   the only import this function has, and everything it would do here is three
   headers and a JSON body — in exchange for a module that has to resolve from
   a CDN at cold start. If that CDN is slow or down, tracking stops, and the
   reason would have nothing to do with this site. */

const DB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const DB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SALT = Deno.env.get("IP_SALT") ?? "";

/* Checked before anything else, so a project that is half set up answers with
   a clear 503 instead of a wall of failed REST calls. */
const CONFIGURED = Boolean(DB_URL && DB_KEY);

function head(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: DB_KEY,
    Authorization: `Bearer ${DB_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/* Append rows. return=minimal because nothing reads them back and the bodies
   would be pure waste on every page view. */
async function insert(table: string, rows: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${DB_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: head({ Prefer: "return=minimal" }),
      body: JSON.stringify(rows),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* Insert, or merge onto the existing row. Both callers write tables keyed by
   ip_hash, where a second write is an update by design. */
async function upsert(
  table: string,
  row: unknown,
  onConflict: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${DB_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: head({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(row),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* A failed read answers with an empty list rather than throwing. The one
   caller is the geo cache, where "no rows" and "the query failed" have the
   same correct response: go and look the address up. */
async function select<T>(path: string): Promise<T[]> {
  try {
    const res = await fetch(`${DB_URL}/rest/v1/${path}`, { headers: head() });
    if (!res.ok) return [];
    return (await res.json()) as T[];
  } catch {
    return [];
  }
}

/* Returns null when the call fails, which is distinct from a function that
   legitimately returns false — take_token's "you are over the limit". The
   caller treats the two differently on purpose. */
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

/* The site ships no key, so there is nothing to steal — but this endpoint is
   public by necessity, and public means anyone can call it. Nothing here is
   about credentials. It is about volume: a script in a loop can inflate a
   view count, and enough of them can burn a free tier.

   The counting and the spending happen together, in take_token() in the
   database, under a lock keyed on the caller. Doing it here would mean a read
   followed by a write, and two requests arriving together would both read the
   same count and both spend the last slot.

   What this cannot do is worth stating plainly: a limit keyed on the caller
   stops one caller. A thousand addresses doing one thing each is under every
   limit here, and no per-address scheme reaches that. The ratings are the one
   number that survives it anyway, because that table is keyed by address and
   a re-rating overwrites — so the worst a distributed actor achieves there is
   one vote each, which is what a vote is. */

/* True when the caller is within the limit and has now spent a slot; false
   when they are over it; null when the limiter itself could not be reached.

   The three answers are deliberately distinct and the caller treats them
   differently: null fails OPEN. If the database is briefly unreachable, the
   choice is between dropping every visitor's data and accepting a few
   uncounted events from someone who noticed. A stat is not worth losing real
   traffic over, and the thing this protects is structurally safe regardless. */
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

/* The address as the edge saw it. x-forwarded-for is a list when a request
   has passed through more than one proxy, and the client is the leftmost
   entry — everything after it was appended by infrastructure the caller does
   not control, so the first entry is the only one that could be theirs.
   cf-connecting-ip is the fallback for the same value on Cloudflare. */
function clientIP(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0].trim();
  return first || req.headers.get("cf-connecting-ip") || "";
}

/* SHA-256 over salt + address. Not a password hash and not trying to be: the
   input is a 32-bit space, so anyone holding the digest AND the salt can
   enumerate every address in minutes. The salt is the protection, and it is
   the reason it lives in this project's secrets rather than in the repo. */
async function hashIP(ip: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${SALT}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ---- Geography --------------------------------------------------------- */

/* hsselite.com/ipinfo is NOT in this chain and cannot be. It answers with the
   address that called it — there is no parameter and no path segment that
   makes it describe a different one. Called from here it would describe the
   datacenter this function runs in and report that as every visitor's
   country. Verified rather than assumed: ?ip=8.8.8.8 returns the caller's own
   address, and /ipinfo/8.8.8.8 is a 404.

   Which leaves the choice between two ways of getting it wrong. Calling it
   from the browser would work — it is the visitor's own address there — but
   the browser would then be telling us its own country, and a client that
   supplies its own geography can supply any geography. That is the same class
   of tampering the rate limiter exists to stop, so the country is resolved
   here instead, from the address the edge saw, which the caller cannot forge.

   Both providers below take an address, and both were checked against a known
   one: 8.8.8.8 answers San Jose, US from each. */

type Geo = {
  country: string | null;
  city: string | null;
  region: string | null;
  provider: string;
};

async function getJSON(url: string): Promise<Record<string, unknown> | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), GEO_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    /* Abort, DNS, TLS, a 500, a body that is not JSON — all of it means the
       same thing here, which is "ask the next one". */
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* First because it answers with a code, a city and a region in one request.
   `success: false` is a well-formed 200 for an address it cannot place, so it
   is checked rather than trusted. */
async function fromIpwho(ip: string): Promise<Geo | null> {
  const d = await getJSON(`https://ipwho.is/${encodeURIComponent(ip)}`);
  if (!d || d.success === false || !d.country_code) return null;
  return {
    country: String(d.country_code),
    city: d.city ? String(d.city) : null,
    region: d.region ? String(d.region) : null,
    provider: "ipwho.is",
  };
}

/* Second, and it answers with a country code and nothing else — which is why
   it is second rather than first. On every row it answers, city and region
   are empty. It is here because it is small, fast and has no query limit
   worth worrying about, so it is the one that still works when the first is
   rate-limiting or down. */
async function fromCountryIs(ip: string): Promise<Geo | null> {
  const d = await getJSON(`https://api.country.is/${encodeURIComponent(ip)}`);
  if (!d || !d.country) return null;
  return {
    country: String(d.country),
    city: null,
    region: null,
    provider: "api.country.is",
  };
}

const CHAIN = [fromIpwho, fromCountryIs];

type GeoRow = {
  country: string | null;
  city: string | null;
  region: string | null;
  provider: string | null;
  at: string;
};

/* One lookup per address per day, not per visit. Fifty people behind one
   office address cost one request to a third party instead of fifty, which is
   what keeps both the free tier and the providers' limits out of the way.

   `provider` travels with the answer and is stored on the event, because the
   databases genuinely disagree — one address read as two different cities
   from two different sources during testing. A fallback that silently
   changes the geography is worse than no fallback, so which one answered is
   part of the record. */
async function lookup(ipHash: string, ip: string): Promise<Geo | null> {
  const rows = await select<GeoRow>(
    `geo_cache?select=country,city,region,provider,at&ip_hash=eq.${
      encodeURIComponent(ipHash)
    }&limit=1`,
  );

  if (rows.length) {
    const age = Date.now() - new Date(rows[0].at).getTime();
    if (age < GEO_TTL_HOURS * 3600_000) {
      return {
        country: rows[0].country,
        city: rows[0].city,
        region: rows[0].region,
        provider: rows[0].provider ?? "cache",
      };
    }
  }

  for (const provider of CHAIN) {
    const geo = await provider(ip);
    if (geo) {
      /* Written back even when it came from the second provider, so a bad
         first provider costs one request a day rather than one a visit. */
      await upsert(
        "geo_cache",
        { ip_hash: ipHash, ...geo, at: new Date().toISOString() },
        "ip_hash",
      );
      return geo;
    }
  }

  /* Nothing could place the address. The event is still recorded — a view
     with no country is worth more than no view — it just carries nulls. */
  return null;
}

/* ---- CORS -------------------------------------------------------------- */

/* The site is served from a different origin to this function, and a JSON
   body makes every request preflighted. The max-age matters more than it
   looks: it is what gets the preflight out of the way during normal browsing,
   so that the final flush on page-hide — which is a keepalive request made
   while the page is going away — is not the one that discovers it needs an
   extra round trip. */
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

/* ---- Validation -------------------------------------------------------- */

type Clean = { kind: string; name: string | null; value: number | null };

/* Everything arrives from a browser that anyone can edit, so nothing is
   trusted. Anything unrecognised is dropped rather than repaired — a repaired
   event is a wrong figure that looks like a right one. */
function clean(raw: unknown): Clean | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const kind = String(e.kind ?? "");

  if (KINDS.indexOf(kind) < 0) return null;

  if (kind === "view" || kind === "theme") {
    const name = String(e.name ?? "");
    return {
      kind,
      name: THEMES.indexOf(name) >= 0 ? name : null,
      value: null,
    };
  }

  if (kind === "dwell") {
    const name = String(e.name ?? "");
    if (SECTIONS.indexOf(name) < 0) return null;

    const seconds = Math.round(Number(e.value));
    if (!isFinite(seconds) || seconds <= 0) return null;

    return { kind, name, value: Math.min(seconds, MAX_DWELL_SECONDS) };
  }

  if (kind === "pref") {
    const name = String(e.name ?? "");
    const dot = name.indexOf(".");
    if (dot < 0) return null;

    const allowed = PREFS[name.slice(0, dot)];
    if (!allowed || allowed.indexOf(name.slice(dot + 1)) < 0) return null;

    /* The value is already in the name rather than in `value`, which stays
       null: half the prefs are not numeric, and a column that means "seconds"
       on one kind means "mode index" on another is the kind of thing that
       reads as a bug three months later. */
    return { kind, name, value: null };
  }

  /* dev. Nothing to carry — the row's existence is the whole fact. */
  return { kind: "dev", name: null, value: null };
}

/* ---- Handler ----------------------------------------------------------- */

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!CONFIGURED) return json({ error: "not configured" }, 503);

  const ip = clientIP(req);
  const ipHash = await hashIP(ip);

  /* Spent before the body is even read. A malformed request still costs the
     caller a slot, which is the correct price for a script that is only
     guessing at the shape. */
  const allowed = await takeToken(ipHash, "event", MAX_EVENTS_PER_MIN, 60);
  if (allowed === false) return json({ error: "rate" }, 429);
  /* allowed === null: the limiter could not be reached. Fail open. Refusing
     real visitors' data because a database blipped is the worse failure. */

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "json" }, 400);
  }

  const incoming = Array.isArray(body.events) ? body.events : [];
  const events = incoming
    .map(clean)
    .filter((e): e is Clean => e !== null)
    .slice(0, MAX_EVENTS_PER_BATCH);

  const rated = typeof body.rating === "number"
    ? Math.round(body.rating as number)
    : 0;
  const wantsRating = rated >= 1 && rated <= 5;

  if (!events.length && !wantsRating) {
    /* Nothing survived validation. Answered 200 rather than 400: the client
       has nothing useful to do with a rejection, and a visitor should never
       see an error for a stat. */
    return json({ ok: true, kept: 0 }, 200);
  }

  /* Resolved once per request, not once per event — a batch of five dwells
     from one visitor is one geography. Behind the cache this is usually a
     single indexed read. */
  const geo = await lookup(ipHash, ip);
  const place = {
    country: geo?.country ?? null,
    city: geo?.city ?? null,
    region: geo?.region ?? null,
    provider: geo?.provider ?? null,
  };

  let kept = 0;

  if (events.length) {
    const rows = events.map((e) => ({ ...e, ...place, ip_hash: ipHash }));
    if (await insert("events", rows)) kept = rows.length;
  }

  /* No rating-specific limit, and the absence is deliberate rather than an
     oversight. There was one — ten an hour — and it was removed for
     protecting nothing while costing real data.

     What it was meant to protect is covered twice over already. The ratings
     table is keyed by ip_hash and written with an upsert, so a re-rating
     OVERWRITES: one caller contributes exactly one row however many times
     they send, and there is no ballot to stuff. And every request reaching
     here has already spent an event token at the top of this handler, which
     is the real bound on hammering — a script gets its 120 a minute like
     anything else and gains a single row for it.

     Against which the cost was concrete. A limit keyed on the address hits
     everyone sharing one, and a campus or a carrier NAT is hundreds of
     people. The eleventh person to rate from one of those in an hour was
     told their rating did not reach the server. It was true, and it was our
     doing. */
  if (wantsRating) {
    await upsert(
      "ratings",
      {
        ip_hash: ipHash,
        stars: rated,
        at: new Date().toISOString(),
        country: place.country,
      },
      "ip_hash",
    );
  }

  return json({ ok: true, kept }, 200);
});
