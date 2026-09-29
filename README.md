# First Serve

A twice-daily news brief for Samrudh covering business and markets, tech and AI, consulting and careers, investing, startups, UC Irvine, and tennis. A morning email sends him the top five stories.

## How it works

```
GitHub Actions (6 AM + 5 PM PT)
  └─ scripts/edition.mjs
       ├─ GNews: ~90 recent articles across 9 topic feeds
       ├─ Yahoo Finance: S&P 500, Nasdaq, Dow, 10-yr yield, gold for the scoreboard
       ├─ Gemini (free tier): picks 8-11 stories and writes them
       ├─ validate: drops anything without a real source link, removes em dashes
       ├─ saves data/latest.json + data/editions/<date>-am|pm.json  → committed to the repo
       └─ morning only: emails the top 5 through Resend

Netlify (firstserve.news)
  └─ site/index.html reads data/latest.json from GitHub on every visit
```

The page reads each edition straight from the repo, so the twice-daily data commits don't trigger a Netlify deploy. Netlify only rebuilds when something in `site/` changes (see `netlify.toml`).

API keys live only in GitHub Actions secrets. Nothing secret is in the page or the repo.

## Setup (about 30 minutes)

### 1. GitHub
1. Create a **public** repo named `ZenlyrLabs/first-serve`. It must be public because the page reads the data file from it. If you use a different owner or name, update `DATA_URL` near the bottom of `site/index.html`.
2. Push this folder to the `main` branch.

### 2. Netlify
1. **Add new site → Import an existing project → GitHub**, then pick `first-serve`. Leave the build settings empty; `netlify.toml` handles them.
2. **Domain management → Add a domain** and enter `firstserve.news`. Because you registered it with Netlify, DNS is set up automatically, and HTTPS follows within a few minutes.

### 3. Resend (for the email)
1. **Domains → Add domain** and enter `firstserve.news`.
2. Copy the DNS records Resend shows (MX, TXT/SPF, DKIM) into **Netlify → Domains → firstserve.news → DNS records**.
3. Click **Verify** in Resend. This usually takes a few minutes.
4. Create an API key with **Sending access** only.

### 4. Gemini API key (free)
1. Go to **aistudio.google.com** and sign in with a Google account.
2. Click **Get API key → Create API key**. Don't add billing. Without billing the key stays on the free tier, so it can never charge you.

### 5. GitHub secrets and variables
In the repo, go to **Settings → Secrets and variables → Actions**.

| Secret | Value |
|---|---|
| `GEMINI_API_KEY` | Free key from Google AI Studio (step 4 below) |
| `GNEWS_API_KEY` | Your GNews key. The free plan covers it: 18 of 100 daily requests. |
| `RESEND_API_KEY` | From step 3 |
| `EMAIL_TO` | `samrudhnair@gmail.com` (comma-separate to add yourself) |
| `EMAIL_FROM` | `First Serve <brief@firstserve.news>` |

| Variable (Variables tab) | Value |
|---|---|
| `SITE_URL` | `https://firstserve.news` |
| `GEMINI_MODELS` | Optional. Defaults to `gemini-3.8-flash,gemini-3.5-flash,gemini-3.5-flash-lite`, tried in order. |

### 6. First run
1. Set `EMAIL_TO` to your own address for the test.
2. Go to **Actions → Build edition → Run workflow**. Choose **morning** and uncheck **Skip the email**.
3. After about 2 minutes, check that firstserve.news shows the new edition and that the email arrived.
4. Switch `EMAIL_TO` to Samrudh's address. The schedule runs on its own from then on.

Ask Samrudh to add `brief@firstserve.news` to his contacts, or to move the first email out of Promotions, so Gmail learns to put it in his inbox.

## Schedule

- **Morning edition** around 6:00 AM PT, with the email
- **Evening edition** around 5:00 PM PT, page only

GitHub cron runs in UTC, so each edition is scheduled twice, an hour apart. That keeps the timing right when daylight saving starts or ends; the second run sees the edition already exists and stops. GitHub can delay scheduled runs by 10 to 30 minutes when it's busy.

## Running cost

| Service | Cost |
|---|---|
| Gemini API | Free. Two requests a day, far under the free tier's limits. |
| GNews, Yahoo Finance, Resend, GitHub Actions, Netlify | Free |
| firstserve.news | About $13 the first year (check the renewal price) |

## Changing what he gets

- **Topics and search terms:** `FEEDS` in `scripts/news.mjs`
- **What the writer knows about him, story mix, tone:** `READER` and `buildPrompt` in `scripts/prompt.mjs`
- **Section names:** `SECTION_TITLES` in `scripts/validate.mjs`
- **Look of the page:** `site/index.html`
- **Email layout:** `scripts/email.mjs`

## Testing

```
npm test
```

This runs the whole pipeline offline with GNews, Yahoo Finance, Gemini, and Resend mocked. It covers the daylight-saving slot logic, market formatting, falling back to the next Gemini model when one is rate-limited, dropping unsourced stories, and email rendering.

To build a real edition locally without sending the email:

```
GNEWS_API_KEY=... GEMINI_API_KEY=... FORCE_SLOT=morning DRY_RUN=1 node scripts/edition.mjs
```

## About the free tier

- On Gemini's free tier, Google may use prompts to improve its products. That doesn't matter here, because the input is public news articles.
- Google changes free-tier models and limits from time to time. If a model is retired, the script moves on to the next one in the list. If all of them stop working, set `GEMINI_MODELS` to a current free Flash model from Google's pricing page.
- The scoreboard uses Yahoo Finance's public chart data, which is unofficial. If it ever fails, the edition goes out without the scoreboard.
- To switch to Claude later (about $3 to $5 a month): add an `ANTHROPIC_API_KEY` secret and set the `LLM_PROVIDER` variable to `claude`.

## If something breaks

- **The page says "The brief didn't load":** the repo is private, or `DATA_URL` points to the wrong repo.
- **The Action failed:** open the run log. The last line names the problem, such as a missing secret, a GNews quota error, or all Gemini models being rate-limited. If a run fails, the page keeps showing the last good edition.
- **No email:** check the Resend dashboard under Emails, and confirm the domain is still verified.
- **The schedule stopped:** GitHub turns off scheduled workflows in repos with no activity for 60 days. The twice-daily commits count as activity, so this only happens if runs keep failing.
