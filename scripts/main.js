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
   11  Live figures
   ========================================================================== */

(function () {
  'use strict';

  /* ========================================================================
     1  HELPERS
     ======================================================================== */

  var root = document.documentElement;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
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
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  /* ========================================================================
     2  THEME
     The initial value is set by the inline script in <head> so there is no
     flash of the wrong theme. This only handles the toggle.
     ======================================================================== */

  var themeToggle = $('#themeToggle');

  function currentTheme() {
    var explicit = root.getAttribute('data-theme');
    if (explicit === 'light' || explicit === 'dark') return explicit;
    return window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  /* Only the pressed state is written here. The accessible name is a static
     "Dark theme" held in two language spans in the markup, so the stylesheet
     picks the right one and there is nothing for this function to say about
     language — writing to #themeLabel would destroy those spans. */
  function paintThemeButton() {
    if (!themeToggle) return;
    themeToggle.setAttribute('aria-pressed', String(currentTheme() === 'dark'));
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      root.style.colorScheme = next;
      store('theme', next);
      paintThemeButton();
    });
  }

  /* Follow the OS preference while the visitor has not made an explicit
     choice of their own. */
  if (window.matchMedia) {
    var scheme = window.matchMedia('(prefers-color-scheme: dark)');
    var onSchemeChange = function () {
      if (!root.getAttribute('data-theme')) paintThemeButton();
    };
    if (scheme.addEventListener) scheme.addEventListener('change', onSchemeChange);
    else if (scheme.addListener) scheme.addListener(onSchemeChange);
  }

  /* ========================================================================
     3  LANGUAGE
     Flip <html lang>; the stylesheet does the rest. The button advertises the
     language you would switch TO, and its accessible name spells that out.
     ======================================================================== */

  var langToggle = $('#langToggle');
  var langText = $('#langToggleText');
  var langLabel = $('#langToggleLabel');

  function applyLanguage(lang, announce) {
    root.setAttribute('lang', lang);
    if (langText) langText.textContent = lang === 'en' ? 'ES' : 'EN';
    if (langLabel) {
      langLabel.textContent = lang === 'en' ? 'Cambiar a español' : 'Switch to English';
    }
    if (langToggle) langToggle.setAttribute('lang', lang === 'en' ? 'es' : 'en');

    /* The <title> and meta description are the two pieces of copy the language
       rules cannot reach, so they are swapped here. */
    document.title = lang === 'es'
      ? 'Odell — Desarrollador de software: automatización e integración'
      : 'Odell — Software Developer: Automation & Systems Integration';

    var desc = document.querySelector('meta[name="description"]');
    if (desc) {
      desc.setAttribute('content', lang === 'es'
        ? 'Desarrollador de software autodidacta enfocado en automatización, integración de sistemas e ingeniería inversa. Python, C#, C++. Trabajo seleccionado con cifras verificables.'
        : 'Self-taught software developer working in automation, systems integration and reverse engineering. Python, C#, C++. Selected work with verifiable numbers.');
    }

    /* The CV button follows the page language, so a Spanish reader gets the
       Spanish PDF without having to go looking. Both are offered explicitly
       in the contact section for anyone who wants the other one. */
    var heroCv = $('#heroCv');
    if (heroCv) {
      heroCv.setAttribute('href', lang === 'es' ? 'cv/CV_Odell_ES.pdf' : 'cv/CV_Odell_EN.pdf');
      heroCv.setAttribute('hreflang', lang);
    }

    paintThemeButton();
    /* TERMINAL is declared below with `var`, so on the first call it is still
       undefined. That call passes announce=false. */
    if (announce && TERMINAL) TERMINAL.refresh();
  }

  if (langToggle) {
    langToggle.addEventListener('click', function () {
      var next = root.lang === 'es' ? 'en' : 'es';
      store('lang', next);
      applyLanguage(next, true);
    });
  }

  /* The <head> script has already written the starting value into html[lang]:
     a saved choice if the visitor made one, otherwise the browser's preference,
     otherwise "en". This reads that back rather than deciding again, so the
     detection lives in one place — and so nothing has to be corrected after
     first paint, which is what a flash of the wrong language would look like. */
  applyLanguage(root.getAttribute('lang') === 'es' ? 'es' : 'en', false);

  /* ========================================================================
     4  NAVIGATION
     ======================================================================== */

  var navToggle = $('#navToggle');
  var navList = $('#navList');

  function closeNav() {
    if (!navList || !navToggle) return;
    navList.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
  }

  if (navToggle && navList) {
    navToggle.addEventListener('click', function () {
      var open = navList.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(open));
    });

    /* Any link tap dismisses the panel — otherwise it stays open over the
       section the visitor just asked for. */
    $$('.nav-link', navList).forEach(function (link) {
      link.addEventListener('click', closeNav);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navList.classList.contains('is-open')) {
        closeNav();
        navToggle.focus();
      }
    });

    document.addEventListener('click', function (e) {
      if (!navList.classList.contains('is-open')) return;
      if (navList.contains(e.target) || navToggle.contains(e.target)) return;
      closeNav();
    });

    /* Resizing past the breakpoint leaves the panel in a state the CSS no
       longer styles; reset it so the desktop layout is clean. */
    var wide = window.matchMedia('(min-width: 861px)');
    var onWide = function (e) { if (e.matches) closeNav(); };
    if (wide.addEventListener) wide.addEventListener('change', onWide);
    else if (wide.addListener) wide.addListener(onWide);
  }

  /* ========================================================================
     5  HEADER SCROLL STATE
     ======================================================================== */

  var header = $('.site-header');
  if (header) {
    var ticking = false;
    var syncHeader = function () {
      header.classList.toggle('is-stuck', window.scrollY > 8);
      ticking = false;
    };
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(syncHeader);
    }, { passive: true });
    syncHeader();
  }

  /* ========================================================================
     6  SKILL BARS
     The markup already carries the final width via --level, so the bars are
     correct with no JavaScript. This only collapses and re-grows them for the
     reveal. Under reduced-motion the stylesheet pins them at full width.
     ======================================================================== */

  var skills = $$('.skill');

  if (skills.length) {
    if ('IntersectionObserver' in window && !reduceMotion.matches) {
      var skillObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          skillObserver.unobserve(entry.target);
        });
      }, { threshold: 0.4, rootMargin: '0px 0px -40px 0px' });

      skills.forEach(function (skill) { skillObserver.observe(skill); });
    } else {
      skills.forEach(function (skill) { skill.classList.add('is-visible'); });
    }
  }

  /* ========================================================================
     7  TERMINAL
     A real input with real output. Every answer it gives also exists as a
     section on this page, so nothing is available only through the terminal.
     ======================================================================== */

  var TERMINAL = (function () {
    var screenEl = $('#terminalOut');
    var inputEl = $('#terminalInput');
    if (!screenEl || !inputEl) return { refresh: function () {} };

    var history = [];
    var historyIndex = -1;
    var typing = null;      // { timer, el, text } while a line is animating
    var flushRest = null;   // completes the rest of the welcome, if still running

    function t(en, es) {
      return root.lang === 'es' ? es : en;
    }

    /* Reads whatever figure is on the page right now instead of repeating a
       copy of it here. The cards refresh from the live APIs, so a number
       hardcoded in this file would eventually contradict the page it is
       describing. */
    function stat(id) {
      var el = document.querySelector('.stat[data-stat="' + id + '"]');
      return el ? el.textContent.trim() : '?';
    }

    /* Writes a line of output. `cls` maps to the .t-* colour classes. */
    function line(text, cls) {
      var el = document.createElement('div');
      if (cls) el.className = cls;
      el.textContent = text;
      screenEl.appendChild(el);
      scrollToEnd();
      return el;
    }

    function scrollToEnd() {
      screenEl.scrollTop = screenEl.scrollHeight;
    }

    function blank() { return line(''); }

    /* Types text into a freshly created line, one character per tick. */
    function typeLine(text, cls, done) {
      var el = line('', cls);
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
      screenEl.setAttribute('aria-live', 'polite');
    }

    /* ---- Commands ------------------------------------------------------- */

    var COMMANDS = {
      help: function () {
        blank();
        line(t('Available commands:', 'Comandos disponibles:'), 't-ok');
        blank();
        line('  whoami     ' + t('who I am', 'quién soy'));
        line('  about      ' + t('background', 'trayectoria'));
        line('  skills     ' + t('languages and tools', 'lenguajes y herramientas'));
        line('  projects   ' + t('selected work', 'trabajo seleccionado'));
        line('  contact    ' + t('how to reach me', 'cómo contactarme'));
        line('  theme      ' + t('switch light / dark', 'cambiar claro / oscuro'));
        line('  lang       ' + t('switch English / Spanish', 'cambiar inglés / español'));
        line('  clear      ' + t('clear the screen', 'limpiar la pantalla'));
        blank();
        line(t('  Every answer above also exists as a section on this page.',
               '  Cada respuesta de arriba también existe como sección en esta página.'),
             't-dim');
        blank();
      },

      whoami: function () {
        blank();
        line(t('Odell — self-taught software developer since 2018.',
               'Odell — desarrollador de software autodidacta desde 2018.'), 't-ok');
        line(t('Automation · Systems integration · Reverse engineering',
               'Automatización · Integración de sistemas · Ingeniería inversa'));
        line(t('Python, C#, C++, Kotlin, JavaScript, Java',
               'Python, C#, C++, Kotlin, JavaScript, Java'), 't-dim');
        blank();
      },

      about: function () {
        blank();
        line(t('Most of what I know came from taking apart software that already',
               'La mayor parte de lo que sé vino de desarmar software que ya'));
        line(t('worked and figuring out why. I build tools: things that automate',
               'funcionaba y averiguar por qué. Construyo herramientas: cosas que automatizan'));
        line(t('a process, package a build, or reach data that is not exposed cleanly.',
               'un proceso, empaquetan una build u obtienen datos que no están expuestos limpiamente.'));
        blank();
        line('  → ' + t('see the About section below', 'ver la sección Sobre mí abajo'), 't-dim');
        blank();
      },

      skills: function () {
        blank();
        line(t('Languages', 'Lenguajes'), 't-ok');
        line('  Python     turnstile_solver · image-in-terminal + ' + t('client work', 'trabajo de cliente'));
        line('  C#         custom-gui-sfx · Account Manager');
        line('  Java       ' + t('private client work', 'trabajo privado con clientes'));
        line('  Kotlin     ' + t('private client work', 'trabajo privado con clientes'));
        line('  C / C++    ' + t('private client work', 'trabajo privado con clientes'));
        line('  JavaScript ' + t('private client work', 'trabajo privado con clientes'));
        blank();
        line(t('Platforms', 'Plataformas'), 't-ok');
        line('  .NET 6 / WPF · MVVM · Unity · Android · Jetpack Compose');
        line('  Docker · Docker Compose · Git · GitHub · Linux · PostgreSQL');
        line('  Flask · FastAPI · Django · SQLAlchemy · REST APIs · Quart');
        line('  patchright · Playwright · Selenium · Scrapy · requests');
        line('  NumPy · Pandas · OpenCV · Rich · pytest · PyPI');
        line('  SSH · TLS / HTTPS · ' + t('certificates · WiFi security · proxies', 'certificados · seguridad WiFi · proxies'));
        blank();
        line('  → ' + t('see the Capabilities section below', 'ver la sección Capacidades abajo'), 't-dim');
        blank();
      },

      projects: function () {
        blank();
        line(t('Selected work', 'Trabajo seleccionado'), 't-ok');
        blank();
        line('  1. Account Manager        ' + stat('am-apk') + ' ' + t('downloads', 'descargas') + '  ' + t('(closed source)', '(código cerrado)'));
        line('  2. Custom GUI SFX         ' + stat('cgs-dl') + ' ' + t('downloads', 'descargas'));
        line('  3. Turnstile Solver       ' + stat('ts-stars') + ' ★ · ' + stat('ts-forks') + ' ' + t('forks', 'bifurcaciones'));
        line('  4. image-in-terminal      PyPI v' + stat('iit-ver'));
        line('  5. Workflow automation    ' + t('private', 'privado'));
        blank();
        line('  → ' + t('see the Selected Work section below', 'ver la sección Trabajo seleccionado abajo'), 't-dim');
        blank();
      },

      contact: function () {
        blank();
        line(t('Email is the fastest way to reach me:', 'El correo es la vía más rápida de contactarme:'), 't-ok');
        line('  odellgm11012001@gmail.com', 't-key');
        line('  t.me/odell0111');
        line('  github.com/odell0111');
        line('  linkedin.com/in/odell0111');
        blank();
      },

      theme: function () {
        if (themeToggle) themeToggle.click();
        blank();
        line(t('Theme switched.', 'Tema cambiado.'), 't-dim');
        blank();
      },

      /* The switch itself re-prints the welcome in the new language, so there
         is nothing left to add here. */
      lang: function () {
        if (langToggle) langToggle.click();
      },

      clear: function () {
        screenEl.textContent = '';
      }
    };

    /* ---- Fork bomb ------------------------------------------------------
       Deliberately absent from COMMANDS and from `help`. A hidden command
       that the help text lists is not hidden; this one is meant to be
       recognised by the visitor who already knows it.

       Matched with all whitespace stripped, because the line is written
       several ways in the wild and `:(){ :|: & };:`, `:(){ :|:& };:` and
       `:() { :|: & } ;:` are the same bomb. */
    var FORK_BOMB = ':(){:|:&};:';

    var dead = false;         /* panicked, and not yet rebooted */
    var busy = false;         /* a dump or a boot is still printing */
    var bus = null;           /* timer of the sequence in flight, if any */

    /* The dump is not translated. It is machine output, and a kernel log in
       Spanish would read as a costume. This line is different — it is
       addressed to the visitor, not part of the joke — so it is. */
    function rebootHint() {
      return t("the shell is gone — type 'reboot' to bring it back",
               "el shell está muerto — escribe 'reboot' para recuperarlo");
    }

    /* Runs [delay, class, text] steps in order, each after the one before.
       Under reduced motion the waits collapse: the dump still prints in full,
       it just does not pace itself. */
    function sequence(steps, done) {
      var i = 0;
      (function next() {
        if (i >= steps.length) { bus = null; done(); return; }
        var step = steps[i++];
        bus = window.setTimeout(function () {
          line(step[2], step[1]);
          next();
        }, reduceMotion.matches ? 0 : step[0]);
      })();
    }

    /* Stops a dump or a boot mid-flight, with the state that went with it.
       A language switch during either one would otherwise print the welcome
       underneath output that is still arriving — and, for a dump, mark the
       shell dead a moment later on top of it. Interrupting the panic leaves
       the shell alive, which is the honest reading of what happened. */
    function cancelSequence() {
      if (bus) { window.clearTimeout(bus); bus = null; }
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
      [240, 't-dim', '[    0.902] fork: 2 tasks'],
      [210, 't-dim', '[    0.928] fork: 64 tasks'],
      [180, 't-dim', '[    0.961] fork: 4096 tasks'],
      [140, 't-dim', '[    1.004] fork: 131072 tasks'],
      [110, 't-err', '[    1.061] Out of memory: Killed process 1 (init)'],
      [90,  't-err', '[    1.062] Kernel panic - not syncing: Attempted to kill init!'],
      [70,  't-err', '[    1.062] Hardware name: odell.dev / portfolio'],
      [60,  't-err', '[    1.062] Call Trace:'],
      [50,  't-err', '[    1.062]  panic+0x1b1/0x2f0'],
      [50,  't-err', '[    1.062]  do_exit+0x2e5/0x9f0'],
      [50,  't-err', '[    1.062] ---[ end Kernel panic - not syncing: Attempted to kill init! ]---']
    ];

    var BOOT = [
      [0,   't-dim', 'rebooting...'],
      [280, 't-dim', '[    0.000] odell.dev portfolio shell — cold boot'],
      [230, 't-dim', '[    0.114] mounting /portfolio .......... ok'],
      [200, 't-dim', '[    0.238] restoring session .......... ok'],
      [180, 't-ok',  '[    0.301] init: shell ready']
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
      screenEl.setAttribute('aria-live', 'off');
      blank();

      sequence(PANIC, function () {
        blank();
        screenEl.setAttribute('aria-live', 'polite');
        line(rebootHint(), 't-ok');
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
      screenEl.textContent = '';
      screenEl.setAttribute('aria-live', 'off');
      sequence(BOOT, function () {
        busy = false;
        screenEl.textContent = '';
        welcome();   /* this manages aria-live itself, off then on */
      });
    }

    /* What is on screen while the shell is dead, so that a language switch
       redraws the panic in the new language instead of quietly resurrecting
       the prompt. */
    function deadScreen() {
      blank();
      line('[    1.062] ---[ end Kernel panic - not syncing: Attempted to kill init! ]---', 't-err');
      blank();
      line(rebootHint(), 't-ok');
      blank();
      screenEl.setAttribute('aria-live', 'polite');
    }

    function run(raw) {
      var cmd = raw.trim().toLowerCase();
      if (!cmd || busy) return;

      line('$ ' + raw, 't-dim');

      /* Everything the shell can still be asked to do once it has died. */
      if (dead) {
        if (cmd === 'reboot') { reboot(); return; }
        blank();
        line(t('cannot fork: Resource temporarily unavailable',
               'no se pudo hacer fork: recurso no disponible temporalmente'), 't-err');
        line(rebootHint(), 't-dim');
        blank();
        scrollToEnd();
        return;
      }

      if (cmd.replace(/\s+/g, '') === FORK_BOMB) { forkBomb(); return; }

      if (Object.prototype.hasOwnProperty.call(COMMANDS, cmd)) {
        COMMANDS[cmd]();
      } else {
        blank();
        line(t('command not found: ' + cmd, 'comando no encontrado: ' + cmd), 't-err');
        line(t("type 'help' for the list", "escribe 'help' para ver la lista"), 't-dim');
        blank();
      }
      scrollToEnd();
    }

    /* ---- Wiring --------------------------------------------------------- */

    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var value = inputEl.value;
        if (value.trim()) {
          history.push(value);
          historyIndex = history.length;
        }
        inputEl.value = '';
        run(value);
        return;
      }

      /* Tab is deliberately not intercepted — it moves focus onward like any
         other field. */

      if (e.key === 'ArrowUp') {
        if (!history.length) return;
        e.preventDefault();
        historyIndex = Math.max(0, historyIndex - 1);
        inputEl.value = history[historyIndex] || '';
        return;
      }

      if (e.key === 'ArrowDown') {
        if (!history.length) return;
        e.preventDefault();
        historyIndex = Math.min(history.length, historyIndex + 1);
        inputEl.value = history[historyIndex] || '';
      }
    });

    /* Clicking anywhere in the screen focuses the prompt, the way a real
       terminal behaves — but only on an explicit click, never on load, so the
       page never hijacks the scroll position or steals focus. */
    var screenBox = $('.terminal-screen');
    if (screenBox) {
      screenBox.addEventListener('click', function (e) {
        if (window.getSelection && String(window.getSelection()).length) return;
        if (e.target === inputEl) return;
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
      screenEl.setAttribute('aria-live', 'off');

      var queue = [
        [t('Odell — portfolio shell', 'Odell — shell del portfolio'), 't-ok'],
        [t('Type a command and press Enter. Try: whoami, skills, projects, contact',
           'Escribe un comando y pulsa Enter. Prueba: whoami, skills, projects, contact'), 't-dim'],
        ['', '']
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
          screenEl.setAttribute('aria-live', 'polite');
          screenEl.setAttribute('role', 'log');
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
      screenEl.textContent = '';
      if (dead) { deadScreen(); return; }
      welcome();
    }

    /* If someone starts typing before the intro finishes, get out of the way
       rather than fighting them for the screen. Left attached rather than
       removing itself after the first key: the welcome runs again after a
       language switch and again after a reboot, and each of those needs the
       same escape hatch. */
    inputEl.addEventListener('input', function () {
      if (!typing && !flushRest) return;
      finishTyping();
    });

    welcome();

    return { refresh: refresh };
  })();

  /* ========================================================================
     8  COPY EMAIL
     ======================================================================== */

  var copyBtn = $('#copyEmail');

  if (copyBtn) {
    var resetTimer = null;

    var flashCopied = function () {
      copyBtn.classList.add('is-copied');
      if (resetTimer) window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(function () {
        copyBtn.classList.remove('is-copied');
      }, 2200);
    };

    /* document.execCommand is deprecated, but the async Clipboard API is
       unavailable over plain http and in some embedded browsers, and this is
       a copy button — it has to work everywhere. */
    var legacyCopy = function (text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    };

    copyBtn.addEventListener('click', function () {
      var email = copyBtn.getAttribute('data-email');
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

  var year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ========================================================================
     10  TOAST
     One message, at most, ever. The element ships in the markup rather than
     being created when it is needed: a live region has to be in the document
     before anything is put into it, or the change is never announced.
     ======================================================================== */

  var toast = $('#toast');
  var toastText = $('#toastText');
  var toastClose = $('#toastClose');
  var toastTimer = null;
  var toastSpans = null;

  function hideToast() {
    if (!toast) return;
    if (toastTimer) {
      window.clearTimeout(toastTimer);
      toastTimer = null;
    }
    toast.classList.remove('is-visible');
  }

  function showToast(en, es, holdFor) {
    if (!toast || !toastText) return;

    /* Built once, rewritten after that. Both languages go in together, as
       everywhere else on this page — the stylesheet decides which is read. */
    if (!toastSpans) {
      var enSpan = document.createElement('span');
      enSpan.className = 'lang-en';
      enSpan.lang = 'en';
      var esSpan = document.createElement('span');
      esSpan.className = 'lang-es';
      esSpan.lang = 'es';
      toastText.textContent = '';
      toastText.appendChild(enSpan);
      toastText.appendChild(esSpan);
      toastSpans = [enSpan, esSpan];
    }
    toastSpans[0].textContent = en;
    toastSpans[1].textContent = es;

    toast.classList.add('is-visible');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(hideToast, holdFor || 10000);
  }

  if (toastClose) toastClose.addEventListener('click', hideToast);

  /* Escape dismisses it too, but only while it is actually up — an
     unconditional handler would swallow that key for the whole page. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    if (toast && toast.classList.contains('is-visible')) hideToast();
  });

  /* ========================================================================
     11  LIVE FIGURES
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
     ======================================================================== */

  (function () {
    var els = {};
    $$('.stat').forEach(function (el) {
      var id = el.getAttribute('data-stat');
      if (id) els[id] = el;
    });
    if (!window.fetch || !window.Promise || !Object.keys(els).length) return;

    var GITHUB_API = 'https://api.github.com/repos/odell0111/';
    var TIMEOUT = 8000;       /* ms before a request is abandoned */
    var SHIMMER_DELAY = 700;  /* ms before the skeleton is shown at all */

    var attempted = {};       /* id -> true, a request was made for it */
    var settled = {};         /* id -> true, that request has finished */
    var anyFailed = false;
    var shimmerTimer = null;
    var work = [];

    /* ---- Fetching ------------------------------------------------------- */

    /* The timeout, the abort and the 200-only rule are the same whichever
       shape the body arrives in, so they live here once. */
    function request(url, accept, read) {
      return new Promise(function (resolve, reject) {
        var controller = window.AbortController ? new window.AbortController() : null;
        var opts = { headers: { Accept: accept } };
        if (controller) opts.signal = controller.signal;

        var timer = window.setTimeout(function () {
          if (controller) controller.abort();
          reject(new Error('timed out'));
        }, TIMEOUT);

        window.fetch(url, opts).then(function (res) {
          /* A rate-limited GitHub answers 403 with a well-formed JSON body, so
             reading it anyway is exactly how a wrong number gets on screen.
             Only a 200 counts. */
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return read(res);
        }).then(function (data) {
          window.clearTimeout(timer);
          resolve(data);
        }, function (err) {
          window.clearTimeout(timer);
          reject(err);
        });
      });
    }

    function getJSON(url) {
      return request(url, 'application/json', function (res) { return res.json(); });
    }

    function getText(url, accept) {
      return request(url, accept, function (res) { return res.text(); });
    }

    /* Stars and forks are two fields of one response, so the promise is made
       once and shared. A failed attempt is not kept — a second attempt could
       still succeed, and holding on to the rejection would deny it that. */
    var repoPromise = null;
    function turnstileRepo() {
      if (repoPromise) return repoPromise;
      repoPromise = getJSON(GITHUB_API + 'turnstile_solver');
      repoPromise.then(null, function () { repoPromise = null; });
      return repoPromise;
    }

    /* Summed the same way tools/update-stats.py sums it, so the live figure
       and the baked one mean the same thing. */
    function releaseDownloads(name) {
      return getJSON(GITHUB_API + name + '/releases').then(function (releases) {
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
      if (els[id]) els[id].classList.remove('is-loading');
      if (!ok) anyFailed = true;
    }

    /* Each of these resolves either way, so Promise.all below always runs. */
    function refresh(id, promise, pick) {
      if (!els[id]) return;
      attempted[id] = true;
      work.push(promise.then(function (data) {
        var value = pick(data);
        if (value === undefined || value === null || value === '') {
          settle(id, false);
          return;
        }
        /* data-value is deliberately left alone. It records the figure baked
           into the HTML, which is the one the updater script replaces next
           time it runs; the visible text is what can go stale. */
        els[id].textContent = String(value);
        settle(id, true);
      }, function () {
        settle(id, false);
      }));
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
      return getText('https://static.pepy.tech/badge/image-in-terminal/month',
        'image/svg+xml').then(function (svg) {
        var texts = svg.match(/<text[^>]*>[^<]*<\/text>/g) || [];
        for (var i = 0; i < texts.length; i++) {
          var value = texts[i].replace(/<[^>]*>/g, '').trim();
          if (/^[\d.,]+[kMG]?$/.test(value)) return value;
        }
        throw new Error('no figure in the badge');
      });
    }

    refresh('am-apk', releaseDownloads('account-manager'), function (n) { return n; });
    refresh('cgs-dl', releaseDownloads('custom-gui-sfx'), function (n) { return n; });
    refresh('ts-stars', turnstileRepo(), function (r) { return r.stargazers_count; });
    refresh('ts-forks', turnstileRepo(), function (r) { return r.forks_count; });
    refresh('iit-ver', getJSON('https://pypi.org/pypi/image-in-terminal/json'),
      function (d) { return d.info && d.info.version; });
    refresh('iit-dl', pepyMonthly(), function (v) { return v; });

    if (!work.length) return;

    /* ---- The note under the grid ---------------------------------------- */

    var note = $('#statsNote');
    var noteEn = note && $('.lang-en', note);
    var noteEs = note && $('.lang-es', note);

    function formatDate(iso, locale) {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
      if (!m) return iso;
      try {
        /* new Date('2026-09-27') is read as UTC midnight, which prints as the
           26th everywhere west of Greenwich — including all of Latin America.
           The numeric constructor is local, and is the only safe form here. */
        var d = new Date(+m[1], +m[2] - 1, +m[3]);
        return d.toLocaleDateString(locale,
          { day: 'numeric', month: 'long', year: 'numeric' });
      } catch (e) {
        return iso;   /* no locale data — the ISO date is unambiguous anyway */
      }
    }

    /* The date is prose and does not depend on any request, so it is written
       straight away rather than after the network settles. The markup ships
       the ISO string, which is what shows with scripting off. */
    var iso = note && note.getAttribute('data-snapshot');
    var enDate = noteEn && $('.stats-date', noteEn);
    var esDate = noteEs && $('.stats-date', noteEs);
    if (enDate) enDate.textContent = formatDate(iso, 'en-GB');
    if (esDate) esDate.textContent = formatDate(iso, 'es-ES');

    /* Nothing appears until a request has been slow enough to be worth
       showing. On a fast connection the page just has today's figures and
       never flickers; on a slow one the skeleton says what is happening. */
    shimmerTimer = window.setTimeout(function () {
      Object.keys(attempted).forEach(function (id) {
        if (!settled[id] && els[id]) els[id].classList.add('is-loading');
      });
    }, SHIMMER_DELAY);

    Promise.all(work).then(function () {
      window.clearTimeout(shimmerTimer);
      Object.keys(attempted).forEach(function (id) {
        if (els[id]) els[id].classList.remove('is-loading');
      });

      /* Both languages are written here, once. Nothing re-runs on a language
         switch, because the stylesheet already holds both. */
      var enState = noteEn && $('.stats-state', noteEn);
      var esState = noteEs && $('.stats-state', noteEs);
      if (enState) {
        enState.textContent = anyFailed
          ? ' · live refresh unavailable'
          : ' · refreshed on load';
      }
      if (esState) {
        esState.textContent = anyFailed
          ? ' · actualización en vivo no disponible'
          : ' · actualizado al cargar';
      }

      if (anyFailed) {
        showToast(
          'Some figures could not be refreshed, so the last verified numbers are shown.',
          'No se pudieron actualizar algunas cifras, así que se muestran las últimas verificadas.'
        );
      }
    });
  })();
})();
