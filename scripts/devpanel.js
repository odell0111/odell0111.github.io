/* ==========================================================================
   Odell — the dev panel

   A gear in the navbar and a card under it, carrying the four settings this
   site has that are otherwise only changeable by editing a file and
   reloading: which theme-switch transition runs, whether the shatter plays
   its sound, whether the language switch churns its copy, and whether it
   fades at all.

   Reached by visiting /dev, which writes one key and sends the visitor back.
   Everything here is downstream of that key:

     dev    "1"                          absent: not in dev mode
     turn   "none" | "fall" | "shatter"  absent: PAGE_TURN
     sfx    "on" | "off"                 absent: pageturn.js's own
     churn  "on" | "off"                 absent: scramble.js's own
     fade   "on" | "off"                 absent: LANG_FADE

   Three rules this file exists to keep.

   The mode is stored as "none" and never "". `store()` returns "" for a
   stored empty string and null when the key is missing, so a falsy test would
   read "chose none" and "never chose" as the same thing, and quietly put the
   default back.

   Every one of those keys is read only while html carries .is-dev. A key left
   behind by a session that ended cannot reach a visitor's page.

   Nothing here is the truth about anything. The card writes keys; the four
   consumers read their own key at the moment they need it. That is why there
   is no setter to call and nothing to keep in sync — and why the card paints
   itself from the page's own readers rather than from the keys it wrote,
   since ?turn= can beat a stored mode and scramble.js can be shipped with its
   churn on whatever is stored. A card that rendered its own belief would be
   able to disagree with the page it is describing.

   The sound is the one control whose reader is also given work to do. Every
   other consumer can wait until the moment it needs its key; pageturn.js
   cannot, because by the time it reads "on" it is already inside a click and
   has no time left to fetch two files. So the panel calls its warm() — the
   only call in this file that does anything other than write a key, and it
   is still the consumer's own function, called on the consumer's own terms.

   Sets no global: it has no consumer. The card is its whole interface.

   To remove it: delete this file, its <script> tag, the .dev-tools and
   .dev-card markup, and the dev block at the end of layout.css. The reads
   left behind in main.js and scramble.js are inert without a writer.
   ========================================================================== */

(function () {
	"use strict";

	var root = document.documentElement;

	/* The whole file, in one line. Nothing below runs for a visitor who has not
     been to /dev — no lookups, no listeners, no card. */
	if (!root.classList.contains("is-dev")) return;

	var toggle = document.getElementById("devToggle");
	var card = document.getElementById("devCard");
	if (!toggle || !card) return;

	/* Read once, at the top, the way every other module in this folder reads
     what it needs. Both are guarded: each is a separate request and so a
     separate way to fail, and a card that cannot read the page's real state
     has nothing honest to draw. Falling out here leaves the gear disabled —
     the state it ships in — rather than live and useless. */
	var API = window.Odell;
	var SCRAMBLE = window.SCRAMBLE;
	if (!API || !API.turnMode || !API.fadeOn || !SCRAMBLE || !SCRAMBLE.enabled) {
		return;
	}

	/* The list of modes comes from pageturn.js rather than being written down
     here a second time. It is what the markup is checked against below. */
	var MODES = (window.PAGETURN && window.PAGETURN.modes) || [];

	/* The sound's half of pageturn.js, or undefined if that file is not there.
     Not part of the guard above, deliberately: the turn modes already degrade
     to an empty list and a card full of disabled buttons, and churn and fade
     would still work. Only the sound has nothing to say without it, so only
     the sound goes down with it — see the switch below. */
	var SFX = window.PAGETURN && window.PAGETURN.sfx;

	/* The same read/write overload main.js carries. Duplicated rather than
     shared for the reason scramble.js duplicates its layout read: this file
     must keep working if that one is restructured, and a shared helper is
     exactly the coupling that would stop it. Storage can be unavailable, so
     nothing here throws and a failed write is not worth surfacing. */
	function store(key, value) {
		try {
			if (value === undefined) return localStorage.getItem(key);
			localStorage.setItem(key, value);
		} catch (e) {
			/* Private mode, blocked cookies. The card still works for this
         page view; it just will not be remembered. */
		}
		return null;
	}

	function forget(key) {
		try {
			localStorage.removeItem(key);
		} catch (e) {}
	}

	/* The same guarded call main.js makes into stats.js, and guarded for the
     same reason: stats.js is the last script on the page and defines the
     global it is called on, so a click that beat it there would throw. */
	function report(name, value) {
		if (window.STATS) window.STATS.pref(name, value);
	}

	var turnButtons = card.querySelectorAll("[data-turn]");
	var sfxSwitch = document.getElementById("devSfx");
	var churnSwitch = document.getElementById("devChurn");
	var fadeSwitch = document.getElementById("devFade");
	var turnNote = document.getElementById("devTurnNote");
	var fadeNote = document.getElementById("devFadeNote");

	/* What a segment stands for, as opposed to what it says. The empty mode is
     spelled "none" everywhere a person can see it and "" everywhere the code
     means it — pageturn.js's own list holds "", and ?turn= accepts "none" as
     the spelling that does not have to end in a bare `=`. */
	function valueOf(shown) {
		return shown === "none" ? "" : shown;
	}

	/* ---- Painting -------------------------------------------------------- */

	/* Everything the card shows, derived fresh from the page every time. No
     state is held between calls, so there is no drift to correct and no
     "refresh after changing" to forget. */
	function paint() {
		var mode = API.turnMode();
		var i, b;

		for (i = 0; i < turnButtons.length; i++) {
			b = turnButtons[i];
			b.setAttribute("aria-pressed", String(valueOf(b.getAttribute("data-turn")) === mode));
		}

		/* Painted only when there is a reader to paint from. The switch is
       disabled in the same pass, so it can never be left live over a stale
       answer — which is the one thing this file must not do. */
		if (SFX) sfxSwitch.setAttribute("aria-pressed", String(SFX.on()));
		sfxSwitch.disabled = !SFX;

		var churn = SCRAMBLE.enabled();
		var fade = API.fadeOn();
		churnSwitch.setAttribute("aria-pressed", String(churn));
		fadeSwitch.setAttribute("aria-pressed", String(fade));

		/* The churn has no way to run without the fade, so the switch is taken
       away rather than left live and inert. It still shows its own state: a
       churn that is on but unreachable is worth being able to see. */
		churnSwitch.disabled = !fade;
		if (fade) {
			fadeNote.hidden = true;
			fadeNote.textContent = "";
		} else {
			fadeNote.hidden = false;
			fadeNote.textContent =
				"The scramble is held off while the transition is off: with no fade over the swap there is nothing for it to hide behind.";
		}

		/* ?turn= beats the stored value by design, so the card says so rather
       than showing a mode the page is not using. */
		var m = /[?&]turn=([a-z]*)/.exec(window.location.search);
		if (m && MODES.indexOf(valueOf(m[1])) >= 0) {
			turnNote.hidden = false;
			turnNote.textContent =
				"?turn=" + m[1] + " is overriding this. Choosing one here takes it back.";
		} else {
			turnNote.hidden = true;
			turnNote.textContent = "";
		}
	}

	/* ---- The controls ---------------------------------------------------- */

	/* A mode the running build does not have is disabled rather than hidden, so
     the card shows what pageturn.js can actually do instead of what the markup
     happens to say. Nothing here is optional today; this is what keeps that
     true if a mode is ever dropped. */
	[].forEach.call(turnButtons, function (b) {
		b.disabled = MODES.indexOf(valueOf(b.getAttribute("data-turn"))) < 0;
		b.addEventListener("click", function () {
			store("turn", b.getAttribute("data-turn"));
			report("turn", b.getAttribute("data-turn"));

			/* A ?turn= in the address bar outranks the stored value, so a click
         that left it there would write a choice and then appear to ignore it.
         Taken out of the URL instead, and with replaceState so the back button
         does not walk through the rewrites. */
			if (/[?&]turn=/.test(window.location.search) && window.history &&
				window.history.replaceState) {
				var q = window.location.search
					.replace(/[?&]turn=[a-z]*/, "")
					.replace(/^&/, "?");
				window.history.replaceState(
					null,
					"",
					window.location.pathname + q + window.location.hash,
				);
			}
			paint();
		});
	});

	/* The sound. Flipped from the reader like the two below it, and then the
     reader is asked to get ready — but off the reader's answer and not off
     the click. The write fails silently in private mode, and warm() fetches:
     warming on the strength of the click alone would have a switch that is
     visibly still off downloading two files. Reading back is what keeps those
     two from disagreeing.

     Guarded on SFX as well, though the switch above is disabled without it.
     Two locks on the same door, because the one thing this file cannot do is
     act on a state it has no reader for. */
	sfxSwitch.addEventListener("click", function () {
		if (!SFX) return;

		/* The new value is settled before it is written rather than read back
       after. SFX.on() consults storage every time it is asked, so the second
       call in the shape this used to have was already answering with the new
       value — and a report written the same way would have named the setting
       being replaced, not the one being chosen. `next` is the chosen value,
       and warm() tests it directly rather than re-reading to reach the same
       answer by a longer route. */
		var next = SFX.on() ? "off" : "on";
		store("sfx", next);
		report("sfx", next);
		if (next === "on") SFX.warm();
		paint();
	});

	/* Flipped from what the page reports rather than from a copy of it, so the
     two switches need no state of their own. */
	churnSwitch.addEventListener("click", function () {
		var next = SCRAMBLE.enabled() ? "off" : "on";
		store("churn", next);
		report("churn", next);
		paint();
	});

	/* The churn key is deliberately left alone when the fade goes off. It keeps
     whatever was chosen, so turning the fade back on restores the effect
     instead of silently clearing it — and nothing can act on it in the
     meantime, because the instant path never starts a churn. */
	fadeSwitch.addEventListener("click", function () {
		var next = API.fadeOn() ? "off" : "on";
		store("fade", next);
		report("fade", next);
		paint();
	});

	/* ---- Opening and closing --------------------------------------------- */

	/* The same pattern the mobile nav uses: a class for the state, aria-expanded
     kept in step as a string, Escape closes and hands focus back, and a click
     outside closes. Both document listeners return immediately unless the card
     is open, the way the two that already exist do. */
	function close() {
		card.classList.remove("is-open");
		toggle.setAttribute("aria-expanded", "false");
	}

	toggle.addEventListener("click", function () {
		if (card.classList.contains("is-open")) {
			close();
			return;
		}
		card.classList.add("is-open");
		toggle.setAttribute("aria-expanded", "true");
	});

	document.getElementById("devClose").addEventListener("click", function () {
		close();
		toggle.focus();
	});

	document.addEventListener("keydown", function (e) {
		if (e.key !== "Escape" || !card.classList.contains("is-open")) return;
		close();
		toggle.focus();
	});

	document.addEventListener("click", function (e) {
		if (!card.classList.contains("is-open")) return;
		if (card.contains(e.target) || toggle.contains(e.target)) return;
		close();
	});

	/* ---- Leaving ---------------------------------------------------------- */

	document.getElementById("devExit").addEventListener("click", function () {
		forget("dev");

		/* Closed as well as un-flagged. The card's own `display: none` is
       unscoped and the rule that shows it is scoped to .is-dev, so dropping
       the class hides it either way — but leaving it open would mean the next
       visit to /dev opened onto a card that was never opened. */
		close();
		root.classList.remove("is-dev");
	});

	/* ---- Start ------------------------------------------------------------ */

	paint();

	/* Last, so the gear only becomes clickable once there is something behind
     it. It ships disabled for the case where this file never runs at all;
     this is the other half of the same rule. */
	toggle.disabled = false;
})();
