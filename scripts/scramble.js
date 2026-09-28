/* ==========================================================================
   Odell — the churn under the language switch

     The other half of the language switch, running underneath it rather than
     instead of it. The page still leaves and returns; what changes is that the
     copy re-letters itself on the way, a character at a time, instead of
     arriving already changed.

     Only the positions that actually differ move. `My name is Odell` becomes
     `Mi nombre es Odell` by changing three characters — the M, the spaces, the
     n, the m and everything after them never flicker.

     The churn is written into BOTH spans of every pair rather than into the
     visible one. Only one of the two is ever laid out, so the swap — which is
     no more than CSS choosing the other span — happens underneath the effect
     and cannot be seen. Writing to the visible span alone was the first
     approach and was wrong: the effect would have died behind the 140ms fade
     and read as a flicker.

     Everything on the page that is bilingual and not hidden churns, headings
     and paragraphs included. What the pair is made of does not matter: a span
     holding a <strong> or a <time> is a list of text nodes rather than one
     leaf, and the churn is written node by node. Nothing is rewritten through
     `textContent`, so no pair has to be taken apart to be animated.

     Two things are held still while the text moves, because the copy is not
     the same length in both languages and an element that resizes on every
     tick would move the whole page with it. One line's worth of copy is kept
     on one line and clipped horizontally, and the span carrying it eases from
     the old width to the new one. Copy that wraps would change how many lines
     it needs as it re-letters, so the element around it is pinned by height
     and eases the same way. Both are released with the run.

   Split out of main.js. It needs nothing from that file — only
   document.documentElement — and publishes itself as window.SCRAMBLE, which
   the language switch calls at the click rather than at load.
   ========================================================================== */

(function () {
	"use strict";

	var root = document.documentElement;

	var SCRAMBLE = (function () {
		/* The off switch, and it ships off. False and the language switch behaves
       exactly as it did before this block existed: the page fades, the language
       flips, the page returns, and not one span is touched. Everything below
       goes inert.

       Kept rather than deleted, and kept working, so the effect is one word
       away: set this true and the switch churns again. */
		var ENABLED = false;

		/* All of the feel, in one place. Retiming it should never mean editing
       anything past this block. */
		var SPEED = 42; /* characters per second a string resolves at */
		var MIN_MS = 180; /* floor, so a two-letter change is still legible */
		var MAX_MS = 560; /* ceiling, so nothing outlasts the page's return */
		var TICK_MS = 45; /* how often the churn glyphs change */

		/* The swap reports in after ~140ms. If it never does — a stylesheet that
       dropped the fade, a tab that never fired its transition — this settles
       the text anyway rather than churning for the life of the page. */
		var REVEAL_BACKSTOP_MS = 1200;

		/* Letters, plus the accents the Spanish copy actually uses. A scramble that
       only ever produced ASCII would read as though it were churning the wrong
       language. */
		var LETTERS =
			"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz" +
			"ÁÉÍÓÚÜÑ" +
			"áéíóúüñ";
		var DIGITS = "0123456789";

		var run = null;

		/* Reading a layout property flushes every pending style change at once.
       Wrapped in a function because the value is never wanted — the flush is
       the whole point of the read. */
		function flushLayout() {
			return document.body.offsetWidth;
		}

		/* Every text node a span is made of, in document order. A span that holds
       markup — the hero's gradient-clipped name, three <strong>/<code>/<em>
       runs, the stats note's <time> — is a run of text nodes around those
       children rather than one leaf, and assigning `textContent` would delete
       them. Listing the nodes is what lets a pair like that churn without
       first being taken apart. */
		function textNodes(el) {
			var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
			var out = [];
			while (walker.nextNode()) out.push(walker.currentNode);
			return out;
		}

		/* One run per text node, carrying where in the pair's churn string this
       node's characters sit. The spans are always the same shape — the node
       counts match one for one everywhere on the page — so a node's offset is
       simply the length of the nodes before it. Every run is the same length
       at every moment, which is what keeps the string from being rebuilt
       differently from one tick to the next. */
		function runsFor(nodes) {
			var runs = [];
			var at = 0;
			for (var i = 0; i < nodes.length; i++) {
				var len = nodes[i].data.length;
				runs.push({
					node: nodes[i],
					at: at,
					len: len,
					last: nodes[i].data,
					done: false,
				});
				at += len;
			}
			return runs;
		}

		/* How many lines a span's copy needs. Not `getClientRects` on the span
       itself: a span that is a flex or grid item is blockified by the layout it
       sits in — the note beside the lock icon is one — and a block box reports
       a single rect however many lines it holds. A Range over the contents
       reports one rect per text fragment instead, so the answer is how many
       distinct lines those fragments sit on.

       What this costs is the layout it forces rather than the rects it reads,
       so counting them a cheaper way is not a saving — measured, both ways
       came to the same 25ms.

       A line carrying two font sizes can report two tops and be counted twice.
       That is the safe direction to be wrong in: a pair called wrapping when it
       is not is pinned to the height it already has, which changes nothing,
       where a pair called single-line when it is not gets put on one line and
       takes the rest of the page down with it. */
		function lineCount(el) {
			var range = document.createRange();
			range.selectNodeContents(el);
			var rects = range.getClientRects();
			var tops = [];
			for (var i = 0; i < rects.length; i++) {
				var t = Math.round(rects[i].top);
				if (tops.indexOf(t) === -1) tops.push(t);
			}
			return tops.length;
		}

		/* Never the character this position is heading for, so a position cannot
       read as settled before it is; never whitespace, so the word shapes hold
       while the letters inside them move. The pool is ten characters at its
       smallest, so this terminates. */
		function glyph(e, at) {
			var ch;
			do {
				ch = e.pool.charAt(Math.floor(Math.random() * e.pool.length));
			} while (ch === e.to.charAt(at));
			return ch;
		}

		/* Every pair the effect can touch, each with the two strings it has to get
       from and to. Anything declined here is left to the page fade, which
       still covers the whole document — a skipped pair is quieter, never a
       gap. */
		function collect() {
			var visibleIsEn = root.lang !== "es";
			var out = [];

			[].forEach.call(document.querySelectorAll(".lang-en"), function (en) {
				var es = en.nextElementSibling;
				if (!es || !es.classList || !es.classList.contains("lang-es")) return;
				/* The two languages have to be the same shape for their text nodes to
           line up one for one. Every pair on the page is; one that was not
           would churn its two halves against different text, so it is dropped
           rather than guessed at. */
				var enNodes = textNodes(en);
				var esNodes = textNodes(es);
				if (!enNodes.length || enNodes.length !== esNodes.length) return;

				/* The skip link and the ten visually-hidden labels are clipped to a
           pixel or parked off screen. Churning them is work nobody can see. */
				if (en.closest(".visually-hidden, .skip-link")) return;

				var enText = en.textContent;
				var esText = es.textContent;
				var from = visibleIsEn ? enText : esText;
				var to = visibleIsEn ? esText : enText;

				/* Nothing here is too long to churn. A paragraph costs more per tick
           than a nav word does, but the number of ticks is set by `MAX_MS`
           rather than by the length of the string, so the total is bounded
           whatever the copy is. `charAt` past the end is the empty string, so
           this also covers the positions one language has and the other does
           not — they churn like any other and shrink away as they settle. */
				var n = Math.max(from.length, to.length);
				var churn = [];
				var i;
				for (i = 0; i < n; i++) {
					if (from.charAt(i) !== to.charAt(i)) churn.push(i);
				}
				/* Identical in both languages: nothing to churn and nothing to put
           back. */
				if (!churn.length) return;

				/* One global speed, spent per string: the work is the number of
           positions that differ, not the length of the sentence. The clamp
           keeps a two-letter change from being a blink and a long one from
           running past the page's return. */
				var settleMs = Math.min(
					MAX_MS,
					Math.max(MIN_MS, (churn.length * 1000) / SPEED),
				);

				/* Spread across the whole duration, left to right. Settling them on
           their raw index instead would bunch every change into the first
           third of a long string and leave the rest of the time dead. The
           sweep runs over the pair's nodes together, not one node at a time,
           so a string broken by a <strong> still settles as one movement. */
				var settleAt = [];
				for (i = 0; i < churn.length; i++) {
					settleAt.push((settleMs * (i + 1)) / (churn.length + 1));
				}

				/* A string with no letters in it churns as digits: "52" passing
           through "Qz" reads as a glitch rather than as a number being
           re-rolled. */
				var pool = DIGITS;
				if (/[A-Za-zÀ-ÿ]/.test(to)) {
					pool = /\d/.test(to) ? LETTERS + DIGITS : LETTERS;
				}

				out.push({
					en: en,
					es: es,
					shown: visibleIsEn ? en : es,
					other: visibleIsEn ? es : en,
					enText: enText,
					esText: esText,
					enRuns: runsFor(enNodes),
					esRuns: runsFor(esNodes),
					to: to,
					len: n,
					churn: churn,
					settleAt: settleAt,
					settleMs: settleMs,
					pool: pool,
					/* The element the pair sits in. A wrapping pair is held still by
             this rather than by the spans — see `dress`. */
					par: en.parentElement,
					fromW: 0,
					toW: 0,
					fromBox: 0,
					toBox: 0,
					wraps: false,
					settled: 0,
					finished: false,
					last: "",
				});
			});

			return out;
		}

		function start() {
			if (!ENABLED) return;

			/* A run still in flight is put back before the next one reads the spans,
         so nothing is ever measured with glyphs in it. */
			stop();

			var entries = collect();
			if (!entries.length) return;

			var i, e;

			/* ---- Measure, with nothing written into the page -------------------
         The incoming span has no layout box at all, because `display: none`
         is how the stylesheet hides it, so it cannot be measured where it
         stands. The two spans trade places for the length of this block — the
         hidden one on, the visible one off — and each is measured holding its
         own text, which is exactly what it will look like when the swap puts
         it on screen.

         Nothing paints in between: the browser only lays out when one of these
         reads forces it, and the whole block is one synchronous pass. And
         because neither span's text is ever lent to the other, a pair with
         markup inside it is measured as itself rather than as a flattened
         copy of itself.

         Height is measured for the same reason width is. A string that wraps
         gets a different number of lines in the two languages, so a box has to
         ease from one height to the other as well — and until it does, the
         churn is held inside the height it started at.

         The height worth measuring is the parent's, not the span's. Both are
         read, because a read of a settled layout is free, but only the parent
         is used: it is the box the wrapping copy is actually held by, and
         measuring it in each language is what makes that pin exact. */
			for (i = 0; i < entries.length; i++) {
				e = entries[i];
				var fromRect = e.shown.getBoundingClientRect();
				e.fromW = fromRect.width;
				e.fromBox = e.par.getBoundingClientRect().height;
				e.wraps = lineCount(e.shown) > 1;
			}
			for (i = 0; i < entries.length; i++) {
				e = entries[i];
				e.shown.style.display = "none";
				e.other.style.display = "inline";
			}
			for (i = 0; i < entries.length; i++) {
				e = entries[i];
				var toRect = e.other.getBoundingClientRect();
				e.toW = toRect.width;
				e.toBox = e.par.getBoundingClientRect().height;
				if (lineCount(e.other) > 1) e.wraps = true;
			}
			for (i = 0; i < entries.length; i++) {
				entries[i].shown.style.display = "";
				entries[i].other.style.display = "";
			}

			run = {
				entries: entries,
				startedAt: Date.now(),
				settleStart: null,
				timer: 0,
			};

			for (i = 0; i < entries.length; i++) dress(entries[i]);

			tick();
			run.timer = window.setInterval(tick, TICK_MS);
		}

		/* The same number the settling is scheduled against, so a box cannot finish
       moving at a different time from the text inside it — the drift
       `returnMs()` exists to prevent on the other half of the switch. */
		function easeFor(e, el) {
			el.style.transitionDuration = e.settleMs / 1000 + "s";
		}

		/* Two ways of holding a box still, chosen by whether the copy wraps.

       A string that fits on one line is kept on one line. The span becomes an
       inline-block sized to the width it started at and clipped there, so the
       longer of the two languages is cut off rather than wrapping or shoving
       its neighbours around. What is cut off is churn, so the cut is never
       seen, and the width eases to the real one at the swap.

       A string that wraps cannot be treated that way — holding a paragraph on
       one line would take the rest of the page with it. It is pinned by height
       instead, and the pin goes on the element that holds the pair rather than
       on the spans. Moving the spans off `inline` moves the baselines of the
       line boxes around them too: an inline-block whose overflow is not
       visible takes its baseline from its bottom margin edge, and a paragraph
       of four lines stands seven tall for as long as the effect runs. The
       parent's height is its own, measured in both languages, so pinning it
       changes no display and nothing about the text's own layout. */
		function dress(e) {
			if (e.wraps) {
				/* Guarded because the pin belongs to the parent rather than to the
           pair, and two pairs can in principle share one. */
				if (!e.par.classList.contains("lang-scramble-box")) {
					e.par.classList.add("lang-scramble-box");
					e.par.style.height = e.fromBox + "px";
				}
				easeFor(e, e.par);
				return;
			}

			[e.en, e.es].forEach(function (span) {
				/* Both spans, deliberately. `.lang-scramble` sets `display: inline-block`
           and that cannot reveal the hidden one: the stylesheet's
           `html[lang] .lang-*` rule is two classes and an attribute against this
           one class, and it wins. So a pair can be dressed as a set and the swap
           left to happen underneath. */
				span.classList.add("lang-scramble");
				easeFor(e, span);
				span.style.width = e.fromW + "px";
			});
		}

		/* Called at the swap, from the same `finally` that puts the page on its way
       back. Settling starts here rather than at the click because the page
       spends the first ~140ms at opacity 0, and letting the short strings
       resolve in there would spend the whole effect on frames nobody sees. */
		function reveal() {
			if (!run || run.settleStart !== null) return;

			/* The spans on screen now were `display: none` a moment ago, and a
         transition cannot start on an element that was not rendered in the
         previous style change — it would simply appear at its new size. The
         flush gives the old size a rendered before-state to leave from. One
         layout for the page rather than one per span. */
			flushLayout();

			[].forEach.call(run.entries, function (e) {
				if (e.wraps) {
					e.par.style.height = e.toBox + "px";
					return;
				}
				e.en.style.width = e.toW + "px";
				e.es.style.width = e.toW + "px";
			});

			run.settleStart = Date.now();
			tick();
		}

		function tick() {
			if (!run) return;

			var now = Date.now();

			/* The swap reports in on its own event. If it never does, this settles
         anyway rather than churning for the life of the page. */
			if (
				run.settleStart === null &&
				now - run.startedAt > REVEAL_BACKSTOP_MS
			) {
				run.settleStart = now;
			}

			var elapsed = run.settleStart === null ? -1 : now - run.settleStart;
			var live = 0;

			[].forEach.call(run.entries, function (e) {
				if (e.finished) return;

				/* The settle times ascend and this only ever moves forward, so it is a
           compare per tick rather than a scan of the whole string. */
				while (e.settled < e.churn.length && e.settleAt[e.settled] <= elapsed) {
					e.settled++;
				}

				var out = "";
				var at = 0;
				for (var p = 0; p < e.len; p++) {
					if (at < e.churn.length && e.churn[at] === p) {
						out += e.settled > at ? e.to.charAt(p) : glyph(e, p);
						at++;
					} else {
						out += e.to.charAt(p);
					}
				}

				/* One string, written into both spans — so whichever one the
           stylesheet is showing displays the same thing and the swap passes
           underneath unseen. Each span takes the prefix that matches its own
           length, which is what keeps a pair whose two languages are
           different lengths churning as one continuous string rather than as
           two that disagree. Identical frames are skipped: with most pairs
           already settled, that is most of the work. */
				if (out !== e.last) {
					e.last = out;
					paint(e.enRuns, out);
					paint(e.esRuns, out);
				}

				/* Held until the width has finished easing, not just until the last
           character landed, so the box is never released mid-transition. */
				if (elapsed >= e.settleMs) {
					e.finished = true;
					return;
				}
				live++;
			});

			if (!live) stop();
		}

		/* Writes this tick's string into the nodes a span is made of, each run
       taking the slice that belongs to it. Assigning `data` updates the text
       node in place, where `textContent` would replace it — a new node every
       tick, and a lost selection with it.

       A run whose node no longer holds what this run last wrote has been taken
       over by something else — the live figures block reaches into the stats
       note, which a click early enough in the page load can land in the middle
       of. That run is dropped rather than fought over, and `stop` leaves it
       alone too, so whoever wrote it keeps it. */
		function paint(runs, out) {
			for (var i = 0; i < runs.length; i++) {
				var r = runs[i];
				if (r.done) continue;
				if (r.node.data !== r.last) {
					r.done = true;
					continue;
				}
				var s = out.slice(r.at, r.at + r.len);
				if (s === r.last) continue;
				r.last = s;
				r.node.data = s;
			}
		}

		/* Hands every node back the characters it started with. This is also the
       cancel path, so a run that is interrupted mid-churn leaves no glyph
       behind. */
		function stop() {
			if (!run) return;
			window.clearInterval(run.timer);

			var entries = run.entries;
			run = null;

			[].forEach.call(entries, function (e) {
				putBack(e.enRuns, e.enText);
				putBack(e.esRuns, e.esText);

				if (e.wraps) {
					e.par.classList.remove("lang-scramble-box");
					e.par.style.height = "";
					e.par.style.transitionDuration = "";
				}

				[e.en, e.es].forEach(function (span) {
					span.classList.remove("lang-scramble");
					span.style.width = "";
					span.style.transitionDuration = "";
				});
			});
		}

		/* Guarded. A node still holding what this run last wrote is put back, so
       an interrupted run can never clobber a value something else set; a node
       holding the right text already is left alone, because even an in-place
       `data` assignment is a DOM mutation, and a lost selection, for nothing. */
		function putBack(runs, text) {
			for (var i = 0; i < runs.length; i++) {
				var r = runs[i];
				if (r.done) continue;
				if (r.node.data !== r.last) continue;
				var s = text.slice(r.at, r.at + r.len);
				if (r.node.data === s) continue;
				r.node.data = s;
			}
		}

		return { start: start, reveal: reveal };
	})();

	window.SCRAMBLE = SCRAMBLE;
})();
