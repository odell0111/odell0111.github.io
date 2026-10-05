/* ==========================================================================
   Odell — visitor stats, and the rating

   Two things in one file because they share one endpoint, one queue and one
   reason to exist. The rating is part of the portfolio and is on for every
   visitor. The counts are not shown anywhere on the site at all: they are
   read out of get_stats() by whoever wants them, somewhere that is not here.

   That absence is the same judgement the rate section's comment makes, and
   it is worth the two sentences. A page that opens by counting its own
   visitors is a page about itself, and a score printed underneath the thing
   being scored invites an argument with the number instead of an answer to
   it.

   This is the only file on the site that talks to a server it does not own,
   so everything in it is optional in the strongest sense. Every failure
   below is swallowed rather than reported: a stat nobody is waiting on is
   not worth an error, and a portfolio showing a broken counter is worse than
   one showing no counter at all. The one exception is the rating, which a
   visitor deliberately did — that one answers, beside itself.

     Endpoints   the function URL, and the early return that turns the whole
                 file off
     Queue       what is waiting to be sent, and when it goes
     Dwell       which section is on screen, and for how long
     Rating      the five stars

   Four constants below have to stay in step with the Edge Functions and each
   says so where it is declared: the section list, the theme names, the pref
   names, and the batch ceiling. Nothing else here is coupled to the server.

   The site ships no key. That is the design, not an oversight: writes go
   through a function that rate limits and validates, and the tables behind
   it are unreachable from a browser by any route. See supabase/schema.sql.
   ========================================================================== */

(function () {
	"use strict";

	/* ========================================================================
     ENDPOINTS
     ======================================================================== */

	/* Public, and not a secret. The whole design is that the site ships no
     credential, so the endpoint that writes is an endpoint anyone can call —
     what keeps the tables clean is the rate limiter and the validation
     behind it, not obscurity.

     Blank means off, and off is a return rather than a flag read somewhere
     else: with this empty the file is inert, the page is exactly the page it
     was before the file existed, and nothing below has to be read to know
     that. */
	var TRACK_URL =
		"https://llbtwjrfsuwfjgswbvpq.supabase.co/functions/v1/track";

	if (!TRACK_URL) return;

	/* ---- Tunables --------------------------------------------------------- */

	/* One batch per fifteen seconds while a visit is live. Frequent enough
     that a short visit still reports something — the first batch goes out
     at once, so only the tail is ever at risk — and rare enough that a
     visitor reading the page costs a handful of requests rather than one
     per event. */
	var FLUSH_MS = 15000;

	/* The function's own ceiling. A queue that reached this would mean events
     were being produced faster than they are sent, so dropping is correct
     and the cap is only here to bound memory on a page left open for days. */
	var QUEUE_MAX = 50;

	/* Must list every id the page can report. The function drops a name it
     does not recognise, so a section renamed in index.html and not here
     goes unreported rather than misreported — a silent gap, not a wrong
     figure. */
	var SECTIONS = [
		"top",
		"work",
		"capabilities",
		"approach",
		"about",
		"contact",
		"rate",
	];

	/* Must match the function's own list. "system" is the third value and
     the one that matters most: it is what a visitor who has never touched
     the toggle is on, and without it the largest group would be invisible
     or, worse, counted as whichever theme their OS happened to be. */
	var THEMES = ["light", "dark", "system"];

	/* The four switches in the dev card. Must match the function's own PREFS,
     which is the list that decides whether a name is stored at all — an
     unrecognised one is dropped there, so a pref added here and not there
     records nothing rather than recording something wrong. */
	var PREFS = ["turn", "sfx", "churn", "fade"];

	/* ---- Helpers ---------------------------------------------------------- */

	/* Duplicated rather than shared, the way it already is in main.js,
     devpanel.js, scramble.js and pageturn.js. Four copies of nine lines is
     the house's deliberate trade: the alternative is a load-order dependency
     between files that otherwise share nothing, and this file in particular
     has to keep working when the others do not. */
	function store(key, value) {
		try {
			if (value === undefined) return localStorage.getItem(key);
			localStorage.setItem(key, value);
		} catch (e) {
			/* Private mode, blocked cookies. Nothing here needs persistence to
         work: the two reads are which theme the visitor arrived with, and
         whether they have already rated. A refusal answers "system" to the
         first and "not yet" to the second, and both are the honest answer
         when nothing could be remembered. */
		}
		return null;
	}

	function has(obj, key) {
		return Object.prototype.hasOwnProperty.call(obj, key);
	}

	function now() {
		return new Date().getTime();
	}

	/* ========================================================================
     QUEUE
     ======================================================================== */

	var queue = []; /* events ready to go, in the order they happened */
	var dwell = {}; /* section id -> whole seconds banked since the last flush */
	var timer = null;

	/* Fire and forget. No response is read anywhere on the write path: the
     function answers {ok, kept} and there is nothing a page can do with a
     smaller number than it sent, so the promise is dropped on purpose. */
	function post(url, payload, keepalive) {
		if (!window.fetch) return;
		try {
			fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "omit",
				body: JSON.stringify(payload),
				/* `keepalive` is the reason this is fetch and not sendBeacon.
           The private-network-access rules aside, sendBeacon cannot set a
           Content-Type outside the three CORS-safelisted ones, and the
           function reads JSON. keepalive carries the same guarantee — the
           request outlives the page — and carries a real header with it. */
				keepalive: !!keepalive,
			});
		} catch (e) {
			/* A synchronous throw here means a browser too old for the options
         object, or a page already being torn down. Either way the events
         are gone and there is nobody to tell. */
		}
	}

	/* Sends everything waiting, folding in whatever the dwell clock has
     banked. Called on a timer, and once more as the page goes away. */
	function flush(keepalive) {
		bank();

		var events = queue.slice(0);
		queue.length = 0;

		for (var id in dwell) {
			if (!has(dwell, id)) continue;
			if (dwell[id] > 0) {
				events.push({ kind: "dwell", name: id, value: dwell[id] });
			}
		}
		dwell = {};

		if (!events.length) return;
		post(TRACK_URL, { events: events }, keepalive);
	}

	function push(event) {
		if (queue.length >= QUEUE_MAX) return;
		queue.push(event);
	}

	/* ========================================================================
     DWELL
     ======================================================================== */

	var nodes = []; /* the sections being watched, resolved once */
	var current = null; /* the id whose clock is running, or null */
	var since = 0; /* ms at which that clock started */
	var paused = false; /* the tab is hidden, so nothing is being viewed */
	var queued = false; /* a measure is already booked for this frame */

	/* Which section the middle of the viewport is inside. The middle, not
     the top: the question is what the visitor is looking at, and a test
     against the top edge answers a different one. A section whose first
     pixel has cleared the header is credited in full even when nine tenths
     of the screen is still the section before it, which would hand the
     longest dwell on the page to whatever sits under a heading. */
	function measure() {
		queued = false;
		if (paused) return;

		var mid = (window.innerHeight || 0) / 2;
		var found = null;

		for (var i = 0; i < nodes.length; i++) {
			var box = nodes[i].el.getBoundingClientRect();
			if (box.top <= mid && box.bottom > mid) {
				found = nodes[i].id;
				break;
			}
		}

		set(found);
	}

	function schedule() {
		if (queued) return;
		queued = true;
		/* Scroll fires far more often than the answer can change, and the
       answer is read off layout — so it is coalesced to one read a frame
       rather than one read an event. */
		if (window.requestAnimationFrame) {
			window.requestAnimationFrame(measure);
		} else {
			window.setTimeout(measure, 100);
		}
	}

	function set(id) {
		if (id === current) return;
		bank();
		current = id;
		since = now();
	}

	/* Folds the running stretch into the tally and restarts the clock. A
     no-op while hidden, which is the whole of the "tab left open overnight"
     defence on this side — the function clamps each event at an hour as
     well, because a client is not obliged to be this honest. */
	function bank() {
		if (!current || paused) return;
		var secs = Math.round((now() - since) / 1000);
		if (secs > 0) dwell[current] = (dwell[current] || 0) + secs;
		since = now();
	}

	function collect() {
		nodes.length = 0;
		for (var i = 0; i < SECTIONS.length; i++) {
			var el = document.getElementById(SECTIONS[i]);
			if (el) nodes.push({ id: SECTIONS[i], el: el });
		}
	}

	function hide() {
		/* Banked before the flag, not after: bank() reads the flag, so
       setting it first would throw away the last stretch — which on a
       bounce is the only stretch there was. */
		bank();
		paused = true;
		flush(true);
		if (timer) {
			window.clearInterval(timer);
			timer = null;
		}
	}

	function show() {
		paused = false;
		since = now();
		if (!timer) {
			timer = window.setInterval(function () {
				flush(false);
			}, FLUSH_MS);
		}
		schedule();
	}

	if (window.addEventListener) {
		window.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("resize", schedule, { passive: true });

		document.addEventListener("visibilitychange", function () {
			if (document.hidden) hide();
			else show();
		});

		/* visibilitychange covers this everywhere it exists, but iOS Safari
       has been known to skip it on a tab discard, and a missed hide is a
       missed final batch. Both paths empty the same queue, so the second
       one to arrive sends nothing. */
		window.addEventListener("pagehide", hide);

		/* Back from the bfcache — the page was frozen rather than unloaded,
       so nothing re-ran and hide() has already stopped the clock and
       cleared the timer. Without this a restored page records the view it
       arrived with and then nothing else, for as long as it is read. */
		window.addEventListener("pageshow", function () {
			if (!document.hidden) show();
		});
	}

	/* ========================================================================
     WHAT THE PAGE REPORTS
     ======================================================================== */

	/* The theme in force on arrival — which is the stored choice, or
     "system" when there is none. Deliberately not currentTheme() from
     main.js: that resolves to light or dark, and a visitor who never
     touched the toggle is then indistinguishable from one who chose the
     theme their OS was already on. Those are different answers to "which
     theme do people have set". */
	function arrivingTheme() {
		var saved = store("theme");
		return THEMES.indexOf(saved) >= 0 ? saved : "system";
	}

	collect();
	push({ kind: "view", name: arrivingTheme() });

	/* Sent at once rather than with the first tick. A visitor who bounces in
     four seconds is the common case, and waiting fifteen of them would
     record every bounce as no visit at all. */
	flush(false);
	show();

	/* The one thing main.js asks of this file, and it asks exactly once — in
     applyTheme, which is the single place a theme change happens, whether
     it came from the toggle, the terminal's `theme` command, or the
     page-turn's callback. */
	window.STATS = {
		theme: function (name) {
			if (THEMES.indexOf(name) < 0) return;
			push({ kind: "theme", name: name });
		},

		/* A flip of one of the dev card's four switches, reported at the
       moment it happens rather than read back at load — and the difference
       is the whole reason this is a change event. All four are honoured
       only under .is-dev and written only by devpanel.js, so for every
       visitor who never opens /dev the value in force is the shipped
       default. Sampling that on load would record the same constant over
       and over and call it a preference; a flip is the only thing here a
       person actually did.

       Sent as one string, "<pref>.<value>", which is what get_stats()
       splits on. Called by devpanel.js on the line beside the store() it
       already writes, so the key and the event cannot drift apart. */
		pref: function (name, value) {
			if (PREFS.indexOf(name) < 0) return;
			push({ kind: "pref", name: name + "." + value });
		},
	};

	/* ========================================================================
     RATING
     ======================================================================== */

	var widget = document.getElementById("rateStars");
	var note = document.getElementById("rateNote");
	var chosen = 0;

	/* Whether this visitor has already committed a rating in this session.
     It is not a claim about what is on the server — nothing here asks, and
     the second sentence only says what happened here: this replaced the last
     one you gave. The table's own upsert is what makes that true. */
	var rated = false;

	function paint() {
		for (var i = 0; i < stars.length; i++) {
			var on = i < chosen;
			stars[i].className = on ? "rate-star is-on" : "rate-star";
			/* aria-checked follows the option the visitor is on, which is
         what a radio group's checked state means. Whether it reached the
         server is a separate fact and is said in words, beside. */
			stars[i].setAttribute("aria-checked", i + 1 === chosen ? "true" : "false");
		}
	}

	/* One tab stop for the group, arrows move within it — which is why the
     buttons are not five separate tab stops. Without a choice yet the stop
     is the first star, so the group cannot be tabbed past entirely. */
	function rove() {
		var stop = chosen || 1;
		for (var i = 0; i < stars.length; i++) {
			stars[i].setAttribute("tabindex", i + 1 === stop ? "0" : "-1");
		}
	}

	/* The note carries two independent facts and the stylesheet picks the
     sentence from both of them: whether the rating reached the server —
     is-done, is-failed, or neither while the request is still out — and
     whether this visitor had already rated, which is `repeat`.

     Classes rather than text set from here, so every word stays in the
     markup in both languages, where the rest of the page's words live. */
	function say(state, repeat) {
		if (!note) return;
		var cls = "rate-note";
		if (state) cls += " " + state;
		if (repeat) cls += " is-again";
		note.className = cls;
	}

	function commit(value) {
		/* Read before it is set: this call is the one that makes it true. */
		var repeat = rated;
		rated = true;
		chosen = value;
		paint();
		rove();
		say("");

		if (!window.fetch) {
			say("is-failed", repeat);
			return;
		}

		fetch(TRACK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "omit",
			body: JSON.stringify({ rating: value }),
		})
			.then(function (res) {
				/* Remembered only once the server has taken it. A rating that
           failed did not count, and remembering it anyway would hide the
           prompt from someone whose vote was never recorded — which is the
           one failure on this page that costs something real. */
				if (res.ok) store("rated", String(value));
				say(res.ok ? "is-done" : "is-failed", repeat);
			})
			["catch"](function () {
				say("is-failed", repeat);
			});
	}

	var stars = widget ? widget.querySelectorAll(".rate-star") : [];

	if (widget && stars.length) {
		for (var s = 0; s < stars.length; s++) {
			(function (button) {
				var value = Number(button.getAttribute("data-star")) || 0;

				button.addEventListener("click", function () {
					commit(value);
				});

				/* Preview, not a choice. The fill is the answer to "what am
           I about to give", and hover is the only way to ask the
           question with a mouse. */
				button.addEventListener("mouseenter", function () {
					if (!chosen) hover(value);
				});
				button.addEventListener("mouseleave", function () {
					if (!chosen) hover(0);
				});

				/* Arrows move the selection but do not send it. Booking an
           ArrowRight sweep across five stars as five requests would
           put five writes on the server for one gesture — four of them
           stale by the time they land, and none of them a decision the
           visitor has actually made. Enter and Space activate
           the button, which is a commit. */
				button.addEventListener("keydown", function (e) {
					var key = e.key;
					var step =
						key === "ArrowRight" || key === "ArrowDown"
							? 1
							: key === "ArrowLeft" || key === "ArrowUp"
								? -1
								: 0;
					var next;

					if (step) {
						next = (chosen || value) + step;
						if (next < 1) next = stars.length;
						if (next > stars.length) next = 1;
					} else if (key === "Home") {
						next = 1;
					} else if (key === "End") {
						next = stars.length;
					} else {
						return;
					}

					e.preventDefault();
					chosen = next;
					paint();
					rove();
					stars[next - 1].focus();
				});
			})(stars[s]);
		}

		paint();
		rove();
	}

	/* The fill while nothing is committed. Separate from paint() because it
     must not touch aria-checked: a preview is not a selection and must not
     be announced as one. */
	function hover(value) {
		for (var i = 0; i < stars.length; i++) {
			stars[i].className = i < value ? "rate-star is-on" : "rate-star";
		}
	}

})();
