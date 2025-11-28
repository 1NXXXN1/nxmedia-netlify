NXMEDIA - Static Netlify site + Scraper functions with free fallback (ready-to-deploy)

Overview:
 - This project tries direct server-side fetch first. If the remote site blocks or returns a Cloudflare/JS challenge, it falls back to a free public extractor (r.jina.ai) to retrieve content.
 - No API keys required.
 - Still: scraping is brittle and may fail; respect sites' TOS.

How to deploy:
 1. Push repo to GitHub.
 2. Netlify -> New site from Git -> choose repo.
 3. Deploy (no build command needed).

Notes:
 - r.jina.ai is a free third-party extractor; it may rate-limit or change behavior.
 - If results are empty for some queries, try again or use a commercial scraping proxy.
 - This solution is free to run but not 100% guaranteed due to external protections on target sites.
