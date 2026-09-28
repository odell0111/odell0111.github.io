/* ==========================================================================
   Odell — live figures

   The numbers in the markup are real, and dated underneath the grid. They
   are the fallback. This refreshes the ones a browser is allowed to read
   for itself:

     api.github.com/repos/.../releases        download counts
     api.github.com/repos/...                 stars and forks
     pypi.org/pypi/.../json                   latest version
     static.pepy.tech/badge/.../month         downloads a month

   all four of which send Access-Control-Allow-Origin. Uptodown does not,
   so that figure has no live path at all — it moves only when
   tools/update-stats.py is run again, which is what the date records.

   Nothing here is required. A figure that fails to arrive keeps whatever is
   already on the page, the note under the grid says the refresh did not
   happen, and a toast says so once.

   Split out of main.js, which now publishes the three helpers below as
   window.Odell. This file loads after it and reads them once, at the top.
   Without that namespace it does nothing at all, which is the same posture
   as every other failure here: the numbers in the markup are already real.
   ========================================================================== */

(function () {
	"use strict";

	var API = window.Odell;
	if (!API) return;

	var $ = API.$;
	var $$ = API.$$;
	var showToast = API.showToast;

	(function () {
		var els = {};
		$$(".stat").forEach(function (el) {
			var id = el.getAttribute("data-stat");
			if (id) els[id] = el;
		});
		if (!window.fetch || !window.Promise || !Object.keys(els).length) return;

		var GITHUB_API = "https://api.github.com/repos/odell0111/";
		var TIMEOUT = 8000; /* ms before a request is abandoned */
		var SHIMMER_DELAY = 700; /* ms before the skeleton is shown at all */

		var attempted = {}; /* id -> true, a request was made for it */
		var settled = {}; /* id -> true, that request has finished */
		var anyFailed = false;
		var shimmerTimer = null;
		var work = [];

		/* ---- Fetching ------------------------------------------------------- */

		/* The timeout, the abort and the 200-only rule are the same whichever
       shape the body arrives in, so they live here once. */
		function request(url, accept, read) {
			return new Promise(function (resolve, reject) {
				var controller = window.AbortController
					? new window.AbortController()
					: null;
				var opts = { headers: { Accept: accept } };
				if (controller) opts.signal = controller.signal;

				var timer = window.setTimeout(function () {
					if (controller) controller.abort();
					reject(new Error("timed out"));
				}, TIMEOUT);

				window
					.fetch(url, opts)
					.then(function (res) {
						/* A rate-limited GitHub answers 403 with a well-formed JSON body, so
             reading it anyway is exactly how a wrong number gets on screen.
             Only a 200 counts. */
						if (!res.ok) throw new Error("HTTP " + res.status);
						return read(res);
					})
					.then(
						function (data) {
							window.clearTimeout(timer);
							resolve(data);
						},
						function (err) {
							window.clearTimeout(timer);
							reject(err);
						},
					);
			});
		}

		function getJSON(url) {
			return request(url, "application/json", function (res) {
				return res.json();
			});
		}

		function getText(url, accept) {
			return request(url, accept, function (res) {
				return res.text();
			});
		}

		/* Stars and forks are two fields of one response, so the promise is made
       once and shared. A failed attempt is not kept — a second attempt could
       still succeed, and holding on to the rejection would deny it that. */
		var repoPromise = null;
		function turnstileRepo() {
			if (repoPromise) return repoPromise;
			repoPromise = getJSON(GITHUB_API + "turnstile_solver");
			repoPromise.then(null, function () {
				repoPromise = null;
			});
			return repoPromise;
		}

		/* Summed the same way tools/update-stats.py sums it, so the live figure
       and the baked one mean the same thing. */
		function releaseDownloads(name) {
			return getJSON(GITHUB_API + name + "/releases").then(function (releases) {
				var total = 0;
				releases.forEach(function (rel) {
					(rel.assets || []).forEach(function (asset) {
						total += asset.download_count || 0;
					});
				});
				return total;
			});
		}

		/* ---- Applying ------------------------------------------------------- */

		function settle(id, ok) {
			settled[id] = true;
			if (els[id]) els[id].classList.remove("is-loading");
			if (!ok) anyFailed = true;
		}

		/* Each of these resolves either way, so Promise.all below always runs. */
		function refresh(id, promise, pick) {
			if (!els[id]) return;
			attempted[id] = true;
			work.push(
				promise.then(
					function (data) {
						var value = pick(data);
						if (value === undefined || value === null || value === "") {
							settle(id, false);
							return;
						}
						/* data-value is deliberately left alone. It records the figure baked
           into the HTML, which is the one the updater script replaces next
           time it runs; the visible text is what can go stale. */
						els[id].textContent = String(value);
						settle(id, true);
					},
					function () {
						settle(id, false);
					},
				),
			);
		}

		/* PyPI's monthly download count, read from the pepy.tech badge that the
       repo's own README already carries. pepy has a JSON API, but it needs a
       key; the badge is public and sends Access-Control-Allow-Origin, so it
       is the one that can be read from a static page.

       The badge is drawn as two <text> pairs — the label twice, then the
       figure twice, once as a drop shadow and once as the figure. Matching on
       the shape of a number finds the figure without depending on the order
       or on counting elements.

       Big packages come back abbreviated ("403M", "1G"), and that is left
       exactly as pepy published it. Expanding it into a number would invent a
       precision the source never had. */
		function pepyMonthly() {
			return getText(
				"https://static.pepy.tech/badge/image-in-terminal/month",
				"image/svg+xml",
			).then(function (svg) {
				var texts = svg.match(/<text[^>]*>[^<]*<\/text>/g) || [];
				for (var i = 0; i < texts.length; i++) {
					var value = texts[i].replace(/<[^>]*>/g, "").trim();
					if (/^[\d.,]+[kMG]?$/.test(value)) return value;
				}
				throw new Error("no figure in the badge");
			});
		}

		refresh("am-apk", releaseDownloads("account-manager"), function (n) {
			return n;
		});
		refresh("cgs-dl", releaseDownloads("custom-gui-sfx"), function (n) {
			return n;
		});
		refresh("ts-stars", turnstileRepo(), function (r) {
			return r.stargazers_count;
		});
		refresh("ts-forks", turnstileRepo(), function (r) {
			return r.forks_count;
		});
		refresh(
			"iit-ver",
			getJSON("https://pypi.org/pypi/image-in-terminal/json"),
			function (d) {
				return d.info && d.info.version;
			},
		);
		refresh("iit-dl", pepyMonthly(), function (v) {
			return v;
		});

		if (!work.length) return;

		/* ---- The note under the grid ---------------------------------------- */

		var note = $("#statsNote");
		var noteEn = note && $(".lang-en", note);
		var noteEs = note && $(".lang-es", note);

		function formatDate(iso, locale) {
			var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
			if (!m) return iso;
			try {
				/* new Date('2026-09-27') is read as UTC midnight, which prints as the
           26th everywhere west of Greenwich — including all of Latin America.
           The numeric constructor is local, and is the only safe form here. */
				var d = new Date(+m[1], +m[2] - 1, +m[3]);
				return d.toLocaleDateString(locale, {
					day: "numeric",
					month: "long",
					year: "numeric",
				});
			} catch (e) {
				return iso; /* no locale data — the ISO date is unambiguous anyway */
			}
		}

		/* The date is prose and does not depend on any request, so it is written
       straight away rather than after the network settles. The markup ships
       the ISO string, which is what shows with scripting off. */
		var iso = note && note.getAttribute("data-snapshot");
		var enDate = noteEn && $(".stats-date", noteEn);
		var esDate = noteEs && $(".stats-date", noteEs);
		if (enDate) enDate.textContent = formatDate(iso, "en-GB");
		if (esDate) esDate.textContent = formatDate(iso, "es-ES");

		/* Nothing appears until a request has been slow enough to be worth
       showing. On a fast connection the page just has today's figures and
       never flickers; on a slow one the skeleton says what is happening. */
		shimmerTimer = window.setTimeout(function () {
			Object.keys(attempted).forEach(function (id) {
				if (!settled[id] && els[id]) els[id].classList.add("is-loading");
			});
		}, SHIMMER_DELAY);

		Promise.all(work).then(function () {
			window.clearTimeout(shimmerTimer);
			Object.keys(attempted).forEach(function (id) {
				if (els[id]) els[id].classList.remove("is-loading");
			});

			/* Both languages are written here, once. Nothing re-runs on a language
         switch, because the stylesheet already holds both. */
			var enState = noteEn && $(".stats-state", noteEn);
			var esState = noteEs && $(".stats-state", noteEs);
			if (enState) {
				enState.textContent = anyFailed
					? " · live refresh unavailable"
					: " · refreshed on load";
			}
			if (esState) {
				esState.textContent = anyFailed
					? " · actualización en vivo no disponible"
					: " · actualizado al cargar";
			}

			if (anyFailed) {
				showToast(
					"Some figures could not be refreshed, so the last verified numbers are shown.",
					"No se pudieron actualizar algunas cifras, así que se muestran las últimas verificadas.",
				);
			}
		});
	})();
})();
