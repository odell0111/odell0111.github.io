# Odell

## Desarrollador de software — automatización, integración e ingeniería inversa

[Portafolio — odell0111.github.io](https://odell0111.github.io/)

odellgm11012001@gmail.com · [t.me/odell0111](https://t.me/odell0111) · [github.com/odell0111](https://github.com/odell0111) · [linkedin.com/in/odell0111](https://linkedin.com/in/odell0111) · [instagram.com/odell.dev](https://www.instagram.com/odell.dev)

---

## Perfil

Desarrollador autodidacta desde 2018. Construyo automatizaciones, integraciones y herramientas de escritorio. Trabajo principalmente en Python y C#, con C y C++ cuando el problema lo pide. Mis proyectos suelen ser herramientas: algo que automatiza un proceso, empaqueta una build u obtiene datos que no están expuestos de forma limpia. Ese trabajo vive cerca de la red — TLS y cadenas de certificados, SSH, rotación de proxies, sesiones autenticadas — así que leo el protocolo que hay debajo antes de confiar en él.

La mayor parte de mi trabajo para clientes es privado y no puede publicarse. Los proyectos de abajo son la parte que sí lo está.

Prefiero entender un sistema antes que entregar rápido sobre uno que no entiendo.

---

## Proyectos

### Account Manager — gestor de cuentas y contraseñas

_Android y Windows · 2023–2025 · Apache-2.0_

Aplicación de escritorio y móvil para reunir cuentas y contraseñas en un solo sitio.

- **Ninguna de las dos versiones se conecta a internet.** No hay tráfico de red que interceptar, ni servidor que pueda filtrarse.
- Organizada en torno a varios tipos de cuenta e importación de contraseñas desde archivo.
- Interfaz totalmente bilingüe, en inglés y español.
- **449 descargas** del APK de release (GitHub, septiembre de 2026).
- Código no publicado de forma deliberada, para que la aplicación no pueda bifurcarse en versiones inseguras que pongan en riesgo las credenciales de sus usuarios.

### Custom GUI SFX — empaquetador autoextraíble para Windows

_C# / .NET 6 / WPF · 2023–2025_

Herramienta de escritorio que empaqueta un archivo comprimido, información personalizada, enlaces e imágenes en un único `.exe` autoextraíble, capaz de ejecutarse en una máquina que no tiene ningún descompresor instalado.

- Arquitectura **MVVM** sobre .NET 6 y WPF.
- El ejecutable final tiene que quedarse por debajo de 4 GB. El límite está en el propio formato Win64: la imagen en memoria está topada en 2 GB porque el direccionamiento relativo de AMD64 guarda sus desplazamientos en un dword, y todo lo que se fusiona sobre el binario acerca el archivo a ese techo. La restricción aplica al binario de salida, no al archivo que se introduce.
- **334 descargas** de las versiones publicadas (GitHub, septiembre de 2026).

### Turnstile Solver — servidor de resolución de retos

_Python · 2025 · GPL-3.0_

Servidor asíncrono que resuelve retos de Cloudflare Turnstile en un navegador real y devuelve el token a través de un endpoint REST local.

- Manejo de proxies de primera clase: global, por variables de entorno o rotado por contexto de navegador.
- Suite de tests con **pytest** y despliegue con **Docker**.
- **52 estrellas y 15 bifurcaciones** en GitHub.

### Image in Terminal — paquete Python publicado en PyPI

_Python · 2023–2025 · MIT_

Paquete y CLI que renderiza imágenes como texto Unicode en color dentro de la terminal.

- Acepta archivos locales, URLs HTTP/HTTPS o un directorio completo.
- Dos umbrales de ajuste deciden qué píxeles se invierten, para que las imágenes sigan siendo legibles tanto en una terminal clara como en una oscura.
- Publicado en **PyPI** como `image-in-terminal`.

### Automatización de procesos — trabajo privado

_Python · 2024–2025_

Automatización desatendida de flujos de trabajo a escala: gestión de sesiones autenticadas, planificación de peticiones, concurrencia e integración con APIs no documentadas.

- Sistemas que siguen funcionando sin supervisión: gestión de sesión, planificación y lógica de reintentos que sobrevive a los casos de fallo.
- Me enseñó más sobre gestión de identidad, concurrencia y sistemas antiabuso que cualquier otra cosa que haya construido desde entonces.
- Código no publicado.

---

## Stack tecnológico

|                            |                                                                                                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lenguajes**              | Python, C#, C++, C, Kotlin, JavaScript, Java                                                                                                                                                              |
| **Frameworks y librerías** | Flask, FastAPI, Django, SQLAlchemy, Quart · Playwright, Selenium, Scrapy, BeautifulSoup, requests, aiohttp/httpx · NumPy, Pandas, Matplotlib, OpenCV, Pillow · Rich, pytest                               |
| **Bases de datos**         | PostgreSQL, SQL                                                                                                                                                                                           |
| **Herramientas**           | Git (avanzado), GitHub, Docker, Docker Compose, Linux, Visual Studio, PyPI, setuptools, Odoo.sh                                                                                                           |
| **Seguridad**              | Análisis de redes y protocolos · TLS/HTTPS y cadenas de certificados · claves y túneles SSH · seguridad inalámbrica (WiFi) · manejo de proxies y sesiones autenticadas                                    |
| **Áreas**                  | Ingeniería inversa y análisis de protocolos · automatización e integración de sistemas · desarrollo de escritorio (WPF / .NET) · desarrollo Android (Kotlin, Jetpack Compose) · desarrollo web full stack |

---

## Formación

**Autodidacta desde 2018.** Sin titulación reglada en informática, pero con una formación estructurada, no improvisada: cursos de programación y libros técnicos, trabajados a fondo y luego puestos en práctica. La teoría vino primero — gestión de memoria, análisis de protocolos, arquitectura de sistemas — y desarmar software que ya funcionaba llegó después, para comprobar que la había entendido de verdad.

**En aprendizaje activo — Odoo.** Arquitectura modular basada en Python, PostgreSQL y XML, y despliegues con Odoo.sh sobre Git y GitHub. Todavía sin experiencia en producción.

---

## Idiomas

- **Español** — nativo.
- **Inglés** — competencia profesional plena, escrita y hablada. Leo código y escribo documentación técnica sin fricción, y hablo con fluidez suficiente para sonar como un nativo.
