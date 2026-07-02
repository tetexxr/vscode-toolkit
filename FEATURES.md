# Toolkit — Feature Cheat Sheet

One line per feature. Every shortcut listed is a Toolkit keybinding (VS Code's own shortcuts are not repeated here). Full details in [README.md](README.md).

## Git

| Feature | Shortcut | What it does |
|---|---|---|
| Open in GitHub | — | Open/copy GitHub URLs for the file, repo, blame, history, or a permalink |
| Git File History | — | Commit history + diffs for a file in a panel, paged with Load more |
| Git Blame | — | Toggle JetBrains-style inline blame annotations on every line |
| Commit History view | — | SCM sidebar: edit message/date, reset HEAD (soft/mixed/hard), squash/fixup into parent, cherry-pick from branch |
| Git Stash Manager | — | SCM sidebar: list stashes with diff preview; create, apply, pop, drop |
| Compare with Branch or Commit | — | Diff the file, a folder, or the whole project against another local branch or a specific commit |
| Diff Tools | — | Compare the selection/file with the clipboard, or the active file with another open tab |
| Expand Changed Files | — | Expand only the explorer folders containing git changes |
| Stage Changes | — | Stage files/folders from the explorer (multi-select, multi-repo) |
| Commit & Push — Selected Repositories | — | One commit message + push across every selected repository's staged changes; from the Source Control context menu. Commit-only, stage-all + commit, and stage-all + commit + push variants available |
| Synchronize — Selected Repositories | — | Pull then push every selected repository at once (honours your pull.rebase config); from the Source Control context menu |
| Peek Last Commit | — | Hover any line to see the commit that last touched it |

## Packages

| Feature | Shortcut | What it does |
|---|---|---|
| NuGet Package Manager | — | Browse/install/update/uninstall NuGet packages; solution-wide overview |
| npm Package Manager | — | Same for npm/yarn/pnpm; workspace-wide overview |
| NPM Intellisense | — | Autocomplete package names in import/require |
| npm Audit | — | Known vulnerabilities via npm/yarn/pnpm audit, sorted by severity, with apply-fixes |
| NuGet Vulnerabilities | — | Same for .NET projects and solutions via dotnet list package |
| Run Scripts | — | Run a package.json script via a CodeLens above each one, or a Run Script… picker; auto-detects npm/yarn/pnpm |

## Editing

| Feature | Shortcut | What it does |
|---|---|---|
| Change Case | — | Convert selection between 13 case formats (live preview) |
| Slugify | — | Turn text into a clean URL slug |
| Move Symbol Up | `Cmd+Shift+↑` | Move the function/method under the cursor above its previous sibling |
| Move Symbol Down | `Cmd+Shift+↓` | Move it below its next sibling |
| Add / Remove Braces | — | Wrap/unwrap single-statement blocks (appears as a Quick Fix code action) |
| Convert Imports to Relative | — | Rewrite alias imports as relative paths using tsconfig paths |
| Convert Imports to Alias | — | The inverse: relative imports back to aliases |
| Type-Only Imports | — | Flags imports usable as `import type`, with one-click fix |
| Lines | — | Sort, dedupe, shuffle, reverse, trim the selected lines |
| Align by Character | — | Vertically align lines by `=`, `:`, `,`, `=>`, `//`, or custom |
| Toggle Quotes | — | Cycle `'` → `"` → `` ` `` on the string under the cursor |
| Transform Selection | — | Base64/URL/HTML/hex encode-decode, hashes, JWT decode, JSON ⇄ YAML, JSON prettify/minify/sort |
| Sum Numbers | — | Sum the leading number of each selected line |
| Insert | — | UUID v4/v7, ULID, timestamps, random hex/base64 at each cursor |
| Timestamp Converter & Hover | — | Convert epoch ⇄ ISO; hover any epoch number to decode it |
| Number Base Converter | — | Convert a selected number between dec/hex/bin/oct; hover any number to see all bases |
| Cron Hover | — | Hover a cron expression to see a plain-English description and the next run times |
| Password Generator | — | KeePassXC-style panel: secure (CSPRNG) passwords with class/length options and a live entropy strength meter; editable field re-estimates strength for passwords you type or paste |
| UUID / ULID Hover | — | Hover an id to see its kind and embedded creation time |
| Format Markdown Table | — | Align table pipes to the widest cell, honoring GFM alignment |
| Compact Markdown Table | — | Strip the padding back out for minimal tables and clean diffs |
| Generate Table of Contents | — | Build a nested TOC of the markdown headings up to a chosen level; updates in place between markers |
| JSON to Type | — | Generate TypeScript/C# types from a JSON sample |

## Code Generation

| Feature | Shortcut | What it does |
|---|---|---|
| New C# File | — | Explorer submenu: class, record, controller, Blazor, tests... with namespace detection |
| C# Code Actions | — | Generate (expression-bodied) constructor from properties (Quick Fix code action) |
| Auto Rename Tag | — | Rename the matching HTML/XML tag pair (disabled by default) |

## Workspace

| Feature | Shortcut | What it does |
|---|---|---|
| All Features | `Shift+Alt+P` | Searchable index of everything on this page — pick one to run it |
| Find File or Folder | `Opt+P` | Quick-open that also finds folders; recents, AND terms, `-` negation |
| ↳ Remove from Recent | `Cmd+Backspace` | Remove the highlighted item from the recent list (while the picker is open, empty input) |
| Expand / Collapse Recursively | — | Expand or collapse a whole explorer subtree |
| Format Files | — | Bulk-format workspace/folder/glob in memory, without stealing focus |
| Paste Image | — | Save the clipboard image to disk and insert the link |
| Clipboard History | — | Recall recent copies; pin the ones you need all session |
| Toggle Bookmark | `F7` | Add/remove a bookmark on the current line |
| Toggle Bookmark with Label | `Shift+F7` | Add a bookmark asking for a label |
| Show Bookmarks | `Ctrl+F7` | Quick pick of every bookmark; pick one to jump |
| Next Bookmark | `Alt+F7` | Jump to the next bookmark (across files, wraps around) |
| Previous Bookmark | `Shift+Alt+F7` | Jump to the previous one |
| .env Checker | — | Diagnostics when .env drifts from .env.example, with quick fix |
| Resource Translations | — | Edit .resx localization groups (neutral + .en/.ca/... satellites) as a grid — one column per language — with add/rename/delete key across all languages, sort, normalize and save-all. Plus diagnostics for keys missing in some languages, different key order, duplicates and placeholder drift; quick fixes; group sync and a workspace audit. WinForms designer resx are skipped |
| Word Bookmarks | — | Check .docx templates for bookmark problems in a filterable panel — a placeholder split across runs (which breaks first-run replacement at export), duplicate names, orphaned start/end markers, names over 40 chars. Run from the palette (whole workspace) or the explorer context menu (Word Document ▸ Check / Fix Bookmarks); consolidate the split ones per row or all at once, in place, keeping formatting |
| PDF Fields | — | Inspect and edit a PDF form's AcroForm fields in a panel — name, type and value — with inline controls per type (text, checkbox, radio, dropdown, list). Edit values (or Clear all), then Save changes to overwrite the PDF in place, keeping each field's styling. From the palette (pick a PDF) or the explorer context menu on a .pdf |
| TODO Tree | — | TODO/FIXME/HACK... comments in a sidebar tree, grouped by tag or file |
| REST Client | — | Run .http requests; rich response panel with live timer/cancel and retry-on-timeout, environments (env.json, with a gitignored private overlay you can scaffold from the env file's context menu), variables, file bodies, @assert checks on status/headers/body, copy as curl |
| REST Requests | — | Sidebar tree of every workspace .http/.rest file and its requests — open, jump to, or send each |
| REST Response History | — | Sidebar tree of recent responses grouped per request; color-coded status, filter, re-send, diff, detail panel, copy as curl/body/URL, save body, go to source |
| Import cURL | — | Turn a curl command on the clipboard into an .http request block (the inverse of Copy as curl) |
| Regex Playground | — | Live regex tester in a panel, safe against catastrophic backtracking |
| JSON Playground | — | Query JSON live with a JavaScript expression (`$` is your JSON), evaluated safely in a worker |
| Local History | — | JetBrains-style per-file revisions captured on every save; diff against or restore any past version |
| Scratch Files | — | Throwaway files kept outside the workspace (never committed); listed in the Explorer, with new-from-selection |
| Kill Port | — | List the processes listening on TCP ports and kill one or several (multi-select) |

## Viewers & Appearance

| Feature | Shortcut | What it does |
|---|---|---|
| Diagnostic Highlight | — | Make hint/info diagnostics actually visible (colored underlines) |
| CSV Rainbow | — | Color each CSV/TSV column; hover shows the column header |
| Color Decorators | — | Inline color swatches + native picker for hex/rgb/hsl in any language (CSS-family excluded; automatic) |
| Pick Color from Screen | — | Eyedropper: pick any pixel on screen and insert it as hex/rgb/hsl at the cursor |
| PDF Viewer | — | Open PDFs in a tab: search, outline, thumbnails, zoom, text selection |
| SVG Preview | — | Live side-panel preview with zoom and background toggle |
| Enhanced Markdown Preview | — | Render the built-in preview with GitHub's own styling (github-markdown-css); toggle from the status bar or context menu |
| Generic Dark Theme | — | Dark+ base with JetBrains-style syntax colors per language |
| JetBrains Dark Icons | — | File/folder icon theme inspired by the JetBrains New UI |

## Where to find things

- Most actions live in the **right-click menus** — the editor menu shows the actions for that file type (`.http`, `.json`, `.md`, `package.json`, `.csproj`...), the explorer menu the file/folder ones. Related actions are grouped into submenus (**Change Case**, **Lines**, **Align**, **Insert**, **Transform**, **Convert**, **Compare**, **Git**, **Packages**, **REST Client**, **Resources**, **Markdown**, **New C# File**) so every variant is one hover away instead of behind a picker; common single actions stay at the top level. In the **Command Palette**, those grouped actions appear under their feature name (e.g. `Align: =`, `Insert: UUID v4`, `Transform: Base64 Encode`); everything else is under `Toolkit:`.
- Tree views (Commit History, TODOs, NuGet, npm, REST Requests, REST Response History) have **inline icons** on hover.
- Everything is also in the **Command Palette** under `Toolkit:`.
