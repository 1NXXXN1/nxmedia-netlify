NXMEDIA - Static Netlify site + Scraper functions (ready-to-deploy)

What you got:
 - public/index.html  -- search UI (client)
 - public/watch.html  -- simple player bridge (reads ?data=BASE64)
 - public/js/main.js  -- frontend logic
 - netlify/functions/search.js -- serverless aggregator (scrapes IMDb, Kinopoisk, TMDB, Letterboxd)
 - netlify.toml

How to deploy:
 1. Create a new GitHub repository and push the contents of this folder.
 2. Create a new site on Netlify -> "New site from Git" -> choose the repo.
 3. Netlify will build and publish the 'public' folder and expose functions under '/api/*'.
 4. Open the site and search.

Notes & warnings:
 - This project uses HTML scraping of external websites. Scraping is brittle: sites change HTML and the scrapers may break.
 - Respect sites' Terms of Service. Heavy scraping may get blocked.
 - The scrapers use a simple User-Agent header but no advanced anti-blocking. If you get blocked, consider rotating headers or adding proxy.
 - No API keys required.
