-- ============================================================================
--  odell.dev — visitor stats and ratings
--
--  Run once, in the Supabase SQL editor, against a fresh project. The whole
--  file is idempotent, so re-running it after an edit is safe.
--
--  Reached only by the two Edge Functions in supabase/functions/. Row level
--  security is on with no policy for any role, and that is the design rather
--  than an omission: the site ships no key, so no request a browser can make
--  reaches these tables at all. The service role — which lives only inside
--  the functions, never in a page — is the single writer.
--
--  Nothing here is secret and it is published on purpose. A schema is not a
--  credential, and the code that reads these tables should be readable next
--  to them.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  events
--
--  One row per thing that happened. `kind` is the five things worth knowing:
--
--    view   a page load.      name = the theme in force on arrival.
--    theme  a theme switch.   name = the theme switched to.
--    dwell  time in a section. name = the section id, value = seconds.
--    dev    /dev was visited. No name, no value.
--    pref   a dev-card switch. name = "<pref>.<value>", value = null.
--
--  country is an ISO 3166-1 alpha-2 code, never a name. The two geo providers
--  disagree about spelling but agree about codes, and mixing "United States"
--  with "US" in one column would split a country into two rows in every
--  aggregate that groups by it.
--
--  provider records which API answered. This is not bookkeeping: for one IP,
--  two of the databases tried named different cities. Without the column, a
--  silent fallback rewrites the geography and nothing shows it.
-- ----------------------------------------------------------------------------

create table if not exists events (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  kind     text not null check (kind in ('view', 'theme', 'dwell', 'dev', 'pref')),
  name     text,
  value    int check (value is null or value >= 0),
  country  text,
  city     text,
  region   text,
  provider text,
  ip_hash  text not null
);

comment on table events is
  'Append-only visitor events. Written by the track function, never by a browser.';

-- Every read in get_stats() groups by kind and filters by time, and the rate
-- limiter counts one ip_hash in a window on every single write.
create index if not exists events_kind_at_idx on events (kind, at desc);
create index if not exists events_ip_at_idx on events (ip_hash, at desc);


-- ----------------------------------------------------------------------------
--  ratings
--
--  ip_hash is the primary key, and that one line is the whole defence against
--  a stuffed rating. Rating again overwrites rather than appends, so a single
--  actor contributes exactly one row no matter how many times they post. It
--  is a structural limit, not a rate limit — one is a wall, the other is a
--  speed bump, and the ratings are the number a visitor actually sees.
--
--  The cost is real and worth naming: a household, an office or a phone on
--  the same NAT shares one row, and re-rating after a redesign replaces an
--  old opinion rather than adding a new one. Both are the right trade for a
--  number nobody can stuff.
-- ----------------------------------------------------------------------------

create table if not exists ratings (
  ip_hash text primary key,
  stars   int not null check (stars between 1 and 5),
  at      timestamptz not null default now(),
  country text
);

comment on table ratings is
  'One row per IP hash. Re-rating updates in place, so the table cannot be stuffed.';


-- ----------------------------------------------------------------------------
--  geo_cache
--
--  An IP is looked up once a day, not once a visit. An office of fifty people
--  behind one address costs one request to a third party instead of fifty,
--  which is what keeps a free tier comfortable and a rate limit unreachable
--  in normal use.
--
--  Not foreign-keyed to events and deliberately so — the cache outlives any
--  window of events, and rows here are safe to delete at any time.
-- ----------------------------------------------------------------------------

create table if not exists geo_cache (
  ip_hash  text primary key,
  country  text,
  city     text,
  region   text,
  provider text,
  at       timestamptz not null default now()
);

comment on table geo_cache is
  'Resolved geography per IP hash, 24h TTL. Safe to truncate; it refills.';


-- ----------------------------------------------------------------------------
--  rate_limit
--
--  Its own table rather than counting the events already there, for two
--  reasons that both bite later. Counting events couples the limiter to the
--  pruning above — delete last year's rows and every limit resets. And
--  ratings could not be counted at all: that table holds one row per hash, so
--  a hundred changes of mind leave the same single row behind.
--
--  Rows are throwaway. Anything older than a day is dead weight and is swept
--  opportunistically by take_token below, so this never needs a cron job.
-- ----------------------------------------------------------------------------

create table if not exists rate_limit (
  ip_hash text not null,
  bucket  text not null,
  at      timestamptz not null default now()
);

create index if not exists rate_limit_lookup_idx on rate_limit (ip_hash, bucket, at desc);

alter table rate_limit enable row level security;
revoke all on rate_limit from anon, authenticated;


-- ----------------------------------------------------------------------------
--  take_token
--
--  True if the caller is under the limit, false if they have spent it. The
--  insert happens here rather than in the function so that check-and-spend is
--  one statement: two concurrent requests from the same address cannot both
--  read "under the limit" and both spend the last slot.
--
--  The advisory lock is what makes that true. It is keyed on the hash and
--  bucket together and released when the transaction ends, so it serialises
--  one address against itself and touches nothing else.
-- ----------------------------------------------------------------------------

create or replace function take_token(
  p_ip     text,
  p_bucket text,
  p_max    int,
  p_window interval
)
returns boolean
language plpgsql
as $$
declare
  n int;
begin
  perform pg_advisory_xact_lock(hashtext(p_ip || ':' || p_bucket));

  select count(*) into n
    from rate_limit
   where ip_hash = p_ip and bucket = p_bucket and at > now() - p_window;

  if n >= p_max then
    return false;
  end if;

  insert into rate_limit (ip_hash, bucket) values (p_ip, p_bucket);

  /* Roughly one call in a hundred sweeps the expired rows. Cheap, needs no
     schedule, and self-limits: the table only ever holds one day of traffic. */
  if random() < 0.01 then
    delete from rate_limit where at < now() - interval '1 day';
  end if;

  return true;
end;
$$;

-- The revoke below removes PostgreSQL's default EXECUTE grant, which is the
-- only thing that let any role call this — including service_role, which never
-- had an explicit grant of its own. Leaving it there made both functions
-- unreachable by the very role the Edge Functions run as, and the symptom was
-- a 503 from a function that looked correctly deployed. The grant is the fix,
-- and it has to stay immediately after the revoke.
revoke all on function take_token(text, text, int, interval) from public, anon, authenticated;
grant execute on function take_token(text, text, int, interval) to service_role;


-- ----------------------------------------------------------------------------
--  Grants
--
--  This project hands the API roles nothing on a newly created table. The
--  default ACL for schema public is
--
--    anon=Dxtm   authenticated=Dxtm   service_role=Dxtm
--
--  which is TRUNCATE, REFERENCES, TRIGGER and MAINTAIN — and deliberately no
--  SELECT, INSERT, UPDATE or DELETE. So the revokes below change no outcome
--  for a browser; they are here so that reading this file answers "can a
--  browser write this?" without having to reason about default privileges
--  that are not visible from the file itself.
--
--  service_role is the part that bites, because it gets no DML from that
--  default either. Without the grant below, both Edge Functions deploy
--  cleanly, answer 200, and silently write nothing: PostgREST refuses with
--  42501 and the track function, which treats a failed insert as "nothing
--  kept", reports kept: 0 to a client that has nothing to do with it. That is
--  exactly what the first end-to-end run did.
--
--  Granted explicitly rather than by leaning on a default, which also makes
--  this the complete list of what the functions may do to these tables.
-- ----------------------------------------------------------------------------

alter table events     enable row level security;
alter table ratings    enable row level security;
alter table geo_cache  enable row level security;

revoke all on events    from anon, authenticated;
revoke all on ratings   from anon, authenticated;
revoke all on geo_cache from anon, authenticated;

grant select, insert, update, delete
  on events, ratings, geo_cache, rate_limit
  to service_role;

-- events.id is a generated identity column, backed by a sequence. INSERT fails
-- without USAGE on it even when the table grant above is present.
grant usage, select on all sequences in schema public to service_role;


-- ----------------------------------------------------------------------------
--  get_stats
--
--  One round trip, one jsonb object, only the blocks asked for:
--
--    {"show_stats": ["rate"]}  ->  {"rate": {...}}
--
--  A null or empty list returns everything, so the panel can ask for one
--  block or all of them without a second entry point. Adding a block is one
--  more `if` here and one more entry in the client's list — no new endpoint,
--  no schema change, no client release beyond the label.
--
--  security definer so it reads past RLS as the owner; execute is revoked
--  from every role below, so only the service role inside the stats function
--  can call it. A browser cannot reach this by any route.
-- ----------------------------------------------------------------------------

create or replace function get_stats(p_show text[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_keys text[] := coalesce(
    nullif(p_show, array[]::text[]),
    array['views', 'geo', 'themes', 'sections', 'dev', 'rate', 'prefs']
  );
  v_out  jsonb := '{}'::jsonb;
  v_views bigint;
begin
  select count(*) into v_views from events where kind = 'view';

  if 'views' = any(v_keys) then
    v_out := v_out || jsonb_build_object('views', (
      select jsonb_build_object(
        'total',  count(*),
        'unique', count(distinct ip_hash),
        'last24', count(*) filter (where at > now() - interval '24 hours'),
        'last7',  count(*) filter (where at > now() - interval '7 days')
      )
      from events where kind = 'view'
    ));
  end if;

  if 'geo' = any(v_keys) then
    v_out := v_out || jsonb_build_object('geo', coalesce((
      select jsonb_agg(jsonb_build_object('country', country, 'count', n) order by n desc)
      from (
        select coalesce(country, '??') as country, count(*) as n
        from events
        where kind = 'view'
        group by 1
        order by 2 desc
        limit 12
      ) s
    ), '[]'::jsonb));
  end if;

  if 'themes' = any(v_keys) then
    v_out := v_out || jsonb_build_object('themes', jsonb_build_object(
      -- What they arrived with. Answers "which theme do people have set".
      'at_load', coalesce((
        select jsonb_object_agg(coalesce(name, 'system'), n)
        from (
          select name, count(*) as n from events where kind = 'view' group by 1
        ) s
      ), '{}'::jsonb),
      -- What they actively chose. Answers "how often do they change it".
      'changes', coalesce((
        select jsonb_object_agg(coalesce(name, '?'), n)
        from (
          select name, count(*) as n from events where kind = 'theme' group by 1
        ) s
      ), '{}'::jsonb),
      'change_total', (select count(*) from events where kind = 'theme')
    ));
  end if;

  if 'sections' = any(v_keys) then
    v_out := v_out || jsonb_build_object('sections', coalesce((
      select jsonb_agg(jsonb_build_object('id', name, 'seconds', total) order by total desc)
      from (
        select name, sum(value) as total
        from events
        where kind = 'dwell' and name is not null
        group by 1
      ) s
    ), '[]'::jsonb));
  end if;

  if 'dev' = any(v_keys) then
    v_out := v_out || jsonb_build_object('dev', jsonb_build_object(
      'hits',  (select count(*) from events where kind = 'dev'),
      'views', v_views,
      /* Guarded rather than written as a straight division: an empty database
         divides by zero, and a stats panel that 500s on a fresh project is a
         worse first impression than one showing nothing. */
      'pct',   case when v_views > 0
                    then round((select count(*) from events where kind = 'dev')::numeric
                               * 100 / v_views, 1)
                    else 0 end
    ));
  end if;

  if 'rate' = any(v_keys) then
    v_out := v_out || jsonb_build_object('rate', (
      select jsonb_build_object(
        'count', count(*),
        'avg',   coalesce(round(avg(stars)::numeric, 2), 0),
        'hist',  jsonb_build_object(
          '1', count(*) filter (where stars = 1),
          '2', count(*) filter (where stars = 2),
          '3', count(*) filter (where stars = 3),
          '4', count(*) filter (where stars = 4),
          '5', count(*) filter (where stars = 5)
        )
      )
      from ratings
    ));
  end if;

  if 'prefs' = any(v_keys) then
    /* One row per flip, and the row's `name` is the whole fact: "<pref>.<value>",
       as in "turn.shatter" or "sfx.on". Split and regrouped here so the shape
       the panel prints is decided in one place and no reader has to know how
       the string was built.

       What this counts is changes, not states, and the distinction is the
       point of the block. The four switches live in the dev card, so the value
       in force at load is the shipped default for everyone who never opens it
       — a sample of it would be a constant. A flip is the only thing here a
       person did. */
    v_out := v_out || jsonb_build_object('prefs', coalesce((
      select jsonb_object_agg(pref, vals)
      from (
        select split_part(name, '.', 1) as pref,
               jsonb_object_agg(split_part(name, '.', 2), n) as vals
        from (
          select name, count(*) as n
          from events
          where kind = 'pref' and name is not null
          group by 1
        ) counts
        group by 1
      ) by_pref
    ), '{}'::jsonb));
  end if;

  return v_out;
end;
$$;

revoke all on function get_stats(text[]) from public, anon, authenticated;
grant execute on function get_stats(text[]) to service_role;


-- ----------------------------------------------------------------------------
--  Optional: pruning
--
--  At roughly 200 bytes a row and seven rows a visit, a hundred thousand
--  visits a year is about 140 MB against a 500 MB free tier — comfortable for
--  a long time, so this is off by default. If it ever stops being comfortable,
--  uncomment, and the aggregates simply describe a shorter history.
--
--  select cron.schedule('prune-events', '0 4 * * *', $$
--    delete from events     where at < now() - interval '12 months';
--    delete from geo_cache  where at < now() - interval '7 days';
--  $$);
-- ----------------------------------------------------------------------------
