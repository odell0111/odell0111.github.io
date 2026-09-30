# Odell

## Software developer — automation, integration and reverse engineering

[Portfolio — odell0111.github.io](https://odell0111.github.io/)

odellgm11012001@gmail.com · [t.me/odell0111](https://t.me/odell0111) · [github.com/odell0111](https://github.com/odell0111) · [linkedin.com/in/odell0111](https://linkedin.com/in/odell0111) · [instagram.com/odell.dev](https://www.instagram.com/odell.dev)

---

## Profile

Self-taught developer since 2018. I build automation, integrations and desktop tools. I work mainly in Python and C#, with C and C++ where the problem calls for them. My projects tend to be tools: something that automates a process, packages a build, or reaches data that isn't exposed cleanly. That work sits close to the network — TLS and certificate chains, SSH, proxy rotation, authenticated sessions — so I read the protocol underneath before I trust it.

Most of my client work is private and cannot be published. The projects below are the part that is.

I care more about understanding a system than about shipping quickly on top of one I don't understand.

---

## Projects

### Account Manager — account and password manager

_Android and Windows · 2023–2025 · Apache-2.0_

Desktop and mobile application that keeps accounts and passwords in one place.

- **Neither build connects to the internet.** There is no network traffic to intercept and no server that can leak.
- Built around multiple account types and password import from file.
- Fully bilingual interface, English and Spanish.
- **449 downloads** of the release APK (GitHub, September 2026).
- Source withheld deliberately, so the app can't be forked into insecure builds that put users' credentials at risk.

### Custom GUI SFX — self-extracting archive builder for Windows

_C# / .NET 6 / WPF / WinUI 3 · 2023–2025_

Desktop tool that packages an archive, custom info, links and images into a single self-extracting `.exe` that runs on a machine with no unzip utility installed.

- **MVVM** architecture over .NET 6, WPF and WinUI 3.
- The finished executable has to stay under 4 GB. The limit is in the Win64 format itself: the in-memory image is capped at 2 GB because AMD64 relative addressing keeps its offsets in a dword, and everything merged onto the binary pushes the file toward that ceiling. The constraint applies to the output binary, not the archive going in.
- **334 downloads** of the published builds (GitHub, September 2026).

### Turnstile Solver — challenge-solving server

_Python · 2025 · GPL-3.0_

Async server that solves Cloudflare Turnstile challenges in a real browser and returns the token over a local REST endpoint.

- Proxy handling is first-class: global, via environment, or rotated per browser context.
- **pytest** suite and **Docker** deployment.
- **52 stars and 15 forks** on GitHub.

### Image in Terminal — Python package published on PyPI

_Python · 2023–2025 · MIT_

Package and CLI that renders images as coloured Unicode text in the terminal.

- Takes local files, HTTP/HTTPS URLs, or a whole directory.
- Two tuning thresholds decide which pixels get inverted, so images stay legible against either a light or a dark terminal.
- Published on **PyPI** as `image-in-terminal`.

### Process automation — private work

_Python · 2024–2025_

Unattended automation of workflows at scale: authenticated session management, request scheduling, concurrency, and integration with undocumented APIs.

- Systems that keep running unwatched: session handling, scheduling, and retry logic that survives the failure cases.
- It taught me more about identity handling, concurrency and anti-abuse systems than anything I have built since.
- Source not published.

---

## Technical skills

|                            |                                                                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Languages**              | Python, C#, C++, C, Kotlin, JavaScript, Java                                                                                                                                                   |
| **Frameworks & libraries** | Flask, FastAPI, Django, SQLAlchemy, Quart · Playwright, Selenium, Scrapy, BeautifulSoup, requests, aiohttp/httpx · NumPy, Pandas, Matplotlib, OpenCV, Pillow · Rich, pytest                    |
| **Databases**              | PostgreSQL, SQL                                                                                                                                                                                |
| **Tools**                  | Git (advanced), GitHub, Docker, Docker Compose, Linux, Visual Studio, PyPI, setuptools, Odoo.sh, IDA Pro, x64dbg                                                                               |
| **Security**               | Network and protocol analysis · TLS/HTTPS and certificate chains · SSH keys and tunnelling · wireless (WiFi) security · proxy handling and authenticated sessions                              |
| **Areas**                  | Reverse engineering and protocol analysis · automation and systems integration · desktop development (WPF / WinUI 3 / .NET) · Android development (Kotlin, Jetpack Compose) · full-stack web development |

---

## Education

**Self-taught since 2018.** No formal computer science qualification, but a structured education rather than an incidental one: programming courses and technical books, worked through properly and then applied. The theory came first — memory management, protocol analysis, system architecture — and taking apart software that already worked came after, to check I had actually understood it.

**Currently learning — Odoo.** Modular architecture built on Python, PostgreSQL and XML, with Odoo.sh deployments over Git and GitHub. No production experience yet.

---

## Languages

- **Spanish** — native.
- **English** — full professional proficiency, written and spoken. I read code and write technical documentation without friction, and speak fluently enough to sound like a native.
