# GitHub Pages practice host

This repository has two completely separate web surfaces.

## Ordly production

Ordly itself is the Next.js application in this repository. Its production deployment is Vercel. Product code, Supabase integration, authentication, review logic, the PWA, and normal Ordly development belong to that deployment.

**GitHub Pages is not an Ordly production deployment and must never be treated as one.**

## Manual ChatGPT practice page

The repository's GitHub Pages site exists only as a lightweight host for standalone Danish practice sessions generated manually with ChatGPT.

- Public URL: `https://sevastian-bahynskyi.github.io/ordly/`
- Published source: `practice/`
- Main page: `practice/index.html`
- Deployment workflow: `.github/workflows/practice-pages.yml`
- Hosting: GitHub Pages
- Generation model: manual. The user gives ChatGPT current learning/progress data and asks for a practice session. ChatGPT generates or replaces the standalone HTML.
- Persistence: the generated page may use browser `localStorage` so progress survives closing, refreshing, or reopening the page on the same browser/device.

This page is deliberately independent from the Ordly application. It should not import the Next.js app, use the Ordly production build, depend on Supabase, or be wired into Vercel unless the user explicitly changes this design.

## Updating the practice page

When the user provides updated vocabulary/progress and asks for a new hosted exercise:

1. Use the user's current learning data to design an appropriate exercise session.
2. Keep exercises simple enough for the requested level and vary the interaction types when useful.
3. Replace `practice/index.html` with the newly generated self-contained HTML.
4. Keep the public GitHub Pages URL stable.
5. Commit the change to `main`. The Pages workflow republishes automatically.
6. Treat the HTML as a manually generated learning artifact, not as product source code.

When a new session intentionally replaces the old one, use a new local-storage session/version key if old in-progress state is incompatible with the new exercise structure.

## Important boundary for future agents

Do not infer product requirements from this page. Do not move normal Ordly features into `practice/`, and do not move this manually generated practice workflow into the main Ordly application merely because both live in the same repository.

The reason this directory lives here is operational convenience: ChatGPT already has GitHub access to the Ordly repository, GitHub Pages is free for this static page, and future sessions can be regenerated at one stable URL without a separate paid hosting service.
