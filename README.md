# AniFind – Anime Discovery Website

Search any anime, browse what's trending or airing this season, keep a personal watchlist, and find **where to watch it legally**.

## Features
- **Search** any anime by name
- **Trending now**, **This season** and **Top rated** lists with "Load more" pagination
- **Detail view**: synopsis, genres, score, episodes, studio, trailer link
- **Where to watch**: official licensed streaming services for each title, plus free official YouTube channels (Muse India, Ani-One Asia)
- **My list**: save anime as *Watching*, *Plan to watch* or *Completed* (stored in the browser with localStorage)
- Handles API rate limits (GraphQL queries, retry on HTTP 429), loading skeletons, empty and error states
- Responsive layout for mobile and desktop

## Tech
Plain HTML, CSS and JavaScript (no framework). Data from the free [AniList GraphQL API](https://docs.anilist.co/) (no key needed).

## Run it
Open `index.html` in a browser. Or, in VS Code, install the **Live Server** extension, right-click `index.html` → *Open with Live Server*.

## Deploy free on GitHub Pages
1. Push this folder to a new GitHub repository.
2. Repository → **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → Save.
3. Your site will be live at `https://<your-username>.github.io/<repo-name>/` in a minute or two.

## Note
AniFind does not host or stream any video. All "where to watch" links point to official, licensed services.
