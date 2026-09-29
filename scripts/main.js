/* ==========================================================================
   Odell — portfolio script

   Everything here is progressive enhancement. With this file blocked or
   broken the page still renders, fully readable, in English, with the skill
   bars at their real widths and a static terminal transcript in place.

    1  Helpers
    2  Theme
    3  Language
    4  Navigation
    5  Header scroll state
    6  Skill bars
    7  Terminal
    8  Copy email
    9  Footer year
   10  Toast

   The live figures and the scramble used to be 11 and 12. They are now
   figures.js and scramble.js, beside this file and loaded after it, because
   each is a self-contained concern that shares nothing but the helpers this
   file publishes as window.Odell at the end.

   The page-turn on the theme switch is pageturn.js, and it is a third kind
   of thing again: it wants nothing from this file, not even a helper. The
   PAGE_TURN constant in section 2 is the entire wiring in this direction,
   and setting it to "" removes the effect without touching anything else.

   The dev panel is devpanel.js, and it is the one file that reads back from
   the others. It adds no behaviour of its own — it writes three localStorage
   keys and the code that was already here reads them, which is why nothing
   needed a setter and why the two readers published at the end are the whole
   of what it wants from this file.

   What stays here is what is actually one program: the theme, the language
   and the terminal all read and write each other, and splitting them would
   have meant publishing most of the file to move a third of it.
   ========================================================================== */

(function () {
	"use strict";

	/* ========================================================================
     1  HELPERS
     ======================================================================== */

	var root = document.documentElement;

	function $(sel, ctx) {
		return (ctx || document).querySelector(sel);
	}
	function $$(sel, ctx) {
		return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
	}

	function store(key, value) {
		try {
			if (value === undefined) return localStorage.getItem(key);
			localStorage.setItem(key, value);
		} catch (e) {
			/* Storage can be unavailable (private mode, blocked cookies). The site
         works fine without persistence, so this is not an error worth
         surfacing. */
		}
		return null;
	}

	var reduceMotion = window.matchMedia
		? window.matchMedia("(prefers-reduced-motion: reduce)")
		: { matches: false };

	/* ========================================================================
     2  THEME
     The initial value is set by the inline script in <head> so there is no
     flash of the wrong theme. This only handles the toggle.
     ======================================================================== */

	var themeToggle = $("#themeToggle");

	function currentTheme() {
		var explicit = root.getAttribute("data-theme");
		if (explicit === "light" || explicit === "dark") return explicit;
		return window.matchMedia &&
			window.matchMedia("(prefers-color-scheme: dark)").matches
			? "dark"
			: "light";
	}

	/* Only the pressed state is written here. The accessible name is a static
     "Dark theme" held in two language spans in the markup, so the stylesheet
     picks the right one and there is nothing for this function to say about
     language — writing to #themeLabel would destroy those spans. */
	function paintThemeButton() {
		if (!themeToggle) return;
		themeToggle.setAttribute("aria-pressed", String(currentTheme() === "dark"));
	}

	/* The four writes that make a theme change, gathered into one place
     because the turn has to be able to run them at a moment of its choosing
     rather than at the moment of the click: the sheet it animates is a
     picture of the page as it is now, so the page has to stay as it is until
     that picture has been taken.

     "shatter", "fall", or "" for no turn at all. */
	var PAGE_TURN = "fall";

	/* Which turn runs, in order of authority: ?turn= for this session, then the
     dev panel's stored choice, then the constant above.

     Resolved on every click rather than once, which is what it used to do. The
     cache was a fair saving when the constant was the only input; with a value
     behind it that can change while the page is open, keeping one would mean
     the panel had to invalidate it, and a second source of truth for one fact
     is a worse trade than a regex over a string and one storage read — less
     than the store("lang", …) write the language switch already makes on every
     click.

     Nothing is read from storage unless the page is in dev mode, so a key left
     behind by a session that ended cannot reach a visitor.

     ?turn=none is the empty mode, spelled so the URL does not have to end in a
     bare `=`. An unknown name is ignored rather than guessed at, in the URL
     and in storage alike. */
	function devMode() {
		/* Read off the class rather than out of storage: the head script already
       resolved it before first paint, and the panel takes the class off when
       dev mode is left, so this follows either way without a second read. */
		return root.classList.contains("is-dev");
	}

	function modeOf(name) {
		return name === "none" ? "" : name;
	}

	function knownMode(name) {
		return !!window.PAGETURN && window.PAGETURN.modes.indexOf(modeOf(name)) >= 0;
	}

	function pageTurnMode() {
		/* The empty constant is a kill switch rather than a default — pageturn.js
       documents "" as "this file is never reached, nothing in motion.css §18
       matches anything" — so it is answered before either override, and
       neither a URL nor a stored key can put back a turn the source says is
       off. */
		if (!PAGE_TURN) return "";

		var m = /[?&]turn=([a-z]*)/.exec(window.location.search);
		if (m && knownMode(m[1])) return modeOf(m[1]);

		if (devMode()) {
			var saved = store("turn");
			/* Tested against null rather than for falsiness. store() returns ""
         for a stored empty string and null when the key is absent, so a falsy
         test would read "chose none" and "never chose" as the same thing and
         quietly put the default back — which is exactly why the panel writes
         "none" and never "". */
			if (saved !== null && knownMode(saved)) return modeOf(saved);
		}

		return PAGE_TURN;
	}

	function applyTheme(next) {
		root.setAttribute("data-theme", next);
		root.style.colorScheme = next;
		store("theme", next);
		paintThemeButton();
	}

	if (themeToggle) {
		themeToggle.addEventListener("click", function () {
			var next = currentTheme() === "dark" ? "light" : "dark";
			var mode = pageTurnMode();

			/* Turned off while the language is mid-swap. The page is at zero
         opacity for the length of that fade, and a turn would photograph the
         blank it has become. `switching` is declared with `var` in section 3,
         so it hoists into this scope and is false by the time anything can
         be clicked — read here rather than there because this is the only
         place that has to care. */
			if (mode && !switching && window.PAGETURN) {
				window.PAGETURN.play(next, applyTheme, mode);
				return;
			}

			/* Read off window and guarded, the way the scramble is, and for
         the same reason: this is a separate request and so a separate way to
         fail. In strict mode a bare reference to a global that never arrived
         is a ReferenceError, and an unguarded call would take the theme
         switch down with it. Guarded, the worst case is a theme that changes
         without the effect. The terminal's `theme` command clicks this same
         button, so it gets whichever of the two happens here for free. */
			applyTheme(next);
		});
	}

	/* Follow the OS preference while the visitor has not made an explicit
     choice of their own. */
	if (window.matchMedia) {
		var scheme = window.matchMedia("(prefers-color-scheme: dark)");
		var onSchemeChange = function () {
			if (!root.getAttribute("data-theme")) paintThemeButton();
		};
		if (scheme.addEventListener)
			scheme.addEventListener("change", onSchemeChange);
		else if (scheme.addListener) scheme.addListener(onSchemeChange);
	}

	/* ========================================================================
     3  LANGUAGE
     Flip <html lang>; the stylesheet does the rest. The button advertises the
     language you would switch TO, and its accessible name spells that out.
     ======================================================================== */

	var langToggle = $("#langToggle");
	var langText = $("#langToggleText");
	var langLabel = $("#langToggleLabel");

	function applyLanguage(lang, announce) {
		root.setAttribute("lang", lang);
		if (langText) langText.textContent = lang === "en" ? "ES" : "EN";
		if (langLabel) {
			langLabel.textContent =
				lang === "en" ? "Cambiar a español" : "Switch to English";
		}
		if (langToggle)
			langToggle.setAttribute("lang", lang === "en" ? "es" : "en");

		/* The <title> and meta description are the two pieces of copy the language
       rules cannot reach, so they are swapped here. */
		document.title =
			lang === "es"
				? "Odell — Desarrollador de software: automatización e integración"
				: "Odell — Software Developer: Automation & Systems Integration";

		var desc = document.querySelector('meta[name="description"]');
		if (desc) {
			desc.setAttribute(
				"content",
				lang === "es"
					? "Desarrollador de software autodidacta enfocado en automatización, integración de sistemas e ingeniería inversa. Python, C#, C++. Trabajo seleccionado con cifras verificables."
					: "Self-taught software developer working in automation, systems integration and reverse engineering. Python, C#, C++. Selected work with verifiable numbers.",
			);
		}

		/* The CV button follows the page language, so a Spanish reader gets the
       Spanish PDF without having to go looking. Both are offered explicitly
       in the contact section for anyone who wants the other one. */
		var heroCv = $("#heroCv");
		if (heroCv) {
			heroCv.setAttribute(
				"href",
				lang === "es" ? "cv/CV_Odell_ES.pdf" : "cv/CV_Odell_EN.pdf",
			);
			heroCv.setAttribute("hreflang", lang);
		}

		paintThemeButton();
		/* TERMINAL is declared below with `var`, so on the first call it is still
       undefined. That call passes announce=false. */
		if (announce && TERMINAL) TERMINAL.refresh();
	}

	/* Only the backstop is a guess. It is a ceiling on how long to wait for the
     fade to report finishing, and it only ever applies if that report never
     arrives. Everything else is read off the page. */
	var SWAP_BACKSTOP_MS = 400;
	var switching = false;

	/* Whether the language switch fades. On unless the dev panel says otherwise,
     and there is deliberately no CSS behind it: fadeOn() is read at the top of
     switchLanguage and the instant path is the one reduced motion already
     takes, so the answer is a branch rather than a class. That is the only
     shape that works here — the gate below says why. */
	var LANG_FADE = true;

	function fadeOn() {
		if (!devMode()) return LANG_FADE;
		var saved = store("fade");
		return saved === null ? LANG_FADE : saved !== "off";
	}

	/* How long the return takes, read off the page rather than written down here
     a second time. The longest section-plus-delay wins. Removing `lang-in` too
     early would cut the fade short and snap the sections the rest of the way,
     so retiming the stylesheet must not be able to leave this timer behind. */
	function returnMs() {
		var longest = 0;
		var nodes = document.querySelectorAll("#main > section, .site-footer");
		[].forEach.call(nodes, function (n) {
			var cs = getComputedStyle(n);
			var s =
				(parseFloat(cs.transitionDuration) || 0) +
				(parseFloat(cs.transitionDelay) || 0);
			if (s > longest) longest = s;
		});
		return longest * 1000 + 80; /* seconds to ms, plus a frame of slack */
	}

	function switchLanguage() {
		/* A second click mid-transition would land its swap inside the first
       one's, so it is dropped rather than queued. The window is well under a
       second and this is not a control anyone holds down. */
		if (switching) return;

		var next = root.lang === "es" ? "en" : "es";
		store("lang", next);

		/* Reduced motion gets the new language without the theatre. The
       stylesheet would collapse the transition to nothing anyway, but the
       wait before the swap is JavaScript's, and it would still be felt.

       The dev panel's fade switch takes this same path, and takes it here
       rather than through a class that zeroes the duration. That class would
       have to drop properties from transition-property, and dropping a
       property cancels a running transition — which fires transitioncancel
       rather than transitionend, so onFadeEnd would never run and the swap
       would fall through to the backstop below. It would also miss
       #langToggleText, whose turn is a lang-flip animation, not a
       transition. Never adding `lang-out` turns all of it off at once — the
       section fades, the nav-link fades, the animation — and touches nothing
       already in flight.

       The churn is stopped rather than left running. There is no fade here for
       it to hide behind, and it writes into the visible span as well as the
       hidden one, so an uncovered churn would leave garbled letters on screen
       for up to its own maximum. */
		if (reduceMotion.matches || !fadeOn()) {
			if (window.SCRAMBLE) window.SCRAMBLE.stop();
			applyLanguage(next, true);
			return;
		}

		switching = true;

		/* The second half of the same click. The churn starts now, while the page
       is still lit, and is told separately when the swap has landed so the
       settling can begin under the fade back in.

       Read off `window` and guarded, because the churn moved to scramble.js
       and a separate request is a separate way to fail: that file can 404 or
       die on parse, and in strict mode a bare reference to the missing global
       is a ReferenceError rather than undefined — an unguarded call would take
       the language switch down with it. Guarded, the worst case is the one the
       paragraph below already describes: the page fades and flips exactly as it
       did before the churn existed. A no-op when SCRAMBLE is switched off.

       Before `lang-out`, which is the order that fails well. That class is what
       holds the page at opacity 0, so putting it on first would mean a throw in
       the churn left a visitor on a blank page with no way back; this way the
       worst case is a switch that does not happen.

       The order costs nothing either way, which was worth checking rather than
       assuming. A transition is created on the frame after the click, and the
       browser will not run that frame until this handler returns, so the fade
       cannot start before this block finishes whichever line comes first —
       measured at 239, 234 and 254ms across the three orderings, with the fade
       itself lasting 140ms in all three.

       Those are the transition's own event timings, though, and they say when
       it was scheduled rather than what was drawn. That the fade also paints
       the same either way was confirmed separately, by reading the opacities
       from `requestAnimationFrame`: seven frames land part-way through it with
       the churn off against six with it on, the same progression shifted by a
       single frame. */
		if (window.SCRAMBLE) window.SCRAMBLE.start();
		root.classList.add("lang-out");

		var target = $("#main");
		var done = false;
		var backstop;

		function onFadeEnd(e) {
			/* Six sections each end their own opacity transition, so this arrives
         repeatedly; `done` makes the first one the only one that counts. */
			if (e.propertyName !== "opacity") return;
			if (!e.target.matches || !e.target.matches("#main > section")) return;
			swap();
		}

		/* The fade is what hides the page, so the fade's own end event is the
       honest signal to swap on. A fixed timer was tried first and was wrong:
       when the main thread is busy the transition starts late, and the swap
       landed with the page still a quarter visible — enough to watch the
       language change. Waiting for the event means the swap lands on a page
       that is genuinely at zero, however long that took. */
		function swap() {
			if (done) return;
			done = true;
			if (target) target.removeEventListener("transitionend", onFadeEnd);
			window.clearTimeout(backstop);

			/* `finally`, because `lang-out` is what holds the page at opacity 0 —
         anything thrown that skipped its removal would leave a blank page
         behind. The reset is scheduled from inside the same `finally` so that
         a throw cannot also leave the button permanently dead. */
			try {
				applyLanguage(next, true);
			} finally {
				root.classList.remove("lang-out");
				root.classList.add("lang-in");

				/* In the `finally`, not the `try`. If applyLanguage threw, a churn
           left running would never settle and the page would go on spelling
           nonsense; this is what guarantees it ends. The language flip is the
           first thing applyLanguage does, so by here it has either happened or
           failed at something that left the document alone. */
				if (window.SCRAMBLE) window.SCRAMBLE.reveal();

				window.setTimeout(function () {
					root.classList.remove("lang-in");
					switching = false;
				}, returnMs());
			}
		}

		if (target) target.addEventListener("transitionend", onFadeEnd);

		/* Only for the case where the event never arrives: a backgrounded tab, or
       a stylesheet that sets no transition for those elements at all. It is
       deliberately longer than the fade, so it can never win the race. */
		backstop = window.setTimeout(swap, SWAP_BACKSTOP_MS);
	}

	if (langToggle) {
		langToggle.addEventListener("click", switchLanguage);
	}

	/* The <head> script has already written the starting value into html[lang]:
     a saved choice if the visitor made one, otherwise the browser's preference,
     otherwise "en". This reads that back rather than deciding again, so the
     detection lives in one place — and so nothing has to be corrected after
     first paint, which is what a flash of the wrong language would look like. */
	applyLanguage(root.getAttribute("lang") === "es" ? "es" : "en", false);

	/* ========================================================================
     4  NAVIGATION
     ======================================================================== */

	var navToggle = $("#navToggle");
	var navList = $("#navList");

	function closeNav() {
		if (!navList || !navToggle) return;
		navList.classList.remove("is-open");
		navToggle.setAttribute("aria-expanded", "false");
	}

	if (navToggle && navList) {
		navToggle.addEventListener("click", function () {
			var open = navList.classList.toggle("is-open");
			navToggle.setAttribute("aria-expanded", String(open));
		});

		/* Any link tap dismisses the panel — otherwise it stays open over the
       section the visitor just asked for. */
		$$(".nav-link", navList).forEach(function (link) {
			link.addEventListener("click", closeNav);
		});

		document.addEventListener("keydown", function (e) {
			if (e.key === "Escape" && navList.classList.contains("is-open")) {
				closeNav();
				navToggle.focus();
			}
		});

		document.addEventListener("click", function (e) {
			if (!navList.classList.contains("is-open")) return;
			if (navList.contains(e.target) || navToggle.contains(e.target)) return;
			closeNav();
		});

		/* Resizing past the breakpoint leaves the panel in a state the CSS no
       longer styles; reset it so the desktop layout is clean. */
		var wide = window.matchMedia("(min-width: 861px)");
		var onWide = function (e) {
			if (e.matches) closeNav();
		};
		if (wide.addEventListener) wide.addEventListener("change", onWide);
		else if (wide.addListener) wide.addListener(onWide);
	}

	/* The selection box follows the section on screen.

     It used to be painted onto the Contact link permanently, which claimed the
     visitor was in Contact whatever they were reading. The box is the only
     mark of "here" now, and it belongs to whichever section is in view.

     The sections are read back from the links rather than listed here, so an
     id that no longer resolves simply drops out instead of throwing. */
	var navEntries = [];
	var navHeader = $(".site-header");
	if (navList) {
		$$(".nav-link", navList).forEach(function (link) {
			var id = (link.getAttribute("href") || "").replace(/^#/, "");
			var sec = id ? document.getElementById(id) : null;
			if (sec) navEntries.push({ link: link, sec: sec });
		});
	}

	if (navEntries.length) {
		var navCurrent = null;
		/* Set while a click is being honoured, so the box goes straight to the
       section the click named instead of racing the smooth scroll through
       every section in between. Cleared the moment that section arrives. */
		var navPending = 0;
		var navPendingUntil = 0;
		var navPendingTimer = 0;
		var navTick = false;

		function navAtFoot() {
			return (
				window.scrollY + window.innerHeight >=
				document.documentElement.scrollHeight - 2
			);
		}

		/* The line a section has to reach to count as current. It is the same
       `scroll-padding-top` a click lands on, so arriving by click and
       arriving by hand agree about where "there" is — plus the one pixel that
       stops a strict comparison from dropping the state the click just set.
       Read from the used style, so a change to --header-h carries. */
		function navLine() {
			var pad = parseFloat(
				window.getComputedStyle(document.documentElement).scrollPaddingTop
			);
			if (!(pad > 0)) {
				pad = navHeader ? navHeader.getBoundingClientRect().height : 64;
			}
			return pad + 1;
		}

		function navIndexOfCurrent() {
			var y = window.scrollY + navLine();
			var best = -1;
			navEntries.forEach(function (entry, i) {
				if (entry.sec.getBoundingClientRect().top + window.scrollY <= y) {
					best = i;
				}
			});
			/* The last section can be too short to ever reach the line on a tall
         screen, which would leave the foot of the page with nothing
         selected. */
			return navAtFoot() ? navEntries.length - 1 : best;
		}

		/* Puts the box on entry `index`, or hides it for -1. The guard is what
       makes this cheap enough to call on every frame of a scroll: it
       re-measures four rects, so it must not run when nothing has moved. */
		function navApply(index) {
			if (index === navCurrent) return;
			navCurrent = index;

			navEntries.forEach(function (entry, i) {
				if (i === index) entry.link.setAttribute("aria-current", "true");
				else entry.link.removeAttribute("aria-current");
			});

			if (index < 0) {
				navList.classList.remove("has-current");
				return;
			}

			/* Measured against the list's border box. It has no border, so that
         is also the padding box the pseudo-element is positioned in. */
			var lr = navEntries[index].link.getBoundingClientRect();
			var nr = navList.getBoundingClientRect();
			navList.style.setProperty("--nav-x", lr.left - nr.left + "px");
			navList.style.setProperty("--nav-y", lr.top - nr.top + "px");
			navList.style.setProperty("--nav-w", lr.width + "px");
			navList.style.setProperty("--nav-h", lr.height + "px");
			navList.classList.add("has-current");
		}

		/* Re-measure without reconsidering which section is current. Needed
       whenever a label changes size under a box that is already placed. */
		function navRemeasure() {
			if (navCurrent === null || navCurrent < 0) return;
			var held = navCurrent;
			navCurrent = null;
			navApply(held);
		}

		function navSync() {
			navTick = false;
			if (Date.now() < navPendingUntil) {
				/* Still riding the scroll the click started. Hand back as soon as
           the section it named has arrived, so that a scroll the visitor
           takes over is never left holding a box pointing somewhere else —
           and so the lock cannot outlive the animation by much if the scroll
           never arrives at all. */
				var top = navEntries[navPending].sec.getBoundingClientRect().top;
				if (top > navLine() && !navAtFoot()) return;
				navPendingUntil = 0;
				window.clearTimeout(navPendingTimer);
			}
			navApply(navIndexOfCurrent());
		}

		window.addEventListener("scroll", function () {
			if (navTick) return;
			navTick = true;
			window.requestAnimationFrame(navSync);
		});

		navEntries.forEach(function (entry, i) {
			entry.link.addEventListener("click", function () {
				navApply(i);
				navPending = i;
				navPendingUntil = Date.now() + 1200;
				/* The lock has to expire on its own, not on the next scroll event.
           A click the visitor interrupts — or one that never travels, because
           the section is already on screen — can leave the page perfectly
           still with nothing left to wake the spy, and the box stranded on a
           section that is not the one in view. */
				window.clearTimeout(navPendingTimer);
				navPendingTimer = window.setTimeout(function () {
					navPendingUntil = 0;
					navApply(navIndexOfCurrent());
				}, 1200);
			});
		});

		/* Anything that changes a label's width moves the box with it. The
       observer covers the language switch, the webfont landing and the window
       resizing in one rule rather than one hook each. It cannot feed back:
       the box is absolutely positioned, so its width moves no layout. */
		var navRelayout = function () {
			window.requestAnimationFrame(navRemeasure);
		};
		if (window.ResizeObserver) {
			var navRO = new ResizeObserver(navRelayout);
			navEntries.forEach(function (entry) {
				navRO.observe(entry.link);
			});
		}
		window.addEventListener("resize", navRelayout);
		if (document.fonts && document.fonts.ready) {
			document.fonts.ready.then(navRemeasure);
		}

		/* The first placement happens before the transition is armed, so the
       box is simply there. Every move after it animates. */
		navApply(navIndexOfCurrent());
		navList.classList.add("is-ready");
	}

	/* ========================================================================
     5  HEADER SCROLL STATE
     ======================================================================== */

	var header = $(".site-header");
	if (header) {
		var ticking = false;
		var syncHeader = function () {
			header.classList.toggle("is-stuck", window.scrollY > 8);
			ticking = false;
		};
		window.addEventListener(
			"scroll",
			function () {
				if (ticking) return;
				ticking = true;
				window.requestAnimationFrame(syncHeader);
			},
			{ passive: true },
		);
		syncHeader();
	}

	/* ========================================================================
     6  SKILL BARS
     The markup already carries the final width via --level, so the bars are
     correct with no JavaScript. This only collapses and re-grows them for the
     reveal. Under reduced-motion the stylesheet pins them at full width.
     ======================================================================== */

	var skills = $$(".skill");

	if (skills.length) {
		if ("IntersectionObserver" in window && !reduceMotion.matches) {
			var skillObserver = new IntersectionObserver(
				function (entries) {
					entries.forEach(function (entry) {
						if (!entry.isIntersecting) return;
						entry.target.classList.add("is-visible");
						skillObserver.unobserve(entry.target);
					});
				},
				{ threshold: 0.4, rootMargin: "0px 0px -40px 0px" },
			);

			skills.forEach(function (skill) {
				skillObserver.observe(skill);
			});
		} else {
			skills.forEach(function (skill) {
				skill.classList.add("is-visible");
			});
		}
	}

	/* ========================================================================
     7  TERMINAL
     A real input with real output. Every answer it gives also exists as a
     section on this page, so nothing is available only through the terminal.
     ======================================================================== */

	var TERMINAL = (function () {
		var screenEl = $("#terminalOut");
		var inputEl = $("#terminalInput");
		if (!screenEl || !inputEl) return { refresh: function () {} };

		var history = [];
		var historyIndex = -1;
		var typing = null; // { timer, el, text } while a line is animating
		var flushRest = null; // completes the rest of the welcome, if still running

		function t(en, es) {
			return root.lang === "es" ? es : en;
		}

		/* Reads whatever figure is on the page right now instead of repeating a
       copy of it here. The cards refresh from the live APIs, so a number
       hardcoded in this file would eventually contradict the page it is
       describing. */
		function stat(id) {
			var el = document.querySelector('.stat[data-stat="' + id + '"]');
			return el ? el.textContent.trim() : "?";
		}

		/* Writes a line of output. `cls` maps to the .t-* colour classes. */
		function line(text, cls) {
			var el = document.createElement("div");
			if (cls) el.className = cls;
			el.textContent = text;
			screenEl.appendChild(el);
			scrollToEnd();
			return el;
		}

		function scrollToEnd() {
			screenEl.scrollTop = screenEl.scrollHeight;
		}

		function blank() {
			return line("");
		}

		/* Writes a line whose content is a destination rather than a sentence.
       The addresses the contact command prints used to be plain text, which
       left the visitor reading one off the screen and typing it out by hand.
       Web destinations open in a new tab, because the terminal is something
       the visitor is in the middle of using and navigating away would take
       the transcript with it. mailto: is deliberately left untargeted —
       there is no page to open, and pairing it with target=_blank leaves a
       blank tab behind once the mail client takes over. */
		function link(href, label) {
			var el = line("");
			el.appendChild(document.createTextNode("  "));
			var a = document.createElement("a");
			a.className = "t-link";
			a.href = href;
			a.textContent = label;
			if (href.indexOf("http") === 0) {
				a.target = "_blank";
				a.rel = "noopener noreferrer";
			}
			el.appendChild(a);
			return el;
		}

		/* Types text into a freshly created line, one character per tick. */
		function typeLine(text, cls, done) {
			var el = line("", cls);
			if (reduceMotion.matches || !text) {
				el.textContent = text;
				scrollToEnd();
				done();
				return;
			}
			var i = 0;
			var timer = window.setInterval(function () {
				el.textContent = text.slice(0, ++i);
				scrollToEnd();
				if (i >= text.length) {
					window.clearInterval(timer);
					if (typing && typing.timer === timer) typing = null;
					done();
				}
			}, 16);
			typing = { timer: timer, el: el, text: text };
		}

		/* Complete the line in progress and print whatever is still queued, so an
       interruption never leaves a half-written line on screen. */
		function finishTyping() {
			if (typing) {
				window.clearInterval(typing.timer);
				typing.el.textContent = typing.text;
				typing = null;
			}
			if (flushRest) {
				var rest = flushRest;
				flushRest = null;
				rest();
			}
			screenEl.setAttribute("aria-live", "polite");
		}

		/* ---- Commands ------------------------------------------------------- */

		var COMMANDS = {
			help: function () {
				blank();
				line(t("Available commands:", "Comandos disponibles:"), "t-ok");
				blank();
				line("  whoami     " + t("who I am", "quién soy"));
				line("  about      " + t("background", "trayectoria"));
				line(
					"  skills     " +
						t("languages and tools", "lenguajes y herramientas"),
				);
				line("  projects   " + t("selected work", "trabajo seleccionado"));
				line("  contact    " + t("how to reach me", "cómo contactarme"));
				line(
					"  theme      " + t("switch light / dark", "cambiar claro / oscuro"),
				);
				line(
					"  lang       " +
						t("switch English / Spanish", "cambiar inglés / español"),
				);
				line("  clear      " + t("clear the screen", "limpiar la pantalla"));
				blank();
				line(
					t(
						"  Every answer above also exists as a section on this page.",
						"  Cada respuesta de arriba también existe como sección en esta página.",
					),
					"t-dim",
				);
				blank();
			},

			whoami: function () {
				blank();
				line(
					t(
						"Odell — self-taught software developer since 2018.",
						"Odell — desarrollador de software autodidacta desde 2018.",
					),
					"t-ok",
				);
				line(
					t(
						"Automation · Systems integration · Reverse engineering",
						"Automatización · Integración de sistemas · Ingeniería inversa",
					),
				);
				line(
					t(
						"Python, C#, C++, Kotlin, JavaScript, Java",
						"Python, C#, C++, Kotlin, JavaScript, Java",
					),
					"t-dim",
				);
				blank();
			},

			about: function () {
				blank();
				line(
					t(
						"Most of what I know came from taking apart software that already",
						"La mayor parte de lo que sé vino de desarmar software que ya",
					),
				);
				line(
					t(
						"worked and figuring out why. I build tools: things that automate",
						"funcionaba y averiguar por qué. Construyo herramientas: cosas que automatizan",
					),
				);
				line(
					t(
						"a process, package a build, or reach data that is not exposed cleanly.",
						"un proceso, empaquetan una build u obtienen datos que no están expuestos limpiamente.",
					),
				);
				blank();
				line(
					"  → " +
						t("see the About section below", "ver la sección Sobre mí abajo"),
					"t-dim",
				);
				blank();
			},

			skills: function () {
				blank();
				line(t("Languages", "Lenguajes"), "t-ok");
				line(
					"  Python     turnstile_solver · image-in-terminal + " +
						t("client work", "trabajo de cliente"),
				);
				line("  C#         custom-gui-sfx · Account Manager");
				line(
					"  Java       " +
						t("private client work", "trabajo privado con clientes"),
				);
				line(
					"  Kotlin     " +
						t("private client work", "trabajo privado con clientes"),
				);
				line(
					"  C / C++    " +
						t("private client work", "trabajo privado con clientes"),
				);
				line(
					"  JavaScript " +
						t("private client work", "trabajo privado con clientes"),
				);
				blank();
				line(t("Platforms", "Plataformas"), "t-ok");
				line("  .NET 6 / WPF · MVVM · Unity · Android · Jetpack Compose");
				line("  Docker · Docker Compose · Git · GitHub · Linux · PostgreSQL");
				line("  Flask · FastAPI · Django · SQLAlchemy · REST APIs · Quart");
				line("  patchright · Playwright · Selenium · Scrapy · requests");
				line("  NumPy · Pandas · OpenCV · Rich · pytest · PyPI");
				line(
					"  SSH · TLS / HTTPS · " +
						t(
							"certificates · WiFi security · proxies",
							"certificados · seguridad WiFi · proxies",
						),
				);
				blank();
				line(
					"  → " +
						t(
							"see the Capabilities section below",
							"ver la sección Capacidades abajo",
						),
					"t-dim",
				);
				blank();
			},

			projects: function () {
				blank();
				line(t("Selected work", "Trabajo seleccionado"), "t-ok");
				blank();
				line(
					"  1. Account Manager        " +
						stat("am-apk") +
						" " +
						t("downloads", "descargas") +
						"  " +
						t("(closed source)", "(código cerrado)"),
				);
				line(
					"  2. Custom GUI SFX         " +
						stat("cgs-dl") +
						" " +
						t("downloads", "descargas"),
				);
				line(
					"  3. Turnstile Solver       " +
						stat("ts-stars") +
						" ★ · " +
						stat("ts-forks") +
						" " +
						t("forks", "bifurcaciones"),
				);
				line("  4. image-in-terminal      PyPI v" + stat("iit-ver"));
				line("  5. Workflow automation    " + t("private", "privado"));
				blank();
				line(
					"  → " +
						t(
							"see the Selected Work section below",
							"ver la sección Trabajo seleccionado abajo",
						),
					"t-dim",
				);
				blank();
			},

			contact: function () {
				blank();
				line(
					t(
						"Email is the fastest way to reach me:",
						"El correo es la vía más rápida de contactarme:",
					),
					"t-ok",
				);
				link("mailto:odellgm11012001@gmail.com", "odellgm11012001@gmail.com");
				blank();
				line(t("Elsewhere:", "En otros sitios:"), "t-dim");
				link("https://github.com/odell0111", "github.com/odell0111");
				link("https://linkedin.com/in/odell0111", "linkedin.com/in/odell0111");
				link("https://www.instagram.com/odell.dev", "instagram.com/odell.dev");
				link("https://t.me/odell0111", "t.me/odell0111");
				blank();
			},

			theme: function () {
				if (themeToggle) themeToggle.click();
				blank();
				line(t("Theme switched.", "Tema cambiado."), "t-dim");
				blank();
			},

			/* The switch itself re-prints the welcome in the new language, so there
         is nothing left to add here. */
			lang: function () {
				if (langToggle) langToggle.click();
			},

			clear: function () {
				screenEl.textContent = "";
			},
		};

		/* ---- Fork bomb ------------------------------------------------------
       Deliberately absent from COMMANDS and from `help`. A hidden command
       that the help text lists is not hidden; this one is meant to be
       recognised by the visitor who already knows it.

       Matched with all whitespace stripped, because the line is written
       several ways in the wild and `:(){ :|: & };:`, `:(){ :|:& };:` and
       `:() { :|: & } ;:` are the same bomb. */
		var FORK_BOMB = ":(){:|:&};:";

		var dead = false; /* panicked, and not yet rebooted */
		var busy = false; /* a dump or a boot is still printing */
		var bus = null; /* timer of the sequence in flight, if any */

		/* The dump is not translated. It is machine output, and a kernel log in
       Spanish would read as a costume. This line is different — it is
       addressed to the visitor, not part of the joke — so it is. */
		function rebootHint() {
			return t(
				"the shell is gone — type 'reboot' to bring it back",
				"el shell está muerto — escribe 'reboot' para recuperarlo",
			);
		}

		/* Runs [delay, class, text] steps in order, each after the one before.
       Under reduced motion the waits collapse: the dump still prints in full,
       it just does not pace itself. */
		function sequence(steps, done) {
			var i = 0;
			(function next() {
				if (i >= steps.length) {
					bus = null;
					done();
					return;
				}
				var step = steps[i++];
				bus = window.setTimeout(
					function () {
						line(step[2], step[1]);
						next();
					},
					reduceMotion.matches ? 0 : step[0],
				);
			})();
		}

		/* Stops a dump or a boot mid-flight, with the state that went with it.
       A language switch during either one would otherwise print the welcome
       underneath output that is still arriving — and, for a dump, mark the
       shell dead a moment later on top of it. Interrupting the panic leaves
       the shell alive, which is the honest reading of what happened. */
		function cancelSequence() {
			if (bus) {
				window.clearTimeout(bus);
				bus = null;
			}
			busy = false;
			inputEl.disabled = false;
		}

		/* The counts accelerate, and the clock stops dead at the moment of the
       panic — which is what a real one looks like.

       The trace is trimmed on purpose. The screen holds about ten lines, and
       the dump as a real kernel writes it is three times that, so the top of
       it scrolls out of view the moment the panic lands. What is kept is the
       recognisable spine — OOM kill, panic, oops header, two frames, the end
       marker — which reads as genuine without burying the line that matters.
       The order is the real one: panic message, then the header, then the
       trace. */
		var PANIC = [
			[240, "t-dim", "[    0.902] fork: 2 tasks"],
			[210, "t-dim", "[    0.928] fork: 64 tasks"],
			[180, "t-dim", "[    0.961] fork: 4096 tasks"],
			[140, "t-dim", "[    1.004] fork: 131072 tasks"],
			[110, "t-err", "[    1.061] Out of memory: Killed process 1 (init)"],
			[
				90,
				"t-err",
				"[    1.062] Kernel panic - not syncing: Attempted to kill init!",
			],
			[70, "t-err", "[    1.062] Hardware name: odell.dev / portfolio"],
			[60, "t-err", "[    1.062] Call Trace:"],
			[50, "t-err", "[    1.062]  panic+0x1b1/0x2f0"],
			[50, "t-err", "[    1.062]  do_exit+0x2e5/0x9f0"],
			[
				50,
				"t-err",
				"[    1.062] ---[ end Kernel panic - not syncing: Attempted to kill init! ]---",
			],
		];

		var BOOT = [
			[0, "t-dim", "rebooting..."],
			[280, "t-dim", "[    0.000] odell.dev portfolio shell — cold boot"],
			[230, "t-dim", "[    0.114] mounting /portfolio .......... ok"],
			[200, "t-dim", "[    0.238] restoring session .......... ok"],
			[180, "t-ok", "[    0.301] init: shell ready"],
		];

		function forkBomb() {
			busy = true;
			/* Disabled rather than merely ignored: a shell that has stopped taking
         input is what a dying machine looks like, and it keeps a command
         typed during the dump from landing in the middle of it. Remembering
         whether the field had focus matters — disabling an element blurs it,
         so without this the visitor would have to click again to type. */
			var hadFocus = document.activeElement === inputEl;
			inputEl.disabled = true;
			/* The dump is machine noise, and announcing eleven lines of it would be
         worse than useless. The region comes back on for the hint at the
         end, which is the one line a screen-reader user actually needs. */
			screenEl.setAttribute("aria-live", "off");
			blank();

			sequence(PANIC, function () {
				blank();
				screenEl.setAttribute("aria-live", "polite");
				line(rebootHint(), "t-ok");
				blank();
				dead = true;
				busy = false;
				inputEl.disabled = false;
				if (hadFocus) inputEl.focus({ preventScroll: true });
			});
		}

		/* Only reachable while the shell is dead — see run(). The boot is held as
       busy for the same reason the panic is: the shell is not answering yet,
       and a command typed over the boot lines lands in the middle of them. */
		function reboot() {
			dead = false;
			busy = true;
			screenEl.textContent = "";
			screenEl.setAttribute("aria-live", "off");
			sequence(BOOT, function () {
				busy = false;
				screenEl.textContent = "";
				welcome(); /* this manages aria-live itself, off then on */
			});
		}

		/* What is on screen while the shell is dead, so that a language switch
       redraws the panic in the new language instead of quietly resurrecting
       the prompt. */
		function deadScreen() {
			blank();
			line(
				"[    1.062] ---[ end Kernel panic - not syncing: Attempted to kill init! ]---",
				"t-err",
			);
			blank();
			line(rebootHint(), "t-ok");
			blank();
			screenEl.setAttribute("aria-live", "polite");
		}

		function run(raw) {
			var cmd = raw.trim().toLowerCase();
			if (!cmd || busy) return;

			line("$ " + raw, "t-dim");

			/* Everything the shell can still be asked to do once it has died. */
			if (dead) {
				if (cmd === "reboot") {
					reboot();
					return;
				}
				blank();
				line(
					t(
						"cannot fork: Resource temporarily unavailable",
						"no se pudo hacer fork: recurso no disponible temporalmente",
					),
					"t-err",
				);
				line(rebootHint(), "t-dim");
				blank();
				scrollToEnd();
				return;
			}

			if (cmd.replace(/\s+/g, "") === FORK_BOMB) {
				forkBomb();
				return;
			}

			if (Object.prototype.hasOwnProperty.call(COMMANDS, cmd)) {
				COMMANDS[cmd]();
			} else {
				blank();
				line(
					t("command not found: " + cmd, "comando no encontrado: " + cmd),
					"t-err",
				);
				line(
					t("type 'help' for the list", "escribe 'help' para ver la lista"),
					"t-dim",
				);
				blank();
			}
			scrollToEnd();
		}

		/* ---- Wiring --------------------------------------------------------- */

		inputEl.addEventListener("keydown", function (e) {
			if (e.key === "Enter") {
				var value = inputEl.value;
				if (value.trim()) {
					history.push(value);
					historyIndex = history.length;
				}
				inputEl.value = "";
				run(value);
				return;
			}

			/* Tab is deliberately not intercepted — it moves focus onward like any
         other field. */

			if (e.key === "ArrowUp") {
				if (!history.length) return;
				e.preventDefault();
				historyIndex = Math.max(0, historyIndex - 1);
				inputEl.value = history[historyIndex] || "";
				return;
			}

			if (e.key === "ArrowDown") {
				if (!history.length) return;
				e.preventDefault();
				historyIndex = Math.min(history.length, historyIndex + 1);
				inputEl.value = history[historyIndex] || "";
			}
		});

		/* Clicking anywhere in the screen focuses the prompt, the way a real
       terminal behaves — but only on an explicit click, never on load, so the
       page never hijacks the scroll position or steals focus. */
		var screenBox = $(".terminal-screen");
		if (screenBox) {
			screenBox.addEventListener("click", function (e) {
				if (window.getSelection && String(window.getSelection()).length) return;
				if (e.target === inputEl) return;
				/* A link in the transcript is a destination, not a prompt.
           Following it should not also pull focus back into the input the
           visitor is leaving behind. */
				var node = e.target;
				while (node && node !== screenBox) {
					if (node.tagName === "A") return;
					node = node.parentNode;
				}
				inputEl.focus();
			});
		}

		/* ---- Welcome --------------------------------------------------------
       aria-live is held at "off" while the text types itself in, then turned
       on. Without that, a screen reader would announce the welcome one
       character at a time; after it, real command output is announced. */
		function welcome() {
			/* Switched off here as well as at the end, because this runs a second
         time when the language changes — by then the region is already live,
         and the intro would be announced one character at a time. */
			screenEl.setAttribute("aria-live", "off");

			var queue = [
				[t("Odell — portfolio shell", "Odell — shell del portfolio"), "t-ok"],
				[
					t(
						"Type a command and press Enter. Try: whoami, skills, projects, contact",
						"Escribe un comando y pulsa Enter. Prueba: whoami, skills, projects, contact",
					),
					"t-dim",
				],
				["", ""],
			];

			/* Held so an interruption can print whatever is left in one go. */
			flushRest = function () {
				while (queue.length) {
					var item = queue.shift();
					line(item[0], item[1]);
				}
			};

			(function next() {
				if (!queue.length) {
					flushRest = null;
					/* Only now does the region start announcing. Turning it on earlier
             would read the welcome out one character at a time. */
					screenEl.setAttribute("aria-live", "polite");
					screenEl.setAttribute("role", "log");
					return;
				}
				var item = queue.shift();
				typeLine(item[0], item[1], next);
			})();
		}

		/* Re-print in the new language when the visitor switches. A dead shell
       stays dead: switching language redraws the panic, it does not hand back
       a working prompt. */
		function refresh() {
			finishTyping();
			cancelSequence();
			screenEl.textContent = "";
			if (dead) {
				deadScreen();
				return;
			}
			welcome();
		}

		/* If someone starts typing before the intro finishes, get out of the way
       rather than fighting them for the screen. Left attached rather than
       removing itself after the first key: the welcome runs again after a
       language switch and again after a reboot, and each of those needs the
       same escape hatch. */
		inputEl.addEventListener("input", function () {
			if (!typing && !flushRest) return;
			finishTyping();
		});

		welcome();

		return { refresh: refresh };
	})();

	/* ========================================================================
     8  COPY EMAIL
     ======================================================================== */

	var copyBtn = $("#copyEmail");

	if (copyBtn) {
		var resetTimer = null;

		var flashCopied = function () {
			copyBtn.classList.add("is-copied");
			if (resetTimer) window.clearTimeout(resetTimer);
			resetTimer = window.setTimeout(function () {
				copyBtn.classList.remove("is-copied");
			}, 2200);
		};

		/* document.execCommand is deprecated, but the async Clipboard API is
       unavailable over plain http and in some embedded browsers, and this is
       a copy button — it has to work everywhere. */
		var legacyCopy = function (text) {
			var ta = document.createElement("textarea");
			ta.value = text;
			ta.setAttribute("readonly", "");
			ta.style.position = "fixed";
			ta.style.top = "-1000px";
			document.body.appendChild(ta);
			ta.select();
			var ok = false;
			try {
				ok = document.execCommand("copy");
			} catch (e) {
				ok = false;
			}
			document.body.removeChild(ta);
			return ok;
		};

		copyBtn.addEventListener("click", function () {
			var email = copyBtn.getAttribute("data-email");
			if (!email) return;

			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(email).then(flashCopied, function () {
					if (legacyCopy(email)) flashCopied();
				});
			} else if (legacyCopy(email)) {
				flashCopied();
			}
		});
	}

	/* ========================================================================
     9  FOOTER YEAR
     ======================================================================== */

	var year = $("#year");
	if (year) year.textContent = String(new Date().getFullYear());

	/* ========================================================================
     10  TOAST
     One message, at most, ever. The element ships in the markup rather than
     being created when it is needed: a live region has to be in the document
     before anything is put into it, or the change is never announced.
     ======================================================================== */

	var toast = $("#toast");
	var toastText = $("#toastText");
	var toastClose = $("#toastClose");
	var toastTimer = null;
	var toastSpans = null;

	function hideToast() {
		if (!toast) return;
		if (toastTimer) {
			window.clearTimeout(toastTimer);
			toastTimer = null;
		}
		toast.classList.remove("is-visible");
	}

	function showToast(en, es, holdFor) {
		if (!toast || !toastText) return;

		/* Built once, rewritten after that. Both languages go in together, as
       everywhere else on this page — the stylesheet decides which is read. */
		if (!toastSpans) {
			var enSpan = document.createElement("span");
			enSpan.className = "lang-en";
			enSpan.lang = "en";
			var esSpan = document.createElement("span");
			esSpan.className = "lang-es";
			esSpan.lang = "es";
			toastText.textContent = "";
			toastText.appendChild(enSpan);
			toastText.appendChild(esSpan);
			toastSpans = [enSpan, esSpan];
		}
		toastSpans[0].textContent = en;
		toastSpans[1].textContent = es;

		toast.classList.add("is-visible");
		if (toastTimer) window.clearTimeout(toastTimer);
		toastTimer = window.setTimeout(hideToast, holdFor || 10000);
	}

	if (toastClose) toastClose.addEventListener("click", hideToast);

	/* Escape dismisses it too, but only while it is actually up — an
     unconditional handler would swallow that key for the whole page. */
	document.addEventListener("keydown", function (e) {
		if (e.key !== "Escape" && e.key !== "Esc") return;
		if (toast && toast.classList.contains("is-visible")) hideToast();
	});

	/* Everything the other files in scripts/ need, and nothing else. They load
	   after this one and read it once, at the top, so the order in the markup is
	   the order of the dependency: this file defines the page and they dress it.
	   Publishing only what is actually consumed keeps the surface small enough
	   to see at a glance.

	   The last two are read by devpanel.js and by nothing else, and they are
	   readers rather than setters because the stored value is the whole
	   channel: the panel writes a key, the code that already owned that
	   decision reads it back at the moment it needs it, and there is nothing in
	   between to keep in step. */
	window.Odell = {
		$: $,
		$$: $$,
		showToast: showToast,
		turnMode: pageTurnMode,
		fadeOn: fadeOn,
	};
})();
