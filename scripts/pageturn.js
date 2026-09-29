/* ==========================================================================
   Odell — portfolio · the theme switch

   Two effects, and main.js decides whether either runs: it holds PAGE_TURN,
   one string, and calls in here only when that string names a mode. Set it to
   "" and both are gone — this file is never reached, nothing in motion.css §18
   matches anything, and the toggle repaints instantly the way it did before
   any of this existed.

     "shatter"  the outgoing page is glass. It cracks from the point you
                clicked, throws its pieces outward, holds them there for half a
                second, and lets them fall.
     "fall"     the outgoing page is a sheet pinned along its top edge: the pin
                lets go, the sheet swings, turns and drops away.

   In BOTH effects it is the OUTGOING page that leaves — going dark the light
   page falls away over the dark one, and going light the dark page falls away
   over the light one. That is worth stating because the version before this
   one was built the other way round: the sheet was always the light page, and
   every rule needed a mirror image for the way back. Neither of these does.
   There is no direction to branch on anywhere in this file.

   The two differ in cost, and that is the whole reason there are two rather
   than one:

     fall     uses View Transitions. The browser snapshots the page itself, so
              fidelity is free and cannot drift, and starting one costs nothing.
     shatter  cannot. A snapshot can be animated but not cut into pieces, so
              the page is captured to a bitmap here and rebuilt as sixty-odd
              clipped layers. See capture() for the three things this page does
              that break the obvious version of that capture, all three found by
              running it rather than by reading about it.

   So shatter is the default and fall is the way out of it: if the capture
   fails, or has not landed in time, the turn runs as a fall rather than not at
   all. A mode that silently does nothing is worse than one that visibly
   degrades, which is the rule this file has always followed.

   Publishes exactly one global, window.PAGETURN, and reads nothing from
   main.js except the callback it is handed. A guard on the call site means
   this file can 404 or die on parse without taking the theme switch with it.

   Loaded after main.js, beside scramble.js and figures.js.
   ========================================================================== */

(function () {
	"use strict";

	var root = document.documentElement;

	var PAGETURN = (function () {
		/* ====================================================================
       TUNABLES
       ==================================================================== */

		/* Spokes and rings in the fracture, so the piece count is RAYS * RINGS
       — sixty-six below. This is a look rather than a budget: fewer pieces
       reads as a jigsaw, more reads as a mosaic, and glass sits between the
       two. */
		var RAYS = 11;
		var RINGS = 6;

		/* How far a piece is thrown when the pane lets go, in px: the least it
       is ever thrown, and the most. The push is proportional to the square
       root of the piece's distance from the impact, so the far pieces travel
       further without leaving the frame before the fall begins.

       The floor exists because the innermost shards sit ON the impact point
       and would otherwise not move at all, which reads as a hole in the middle
       of the break rather than as a break. */
		var SCATTER_MIN = 7;
		var SCATTER_MAX = 62;

		/* The most a piece turns as it comes apart, in degrees, either way. */
		var SPIN_MAX = 9;

		/* The longest a piece waits before it lets go, in ms, applied as a
       POSITIVE animation-delay. The stagger is the delay; the fill is what
       makes the delay cost nothing, because a piece holds its own tile until
       its turn comes.

       It was a negative delay, which reads as the same stagger and is not.
       A negative delay starts the animation already part-way through, so the
       first frame a piece is ever painted is one it has already left — there
       is no frame anywhere showing the page whole, and the break opens with
       the pieces visibly out of place. The crack is simultaneous either way;
       it is a separate element and does not read this. */
		var LAG_MAX = 70;

		/* Where the sheet in the fall effect is pinned, and how it leaves.

       The pin is the language toggle rather than a point on the frame, so the
       sheet reads as pinned to the page. The angle is drawn fresh on every
       turn — this is the one thing in either effect that is not reproducible
       on purpose: the sheet was pinned a little crooked, and it goes over the
       way it is already leaning.

       TILT_MAX is how crooked it starts, in degrees, either way. TURN_MIN and
       TURN_MAX are how far it turns on the way over, in the direction it was
       leaning. PIN_CLEAR is the margin by which the last corner has to clear
       the bottom of the viewport. */
		var TILT_MAX = 6;
		var TURN_MIN = 18;
		var TURN_MAX = 26;
		var PIN_CLEAR = 40;

		/* How long the capture gets before the turn gives up on it and falls
       instead. It has to cover the synchronous clone and serialise plus the
       asynchronous decode. */
		var CAPTURE_TIMEOUT_MS = 1500;

		/* Extra wait beyond an effect's own duration before the overlay is
       cleared, in case the animation's end event never arrives. */
		var SLACK_MS = 500;

		/* How long after the last piece has left the frame the shatter's overlay
       comes off.

       It does not need SLACK_MS's generosity. That one covers a promise that
       might never settle; this covers the frames between an animation ending
       and the paint that shows it, and the pieces are already past the bottom
       edge by then. It is kept short because a click that arrives during the
       effect waits for this timer — slack here is a wait with nothing on
       screen to look at. */
		var SHATTER_TAIL_MS = 60;

		/* ====================================================================
       STATE
       ==================================================================== */

		var reduceMotion = window.matchMedia
			? window.matchMedia("(prefers-reduced-motion: reduce)")
			: { matches: false };

		var busy = false;
		var target = null; /* where the turn in flight is going */
		var pending = null; /* a click that arrived while a turn was running */
		var layers = []; /* the crack and every shard, only during a shatter */
		var bitmapUrl = null; /* the captured page, as an object URL */
		var endTimer = null;
		var fontCss = null; /* Google's @font-face rules, URLs inlined */
		var fontTried = false;

		/* ====================================================================
       HELPERS
       ==================================================================== */

		function flushLayout() {
			return document.body.offsetWidth;
		}

		function each(list, fn) {
			Array.prototype.slice.call(list).forEach(fn);
		}

		/* An effect's length lives in motion.css and nowhere else. Read back off
       the page the same way main.js reads the language fade's duration: a
       second copy here could be retimed apart from the stylesheet it is
       supposed to be measuring. */
		function durationMs(name, fallback) {
			var raw = getComputedStyle(root).getPropertyValue(name);
			var n = parseFloat(raw);
			if (!n) return fallback;
			return /ms/.test(raw) ? n : n * 1000;
		}

		/* How long the whole shatter runs for, from the first piece letting go to
       the last one clearing the bottom of the frame.

       The last piece is the one with the longest delay, so LAG_MAX opens it;
       the break is then over at 40% of the effect and the fall takes the
       remaining 60%, which is one whole --pt-shatter however it is retimed;
       and --pt-gap is the pause between the two. Nothing here is a number of
       its own — retime the effect in motion.css and this follows, which is the
       point of reading it back rather than writing it down twice. */
		function shatterMs() {
			return LAG_MAX
				+ durationMs("--pt-shatter", 1000)
				+ durationMs("--pt-gap", 10);
		}

		/* Run `fn` once the browser has actually painted. Two frames, not one:
       the first returns before the paint that was already queued, and only the
       second is guaranteed to be after it. */
		function afterPaint(fn) {
			if (!window.requestAnimationFrame) {
				fn();
				return;
			}
			window.requestAnimationFrame(function () {
				window.requestAnimationFrame(fn);
			});
		}

		/* ====================================================================
       THE ENTRY POINT

       Every refusal calls apply() itself. A mode that silently did nothing
       would leave the toggle dead, which is worse than having no effect at
       all — so there is no path through here that returns without the theme
       having changed.
       ==================================================================== */

		function play(next, apply, mode) {
			if (!mode || reduceMotion.matches) {
				apply(next);
				return;
			}

			/* A turn already running is not restarted. The click waits for it
         instead of being applied underneath it.

         Applying it straight away was the earlier behaviour, and the reasoning
         was that the page is only ever a photograph by then so nothing tears.
         It is a photograph, and that is precisely the problem: the snapshot
         stops matching the page the moment the theme under it changes, so the
         visitor sees the effect they asked for turn into a plain flip. Waiting
         costs the wait and keeps the effect. */
			if (busy) {
				/* Unless it is asking for what the turn in flight is already
           going to do, which is a real case and not a hypothetical: the
           shatter does not change the theme until its capture has decoded, so
           a second click in that window reads the theme that is still on
           screen and asks for the one already on its way. Queueing it would
           play a whole second effect over a page that never changes. */
				if (target === next) return;
				pending = { next: next, apply: apply, mode: mode };
				return;
			}

			target = next;

			if (mode === "shatter") {
				shatter(next, apply);
				return;
			}

			if (!document.startViewTransition) {
				apply(next);
				return;
			}

			browserTurn(next, apply, mode);
		}

		/* The turn is over. Whatever was clicked while it ran goes now, through
       the same entry point a click uses — so it is the same effect, chosen the
       same way, with nothing about it special-cased for having waited.

       One slot, not a queue: two clicks during a turn leave the theme where the
       first one put it and ask for the one before it, which is what two clicks
       on a two-state toggle mean. They play as two turns rather than being
       folded into none, because a fold would have to guess whether the visitor
       wanted the effect or the theme, and the theme is the thing they already
       have. */
		function idle() {
			busy = false;
			target = null;
			if (!pending) return;
			var p = pending;
			pending = null;
			play(p.next, p.apply, p.mode);
		}

		/* ====================================================================
       THE BROWSER TURNS — fall and bloom

       Both of these are view transitions over the real page rather than
       anything built here: the browser snapshots what is on screen, this file
       changes the theme, and the snapshot is animated by CSS. That is why
       there is so little to them, and why neither can fail the way the
       shatter can — there is no texture to decode and no geometry to get
       wrong.

       `data-turn` carries the effect's own name. It has no visual effect of
       its own beyond selecting which pseudo-element rules in motion.css §18
       apply, and it is cleared once the transition's finished promise settles,
       so nothing there matches outside a turn. It used to be a bare flag,
       which was honest while there was one effect and is not now.

       The fall and the bloom differ in which snapshot moves. The fall moves
       the OLD one — the sheet is the page that is leaving — and the bloom
       moves the NEW one, clipped to a growing circle, over the old one
       standing still. So one pins to the language toggle and the other to the
       theme toggle, and the stylesheet has to know which is which.
       ==================================================================== */

		/* Where a button is, in viewport pixels, so an effect can be pinned to
       one. Both effects that hand the page to the browser hang off a button —
       the sheet off the language toggle, the circle off the theme toggle —
       and both want its centre, with the same fallback if it is not there.

       Viewport pixels rather than page pixels because both effects are drawn
       on ::view-transition pseudo-elements, and those cover the viewport with
       their corner on its corner. A rect is already in that space. */
		function pinTo(id) {
			var el = document.getElementById(id);
			var r = el ? el.getBoundingClientRect() : null;
			return {
				x: r && r.width ? r.left + r.width / 2 : window.innerWidth / 2,
				y: r && r.height ? r.top + r.height / 2 : 0
			};
		}

		/* Where the sheet is pinned, and how it leaves.

       None of this can be written down in the stylesheet, because the pin is
       wherever the language toggle happens to be and the angle is drawn fresh
       each time, so it is measured at the moment of the turn and handed over
       as custom properties. They are set on <html> rather than on the
       pseudo-element because that is the only way in: the falling sheet IS
       ::view-transition-old(root), and a pseudo-element takes no inline
       style. Custom properties inherit, so the rules in motion.css read them
       back off the root.

       The travel distance is computed rather than declared for the same
       reason the old one was `105vh + 25vw` by hand. Rotating about a corner
       lifts the far corner by roughly the width times the sine of the angle,
       and the sheet has to cover that as well as the viewport or the corner
       is still on screen when the animation ends — where animation-fill-mode
       freezes it until this file clears it. Four corners, four sines, once
       per turn, and it comes out with the same margin on every screen rather
       than only on the one it was measured on. */
		function pinSheet() {
			var p = pinTo("langToggle");
			var px = p.x;
			var py = p.y;

			/* The sign is the whole of why one turn differs from the next, and
         either way is as likely as the other. Math.random rather than the
         seeded generator the fracture uses: a break is worth being able to
         reproduce, and this is worth never being the same twice. */
			var tilt = (Math.random() * 2 - 1) * TILT_MAX;
			var turn = (tilt < 0 ? -1 : 1) *
				(TURN_MIN + Math.random() * (TURN_MAX - TURN_MIN));

			/* The four corners of the frame as offsets from the pin, turned
         through the final angle, to find the highest point the sheet ever
         reaches. That is the point the travel has to carry off the bottom. */
			var a = (tilt + turn) * Math.PI / 180;
			var sn = Math.sin(a);
			var cs = Math.cos(a);
			var W = window.innerWidth;
			var H = window.innerHeight;
			var top = Infinity;
			var i, j;
			for (i = 0; i < 2; i++) {
				for (j = 0; j < 2; j++) {
					var y = py + (i ? W - px : -px) * sn + (j ? H - py : -py) * cs;
					if (y < top) top = y;
				}
			}

			var s = root.style;
			s.setProperty("--pt-pin-x", px.toFixed(1) + "px");
			s.setProperty("--pt-pin-y", py.toFixed(1) + "px");
			s.setProperty("--pt-tilt", tilt.toFixed(2) + "deg");
			s.setProperty("--pt-turn", turn.toFixed(2) + "deg");
			s.setProperty("--pt-drop", Math.round(H - top + PIN_CLEAR) + "px");
		}

		/* Where the circle opens from, and how far it has to grow.

       The pin is the theme toggle — the button that was just pressed — so the
       new theme opens out of the thing the eye is already on rather than out
       of the middle of the screen.

       The radius is the distance to the furthest corner, and it has nothing
       to guess at. Anything short of it leaves a corner still showing the old
       theme when the animation ends, and animation-fill-mode freezes the
       transition there until this file clears it. Because the corners differ
       from the pin independently in x and y, the furthest one is simply the
       larger x offset and the larger y offset taken together. */
		function pinCircle() {
			var p = pinTo("themeToggle");
			var W = window.innerWidth;
			var H = window.innerHeight;
			var dx = Math.max(p.x, W - p.x);
			var dy = Math.max(p.y, H - p.y);

			var s = root.style;
			s.setProperty("--pt-pin-x", p.x.toFixed(1) + "px");
			s.setProperty("--pt-pin-y", p.y.toFixed(1) + "px");
			s.setProperty("--pt-radius", Math.ceil(Math.sqrt(dx * dx + dy * dy)) + "px");
		}

		/* The two effects the browser runs, which are the same shape: measure
       whatever the stylesheet cannot know, flag the turn with its own name,
       change the theme inside a view transition, and take the flag off again
       once it settles.

       `kind` is both the value of data-turn — which is what picks the
       pseudo-element rules in motion.css — and the name of the duration
       token, so adding an effect is a keyframe block, a token, and a name
       here. The geometry is the only part that differs, and each effect
       measures its own: the sheet needs a pin and an angle, the circle a pin
       and a radius. */
		function browserTurn(next, apply, kind) {
			busy = true;

			if (kind === "bloom") pinCircle();
			else pinSheet();

			root.setAttribute("data-turn", kind);
			flushLayout();

			var done = false;
			var timer = null;

			function finish() {
				if (done) return;
				done = true;
				clearTimeout(timer);
				root.removeAttribute("data-turn");
				idle();
			}

			var vt;
			try {
				vt = document.startViewTransition(function () {
					apply(next);
				});
			} catch (e) {
				/* The API exists but refused. Change the theme the plain way and
           clean up, rather than leaving data-turn on <html> forever — and in
           that order, because finish() is what drains a click that arrived
           while this was starting, and that click should find the theme this
           turn was for already applied. */
				apply(next);
				finish();
				return;
			}

			/* `finished` is the real signal and normally arrives first. The
         timer is the backstop for a transition that never settles, which
         would otherwise strand both the attribute and the busy flag. */
			timer = setTimeout(finish,
				durationMs(kind === "bloom" ? "--pt-bloom" : "--pt-fall", 780) + SLACK_MS);
			if (vt && vt.finished && vt.finished.then) {
				vt.finished.then(finish, finish);
			}
		}

		/* ====================================================================
       SHATTER

       Two beats, and the timing of both lives in the keyframes at motion.css
       §18 — this file decides how long the whole thing runs for and nothing
       else about it. First the break: the pieces are thrown outward and turn
       as they go. Then, the gap in --pt-gap later, the fall.

       The gap is a real pause between two motions rather than a stop inside
       one, which is what it used to be — the throw and the fall were two stops
       of a single animation, and a bezier that ends at its own endpoint ends
       at zero velocity, so the pieces decelerated to a standstill and set off
       again. They are two animations on two properties now; the note over the
       keyframes has the rest.

       The crack goes up before the capture starts rather than after it. That
       is not decoration. The capture's first half is synchronous work on the
       main thread — a clone of the whole document and its serialisation — so
       anything drawn in the same frame does not reach the screen until it is
       over. Two frames of grace is what puts the crack up first, which is both
       the right order for glass and the whole of what covers the wait.
       ==================================================================== */

		function shatter(next, apply) {
			busy = true;

			var W = window.innerWidth;
			var H = window.innerHeight;
			var impact = impactPoint(W, H);
			var fx = fracture(impact.x, impact.y, W, H);

			var crack = crackCanvas(fx, W, H);
			document.body.appendChild(crack);
			layers = [crack];
			flushLayout();
			crack.classList.add("is-in");

			var settled = false;
			var timer = null;

			function downgrade() {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				clear();

				/* The capture is the risky half — the browser can refuse to
           decode the SVG, or take longer over it than anyone will wait.
           Rather than show nothing, fall through to the effect that cannot
           fail this way because it never builds a texture. */
				if (document.startViewTransition) browserTurn(next, apply, "fall");
				else apply(next);
			}

			timer = setTimeout(downgrade, CAPTURE_TIMEOUT_MS);

			afterPaint(function () {
				capture(function (canvas) {
					if (settled) return;
					if (!canvas) {
						downgrade();
						return;
					}

					var done = function (url) {
						if (settled) return;
						if (!url) {
							downgrade();
							return;
						}
						settled = true;
						clearTimeout(timer);
						bitmapUrl = url;

						mount(url, fx, W, H, impact);

						/* Attached before the theme changes, so there is never a
               frame showing the new theme uncovered. */
						apply(next);
						flushLayout();
						crack.classList.remove("is-in");

						/* Armed from here rather than from the click. The pieces are
               already in the document and their animation starts on the
               next style recalculation, which is before a frame is out, so
               the two are the same length to within the slack this already
               carries.

               idle() after clear() and not inside it: the other caller of
               clear() is the downgrade, which puts a fall straight on top of
               what it has just swept up. Draining there would start a second
               turn underneath that one. */
						clearTimeout(endTimer);
						endTimer = setTimeout(function () {
							clear();
							idle();
						}, shatterMs() + SHATTER_TAIL_MS);
					};

					/* An object URL rather than a data: URI. Encoding a full
             screenful to base64 is tens of milliseconds of string work on
             the main thread; handing the canvas to the browser as a blob is
             not, and sixty-six elements pointing at one object URL decode it
             once. */
					if (!canvas.toBlob || !window.URL || !window.URL.createObjectURL) {
						done(canvas.toDataURL("image/png"));
						return;
					}
					canvas.toBlob(function (blob) {
						done(blob ? window.URL.createObjectURL(blob) : null);
					}, "image/png");
				});
			});
		}

		/* ====================================================================
       WHERE THE GLASS BREAKS

       At the theme toggle, because that is the thing that was just clicked and
       so where the eye already is. A break at the point of the click is the
       difference between an effect that happened to the page and one that
       happened to the thing you touched.

       Falls back to a little above centre, which is where the eye lands on a
       page it has not read yet.
       ==================================================================== */

		function impactPoint(W, H) {
			var t = document.getElementById("themeToggle");
			if (t) {
				var r = t.getBoundingClientRect();
				if (r.width && r.height) {
					return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
				}
			}
			return { x: W / 2, y: H * 0.42 };
		}

		/* ====================================================================
       THE FRACTURE

       Radial cracks plus conchoidal rings, which is how a pane actually
       breaks: a small crushed crater at the impact, then spokes running out
       and rings stepping across them, with the pieces growing as they go.

       The angles and radii are computed ONCE and shared by the two cells that
       meet at each — jittering per cell instead would leave the network with
       gaps in it, and the crack lines drawn on the canvas come from these same
       arrays.

       The generator is seeded rather than Math.random, so that a break which
       looks wrong can be replayed. The seed is not exposed anywhere; it is
       here so that one is possible.
       ==================================================================== */

		function rng(seed) {
			var s = seed >>> 0;
			return function () {
				s = (s * 1664525 + 1013904223) >>> 0;
				return s / 4294967296;
			};
		}

		function fracture(cx, cy, W, H) {
			var rnd = rng((Date.now() ^ 0x9e3779b9) >>> 0);
			var step = (Math.PI * 2) / RAYS;
			var outX = Math.max(cx, W - cx);
			var outY = Math.max(cy, H - cy);
			var reach = Math.sqrt(outX * outX + outY * outY) * 1.06;

			var ang = [];
			var rad = [];
			var i, j;

			for (j = 0; j < RAYS; j++) ang[j] = j * step + (rnd() - 0.5) * step * 0.5;

			for (i = 0; i <= RINGS; i++) {
				rad[i] = [];
				for (j = 0; j < RAYS; j++) {
					/* Rings grow faster than linearly. An even ramp gives the
             middle of the pane a band of near-identical pieces, and glass
             does not have one. */
					rad[i][j] =
						i === 0
							? 0
							: reach * Math.pow(i / RINGS, 1.6) * (0.86 + rnd() * 0.28);
				}
			}

			/* j runs to RAYS inclusive so the last cell closes on the first
         spoke. Both indices wrap rather than being stored twice, which is
         what keeps the seam at the top of the circle from opening. */
			function at(ring, spoke) {
				var a = ang[spoke % RAYS] + Math.floor(spoke / RAYS) * Math.PI * 2;
				var r = rad[ring][spoke % RAYS];
				return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
			}

			var cells = [];
			var lines = [];

			for (i = 0; i < RINGS; i++) {
				for (j = 0; j < RAYS; j++) {
					var inner0 = at(i, j);
					var inner1 = at(i, j + 1);
					var outer1 = at(i + 1, j + 1);
					var outer0 = at(i + 1, j);

					/* The innermost ring is a point, so its cells come out as
             triangles rather than as quads with two coincident corners.
             Every piece has to move, so every piece spins — including the
             ones with almost no area to see it in. */
					cells.push({
						poly: i === 0 ? [inner1, outer1, outer0] : [inner0, inner1, outer1, outer0],
						spin: (rnd() * 2 - 1) * SPIN_MAX,
						lag: Math.round(rnd() * LAG_MAX)
					});
				}
			}

			for (i = 1; i <= RINGS; i++) {
				var ringLine = [];
				for (j = 0; j <= RAYS; j++) ringLine.push(at(i, j));
				lines.push(ringLine);
			}
			for (j = 0; j < RAYS; j++) {
				var spokeLine = [];
				for (i = 0; i <= RINGS; i++) spokeLine.push(at(i, j));
				lines.push(spokeLine);
			}

			return { cells: cells, lines: lines };
		}

		/* ====================================================================
       THE CRACK

       Drawn once and then left alone: the canvas is faded by CSS rather than
       by redrawing it, so this costs one paint however long the effect runs,
       where animating it here would cost one per frame for a second and a
       half.

       Every line is drawn twice — a wide bright one under a narrow dark one.
       A single colour cannot work, because the page under it is light in one
       direction and dark in the other, and whichever colour is picked vanishes
       on one of them. Real glass reads this way too: a lit edge with a shadow
       beside it.
       ==================================================================== */

		function crackCanvas(fx, W, H) {
			var dpr = Math.min(window.devicePixelRatio || 1, 2);
			var c = document.createElement("canvas");
			c.className = "pt-crack";
			c.width = Math.round(W * dpr);
			c.height = Math.round(H * dpr);
			c.style.width = W + "px";
			c.style.height = H + "px";

			var g = c.getContext("2d");
			g.setTransform(dpr, 0, 0, dpr, 0, 0);
			g.lineCap = "round";
			g.lineJoin = "round";

			var passes = [
				{ w: 3.2, c: "rgba(255, 255, 255, 0.5)" },
				{ w: 1.1, c: "rgba(8, 15, 30, 0.55)" }
			];

			for (var p = 0; p < passes.length; p++) {
				g.strokeStyle = passes[p].c;
				g.lineWidth = passes[p].w;
				for (var i = 0; i < fx.lines.length; i++) {
					var line = fx.lines[i];
					g.beginPath();
					for (var j = 0; j < line.length; j++) {
						if (j) g.lineTo(line[j][0], line[j][1]);
						else g.moveTo(line[j][0], line[j][1]);
					}
					g.stroke();
				}
			}
			return c;
		}

		/* ====================================================================
       THE PIECES

       One absolutely positioned layer per cell, each showing its own corner of
       the captured page and clipped to its own polygon.

       Sized to the polygon's bounding box rather than to the viewport, with
       the bitmap positioned so the right part of it falls inside. Sixty-six
       full-screen layers would be sixty-six screens' worth of texture; this
       way the total is about one screen plus the overlaps, and a piece near
       the edge costs a fraction of what a piece in the middle does.
       ==================================================================== */

		/* Sutherland–Hodgman against one half-plane, then against four of them.
       Worth the twenty lines: without it the outer cells carry their
       off-screen area into a bounding box that can be several times the
       viewport, and those are exactly the cells there are most of. */
		function clipHalf(poly, axis, edge, keepAbove) {
			var out = [];
			for (var i = 0; i < poly.length; i++) {
				var a = poly[i];
				var b = poly[(i + 1) % poly.length];
				var da = keepAbove ? a[axis] - edge : edge - a[axis];
				var db = keepAbove ? b[axis] - edge : edge - b[axis];

				if (da >= 0) out.push(a);
				if ((da >= 0) !== (db >= 0)) {
					/* Both coordinates are interpolated, not just the one being
             clipped against. Writing only that one leaves the crossing point
             at the start vertex's other coordinate, which tears the polygon
             open along every edge it crosses — the cells come back the wrong
             shape rather than merely the wrong size, and the ones it leaves
             degenerate are dropped without a word. */
					var t = da / (da - db);
					out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
				}
			}
			return out;
		}

		function clipToView(poly, W, H) {
			var p = clipHalf(poly, 0, 0, true);
			if (p.length < 3) return p;
			p = clipHalf(p, 0, W, false);
			if (p.length < 3) return p;
			p = clipHalf(p, 1, 0, true);
			if (p.length < 3) return p;
			return clipHalf(p, 1, H, false);
		}

		/* Every vertex pushed away from the polygon's centre by half a pixel.
       Not a true offset — on the slivers near the impact it over-extends along
       the short axis — but the amount is half a pixel and the job is only to
       close the seams between neighbours, which is where the eye would
       otherwise see the pane as tiled rather than broken. */
		function inflate(poly, by) {
			var cx = 0;
			var cy = 0;
			var i;

			for (i = 0; i < poly.length; i++) {
				cx += poly[i][0];
				cy += poly[i][1];
			}
			cx /= poly.length;
			cy /= poly.length;

			var out = [];
			for (i = 0; i < poly.length; i++) {
				var dx = poly[i][0] - cx;
				var dy = poly[i][1] - cy;
				var d = Math.sqrt(dx * dx + dy * dy);
				if (d < 0.001) out.push([poly[i][0], poly[i][1]]);
				else out.push([poly[i][0] + (dx / d) * by, poly[i][1] + (dy / d) * by]);
			}
			return out;
		}

		function mount(url, fx, W, H, impact) {
			var frag = document.createDocumentFragment();

			for (var i = 0; i < fx.cells.length; i++) {
				var el = piece(url, fx.cells[i], W, H, impact);
				if (el) {
					layers.push(el);
					frag.appendChild(el);
				}
			}

			document.body.appendChild(frag);
		}

		function piece(url, cell, W, H, impact) {
			var p = clipToView(cell.poly, W, H);
			if (p.length < 3) return null;
			p = inflate(p, 0.5);

			var x0 = Infinity;
			var y0 = Infinity;
			var x1 = -Infinity;
			var y1 = -Infinity;
			var i;

			for (i = 0; i < p.length; i++) {
				if (p[i][0] < x0) x0 = p[i][0];
				if (p[i][1] < y0) y0 = p[i][1];
				if (p[i][0] > x1) x1 = p[i][0];
				if (p[i][1] > y1) y1 = p[i][1];
			}

			var w = x1 - x0;
			var h = y1 - y0;
			if (w < 1 || h < 1) return null;

			var el = document.createElement("div");
			el.className = "pt-shard";
			el.style.left = x0 + "px";
			el.style.top = y0 + "px";
			el.style.width = w + "px";
			el.style.height = h + "px";
			el.style.backgroundImage = "url(" + url + ")";
			el.style.backgroundSize = W + "px " + H + "px";
			el.style.backgroundPosition = -x0 + "px " + -y0 + "px";

			var pts = [];
			for (i = 0; i < p.length; i++) {
				pts.push((p[i][0] - x0).toFixed(2) + "px " + (p[i][1] - y0).toFixed(2) + "px");
			}
			el.style.clipPath = "polygon(" + pts.join(",") + ")";

			/* Where this piece goes. The push is radial, away from the impact,
         so the pane opens outward from the point that was struck.

         The fall is one distance for every piece, set in the stylesheet, for
         the same reason real pieces all fall at the same rate: varying it
         would give the low ones a different speed from the high ones, and the
         eye reads that as the sheet coming apart rather than as gravity. The
         pieces nearest the bottom simply leave first. */
			var mx = (x0 + x1) / 2;
			var my = (y0 + y1) / 2;
			var dx = mx - impact.x;
			var dy = my - impact.y;
			var d = Math.sqrt(dx * dx + dy * dy) || 1;
			var push =
				SCATTER_MIN +
				(SCATTER_MAX - SCATTER_MIN) * Math.min(1, Math.sqrt(d / 700));

			el.style.setProperty("--sx", ((dx / d) * push).toFixed(2) + "px");
			el.style.setProperty("--sy", ((dy / d) * push).toFixed(2) + "px");
			el.style.setProperty("--sr", cell.spin.toFixed(2) + "deg");
			el.style.setProperty("--lag", cell.lag + "ms");
			return el;
		}

		/* ====================================================================
       CLEANUP

       Everything the shatter put on the page, off it again. Called either when
       the effect has run its length or when the capture gave up, and safe to
       call twice.
       ==================================================================== */

		function clear() {
			if (endTimer) {
				clearTimeout(endTimer);
				endTimer = null;
			}
			for (var i = 0; i < layers.length; i++) {
				if (layers[i].parentNode) layers[i].parentNode.removeChild(layers[i]);
			}
			layers = [];

			if (bitmapUrl) {
				window.URL.revokeObjectURL(bitmapUrl);
				bitmapUrl = null;
			}
			busy = false;
		}

		/* ====================================================================
       THE CAPTURE

       Turns the live page into a bitmap by hand. Three things about THIS page
       broke the obvious version of this, and each one failed differently:

         1. The markup's comments name CSS custom properties --pypi-page,
            --sans. A double hyphen is illegal inside an XML comment, so
            XMLSerializer emitted them verbatim, the SVG would not parse, and
            an <img> reported that as a bare error with no line number at all.

         2. A foreignObject establishes the initial containing block for what
            is inside it, and that block is what clips and what sizes `vh`.
            Moving the BOX to reach the part of the page that is scrolled into
            view does not work — the offset renders as nothing at all and the
            capture comes back showing the top of the document. The clone is
            moved inside it instead; see the note there.

         3. position:fixed and position:sticky do not survive the clone —
            the clone is not scrolled, so they render at the top of the
            document rather than where they are on screen. Each is rewritten
            to the position that puts it where it was. They are not rewritten
            to the same one; see the loop.

       One viewport, not the whole document. The version before this one sized
       the foreignObject to the full page height and then cropped the result to
       a single screenful, which meant rendering several thousand pixels of
       markup to throw nearly all of them away. Offset by -scrollY, the box
       lands on exactly the part that is kept — and a ceiling on document
       height stops being needed at all, since the document's height is no
       longer what is being drawn.

       Hands back a canvas, or null if any of it does not work out.
       ==================================================================== */

		/* The first colour written in a gradient, for the flat fallback the
       clone needs. Read off the computed `background-image` string, which is
       the only place the stops exist once the stylesheet has been resolved:
       `linear-gradient(115deg, rgb(79, 70, 229), rgb(...))`.

       Returns "" rather than a guess when there is nothing to find. The
       caller falls back to the element's own colour, which for a clipped
       element is transparent — the same nothing it would have drawn anyway. */
		function firstColor(bg) {
			var m = /rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}/.exec(bg || "");
			return m ? m[0] : "";
		}

		function capture(done) {
			if (!window.XMLSerializer || !window.Image) {
				done(null);
				return;
			}

			var W = window.innerWidth;
			var H = window.innerHeight;
			var sx = window.pageXOffset;
			var sy = window.pageYOffset;

			if (W < 2 || H < 2) {
				done(null);
				return;
			}

			var clone = root.cloneNode(true);

			/* Whatever theme the page is in, the sheet is too — it is the page
         as it stands, which is the thing about to leave. Forcing light here
         the way the old turn did would turn the dark page toward the light
         one and land on the wrong colour.

         The <svg> carries it as well because the SVG element is :root of the
         document the image is loaded as, and the <html> inside the
         foreignObject is not — so every `:root` rule in the stylesheet, which
         is most of the palette, reads its value off that element. */
			var theme = root.getAttribute("data-theme");
			if (theme) {
				clone.style.colorScheme = theme;
			}

			/* Both trees are the same shape at this point — nothing has been
         removed yet — so index i means the same element on each side.

         The live side is root.querySelectorAll, not document's: document
         includes <html> itself while an element's own querySelectorAll
         cannot, which shifts the whole walk by one and quietly writes the
         right positions onto the wrong elements. */
			var live = root.querySelectorAll("*");
			var copy = clone.querySelectorAll("*");
			var n = Math.min(live.length, copy.length);
			var i, node, cs, rect, pos;

			for (i = 0; i < n; i++) {
				cs = getComputedStyle(live[i]);
				pos = cs.position;
				node = copy[i];

				/* Two things the page draws with a compositor layer do not
         survive being rasterised as an SVG image, and both fail by
         painting nothing at all rather than by painting badly.

         `will-change` is the orbs. It promotes them to their own layer,
         the layer is not composited on this path, and the three ambient
         blobs — a wash worth about twelve levels of brightness across
         most of the page — come back as flat background. The keyframes
         are frozen onto the clone at the same time: an <img> runs no CSS
         animations, so without this every animated element would snap
         back to its un-animated position and the sheet would show a
         frame the page was never on.

         The transform is written only for elements the position pass
         below does not handle. That pass takes left and top from a
         bounding rect, which already includes the transform, so setting
         both would apply the offset twice. */
				if (cs.willChange !== "auto") node.style.willChange = "auto";

				/* `backdrop-filter` is deliberately NOT cleared, and that is a
           correction rather than an omission. It was cleared on the theory
           that the header's disappearance was the fourth compositor-layer
           failure; it was not, the sticky branch below was, and clearing it
           turned out to cost something real.

           The header's background is `color-mix(--bg 86%, transparent)`, so
           a fourteenth of what is behind it shows through. Live, the
           backdrop-filter blurs that fourteenth into a wash. With the filter
           cleared, the clone shows the same fourteenth at full sharpness —
           the project copy reads crisply through the header, which is
           visible in a difference against the page and was measured as most
           of the header band's loss. The blur is part of what the page looks
           like, so the clone keeps it. */

				/* And `z-index: -1` is the other half of the orbs.

           Negative z-index has its own layer, above the page background and
           below the content, and on the page that layer is real. Inside the
           foreignObject it is not: `.backdrop` came back painted behind the
           background rather than in front of it, which is to say invisible.
           The ambient wash is the only thing on the page that uses one, and
           losing it left the pieces flat where the page has a glow.

           Zero rather than auto: the element is first in the document, so
           zero still puts it behind everything that follows it, which is the
           order the negative index existed to guarantee. */
				if (cs.zIndex !== "auto" && parseFloat(cs.zIndex) < 0) node.style.zIndex = "0";
				if (cs.animationName !== "none") {
					node.style.animation = "none";
					if (pos !== "fixed" && pos !== "sticky") node.style.transform = cs.transform;
				}

				/* `background-clip: text` is the gradient in the name. The
           rasteriser clips the background away to the glyphs and then
           does not paint it, so with `color: transparent` on top the
           word renders as nothing — "Hi, I'm" with a gap after it.

           The gradient is replaced by its first stop rather than by a
           token, so the clone keeps the element's own colour. Clearing
           the background makes this correct whichever way the rasteriser
           treats the clip: with nothing to clip there is nothing to
           lose. */
				if (cs.webkitBackgroundClip === "text" || cs.backgroundClip === "text") {
					node.style.backgroundImage = "none";
					node.style.color = firstColor(cs.backgroundImage) || cs.color;
				}

				if (pos !== "fixed" && pos !== "sticky") continue;

				rect = live[i].getBoundingClientRect();

				if (pos === "sticky") {
					/* Sticky is still in flow, and it is the one position that can
             be left to lay itself out. Which is now what it does.

             Rewriting a sticky element to absolute — which is right for
             fixed, and was what this did for both — takes it out of flow, so
             everything after it moves up by its own height. On this page
             that is the header: the whole captured document came back about
             sixty pixels higher than the page, every element doubled in the
             difference image, and nothing about the capture reported an
             error. So it cannot be absolute.

             It cannot be relative either, and that is what took the scrolled
             capture apart. Relative needs the distance from the element's
             FLOW position to its rendered one, and offsetTop cannot supply
             the flow position for a sticky element: sticky moves the box,
             and offsetTop reports the box where it ended up. Scrolled to
             1400 on this page the header reports offsetTop 1400, not the 0
             its flow box sits at, so the subtraction cancelled to zero and
             the header was placed at its flow position while the root was
             shifted by -sy — 1400px above the canvas, invisible, and its
             space still held open. At scroll 0 the same arithmetic gives 0
             and is accidentally right, which is why every unscrolled
             capture looked fine and this went unnoticed.

             Sticky needs no measurement at all. Raising its threshold by the
             scroll offset is the entire edit, and it is exact rather than
             close. With nothing scrolled a top-sticky element renders at
             max(threshold, flow position), so a threshold of top + sy puts
             it at max(top + sy, flow), and the clone's own -sy shift brings
             that to max(top, flow - sy) — which is where sticky had it on
             the page. Stuck or not, one expression, no branches, no
             offsetParent walk.

             The threshold is read from the computed style because the one
             that matters is the one in force, and that may have arrived from
             a token, a media query or a shorthand an inline style cannot see.
             `auto` means the element never sticks on this axis and is already
             correct untouched. */
					if (cs.top !== "auto") node.style.top = parseFloat(cs.top) + sy + "px";
					continue;
				}

				node.style.position = "absolute";
				node.style.left = rect.left + sx + "px";
				node.style.top = rect.top + sy + "px";
				node.style.width = rect.width + "px";
				node.style.height = rect.height + "px";
				node.style.right = "auto";
				node.style.bottom = "auto";
				node.style.margin = "0";
			}

			/* Scripts cannot run in a foreignObject and would not be wanted if
         they could; the <link> elements would try to fetch and fail. The
         overlays go too — a shatter that caught itself mid-flight would
         photograph its own pieces. */
			each(clone.querySelectorAll("script, link, iframe, noscript, .pt-shard, .pt-crack"), function (el) {
				el.parentNode.removeChild(el);
			});

			/* Comments are collected first and removed after. Removing during a
         TreeWalker's own traversal makes it skip nodes. */
			var walker = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT);
			var comments = [];
			while (walker.nextNode()) comments.push(walker.currentNode);
			comments.forEach(function (c) {
				c.parentNode.removeChild(c);
			});

			var style = document.createElement("style");
			style.textContent = collectCss() + (fontCss || "");
			clone.querySelector("head").appendChild(style);

			/* The clone is moved up to meet the viewport, rather than the
         foreignObject being moved down to meet the clone.

         The obvious version puts the offset on the foreignObject's own y —
         y="-1400" and a viewport-tall box below it. It renders, it reports no
         error, and it draws the top of the document: the offset is silently
         ignored, and the only symptom is that the pieces show the wrong part
         of the page. Offsetting the content instead costs one line and puts
         no negative coordinate anywhere in the SVG.

         `top` is a document coordinate and the clone is the document, so
         everything inside it — including the fixed elements rewritten to
         absolute above — keeps the coordinates it already had. */
			clone.style.position = "absolute";
			clone.style.top = -sy + "px";
			clone.style.left = "0";
			clone.style.width = "100%";

			var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
			svg.setAttribute("width", W);
			svg.setAttribute("height", H);
			if (theme) {
				svg.setAttribute("data-theme", theme);
				svg.setAttribute("style", "color-scheme: " + theme);
			}

			var fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
			fo.setAttribute("x", 0);
			fo.setAttribute("y", 0);
			fo.setAttribute("width", W);
			fo.setAttribute("height", H);
			fo.appendChild(clone);
			svg.appendChild(fo);

			var markup;
			try {
				markup = new XMLSerializer().serializeToString(svg);
			} catch (e) {
				done(null);
				return;
			}

			var img = new Image();

			img.onload = function () {
				var dpr = Math.min(window.devicePixelRatio || 1, 2);
				var out = document.createElement("canvas");
				out.width = Math.round(W * dpr);
				out.height = Math.round(H * dpr);
				out.getContext("2d").drawImage(img, 0, 0, W, H, 0, 0, out.width, out.height);
				done(out);
			};

			img.onerror = function () {
				done(null);
			};

			/* Handlers first, then src. A data: URI is usually decoded by the
         time the assignment returns, so `complete` would be true and a
         synchronous check would look like it worked — but that is a race
         against the decoder, not a guarantee. The load event arrives as a
         task either way, so this is the one path that is correct at both
         speeds. */
			img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markup);
		}

		/* The page's own CSS, read back off the live stylesheets rather than
       re-fetched. A stylesheet that is cross-origin throws on cssRules — on
       this page that is the Google Fonts sheet, whose rules are replaced by
       the inlined copy below anyway. */
		function collectCss() {
			var out = "";
			var sheets = document.styleSheets;
			for (var i = 0; i < sheets.length; i++) {
				var rules;
				try {
					rules = sheets[i].cssRules;
				} catch (e) {
					continue;
				}
				if (!rules) continue;
				for (var j = 0; j < rules.length; j++) out += rules[j].cssText + "\n";
			}
			return out;
		}

		/* ====================================================================
       FONTS

       An SVG loaded as an <img> cannot fetch anything external, so a font
       left as a URL renders nothing and the sheet falls back to a system
       face. On a page set entirely in Inter that is the difference between
       the sheet matching the page underneath it and not.

       Google's stylesheet is fetched once, the @font-face rules this document
       can actually use are kept, and each woff2 URL inside those is replaced
       with a data: URI. Done on idle, so the first click does not pay for it.
       Failure is silent and survivable: the capture simply uses a system
       face.
       ==================================================================== */

		/* A font file as a data: URI, encoded by the browser rather than here.

       The obvious version — arrayBuffer, then String.fromCharCode over 32KB
       slices, then btoa — is the largest single block this module puts on the
       main thread, and it lands a second or two after load. Handing the Blob
       to FileReader gives the encoding to the browser and returns the data:
       URI already formed. */
		function dataUrl(blob) {
			return new Promise(function (resolve) {
				var reader = new FileReader();
				reader.onload = function () {
					resolve(reader.result);
				};
				reader.onerror = function () {
					resolve(null);
				};
				reader.readAsDataURL(blob);
			});
		}

		/* Whether a @font-face's unicode-range covers anything this document
       actually contains.

       Google writes the range in three forms and all three appear in the
       Inter sheet: a single codepoint (U+0131), a span (U+0100-02BA), and a
       wildcard (U+00??). `seen` holds the document's own characters keyed by
       codepoint, so what is asked here is "could any of this text need this
       file".

       Walking the range rather than the text is the cheap direction: a range
       is a few hundred codepoints at most, the document is tens of thousands
       of characters, and there are 28 of these to test. */
		function rangeCovers(range, seen) {
			var parts = range.split(",");
			for (var i = 0; i < parts.length; i++) {
				var t = parts[i].replace(/^\s*U\+/i, "").replace(/\s+$/, "");
				if (!t) continue;
				var lo, hi;
				if (t.indexOf("?") >= 0) {
					lo = parseInt(t.replace(/\?/g, "0"), 16);
					hi = parseInt(t.replace(/\?/g, "F"), 16);
				} else if (t.indexOf("-") > 0) {
					var ends = t.split("-");
					lo = parseInt(ends[0], 16);
					hi = parseInt(ends[1], 16);
				} else {
					lo = hi = parseInt(t, 16);
				}
				if (isNaN(lo) || isNaN(hi)) continue;
				for (var cp = lo; cp <= hi; cp++) if (seen[cp]) return true;
			}
			return false;
		}

		function warmFonts() {
			if (fontTried) return;
			fontTried = true;

			/* rel="stylesheet" is not decoration. The head also carries a
         <link rel="preconnect" href="https://fonts.googleapis.com">, and it
         comes first — so a bare [href*=] match finds that one, resolves to
         the bare origin, and fetches a URL that was never meant to be
         fetched. It fails as a CORS error from Google's root, which reads
         like Google refusing us rather than like the wrong element. */
			var link = document.querySelector('link[rel="stylesheet"][href*="fonts.googleapis.com"]');
			if (!link || !window.fetch || !window.Promise || !window.FileReader) return;

			fetch(link.href)
				.then(function (r) {
					return r.text();
				})
				.then(function (text) {
					/* Only the subsets this document can render.

             A css2 request is answered with every subset the face has. For
             the four weights asked for here that is 28 @font-face blocks over
             7 files and 213KB — cyrillic, greek and vietnamese among them.
             The page is English and Spanish, both of which sit entirely
             inside latin, so six of those seven were being fetched and
             base64ed to draw nothing.

             That was not only waste. Seven files encoded in one pass is a
             203ms block on the main thread, and it lands a second or two
             after load: measured by stubbing this idle callback out, a
             language switch whose fade had been caught part-way came back a
             clean cut with the callback live, and faded properly with it
             stubbed. Filtering by what the document contains rather than by a
             hardcoded "latin" keeps this right if the page ever gains a
             language — the subsets follow the text. */
					var seen = {};
					var chars = document.documentElement.textContent || "";
					for (var c = 0; c < chars.length; c++) seen[chars.charCodeAt(c)] = 1;

					var blocks = text.match(/@font-face\s*\{[^}]*\}/g) || [];
					var keep = [];
					for (var b = 0; b < blocks.length; b++) {
						var range = /unicode-range:\s*([^;]+)/i.exec(blocks[b]);
						if (!range || rangeCovers(range[1], seen)) keep.push(blocks[b]);
					}
					if (!keep.length) keep = blocks;

					var urls = [];
					for (var k = 0; k < keep.length; k++) {
						var found = /url\((https:\/\/[^)]+)\)/.exec(keep[k]);
						if (found && urls.indexOf(found[1]) < 0) urls.push(found[1]);
					}
					if (!urls.length) return null;

					return Promise.all(
						urls.map(function (u) {
							return fetch(u)
								.then(function (r) {
									return r.blob();
								})
								.then(function (blob) {
									return dataUrl(blob);
								})
								.then(function (uri) {
									return [u, uri];
								});
						})
					).then(function (pairs) {
						/* Rebuilt from the kept blocks, not from the original
               text: a subset that is not inlined is also not wanted, and
               leaving it behind would ship a rule pointing at a URL the
               capture cannot fetch anyway. */
						var out = keep.join("\n");
						pairs.forEach(function (pair) {
							if (pair[1]) out = out.split(pair[0]).join(pair[1]);
						});
						fontCss = out;
					});
				})
				.catch(function () {
					/* No fonts. The capture falls back to a system face, which is
             a worse-looking sheet but a working one. */
				});
		}

		/* ====================================================================
       EXPORT
       ==================================================================== */

		if (window.requestIdleCallback) {
			window.requestIdleCallback(warmFonts);
		} else {
			setTimeout(warmFonts, 1500);
		}

		return {
			play: play,
			/* For the dev panel and for tests, so a mode can be named without
         main.js having to know the list. */
			modes: ["", "fall", "shatter", "bloom"],
			warm: warmFonts
		};
	})();

	window.PAGETURN = PAGETURN;
})();
