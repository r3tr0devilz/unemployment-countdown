# Job Search Countdown

A single-page countdown timer + job application tracker, meant to be left open on a tablet or spare monitor as a nudge to keep applying.

- **Countdown**: days/hours/minutes/seconds to a deadline you set (e.g. when unemployment benefits or savings run out, or a personal deadline), plus a running "Day N of search" tally.
- **Tracker**: log applications (company, role, date, status, link, notes), searchable/sortable/filterable table, weekly/daily/total stats.
- **No backend, no account.** Everything is stored in your browser's `localStorage`. Nothing is sent anywhere.
- **Backup**: use Export/Import in the tracker toolbar to save a JSON snapshot or move your data to another device/browser.

## Run it locally

Just open `index.html` in a browser — no build step, no dependencies.

## Deploy to GitHub Pages (free hosting)

1. Create a new **public** (or private, Pages works on both with GitHub Pro, but public is free for everyone) GitHub repository.
2. Push this folder to it:
   ```
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git branch -M main
   git push -u origin main
   ```
3. On GitHub: go to **Settings → Pages**.
4. Under "Build and deployment", set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`.
5. Save. Your site will be live at `https://<your-username>.github.io/<repo-name>/` within a minute or two.
6. Open that URL on your tablet, add it to the home screen / set it as the browser's start page, and leave it open.

## Notes on data persistence

Since data lives in `localStorage`, it's tied to one specific browser on one specific device. Clearing browser data/cache will erase it. **Export a backup regularly** (there's a button for it), especially before clearing browser data or switching devices/browsers.

## License

MIT — see [LICENSE](LICENSE). Fork it, change the colors, make it yours.
