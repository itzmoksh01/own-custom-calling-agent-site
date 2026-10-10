/* Runs before first paint so the reveal animations don't flash.
   Kept as an external file (not an inline <script>) so the site can ship a
   strict Content-Security-Policy with script-src 'self'. */
document.documentElement.classList.add("js");
