# Toolkit — Feature Cheat Sheet

One line per feature. Every shortcut listed is a Toolkit keybinding (VS Code's own shortcuts are not repeated here). Full details in [README.md](README.md).

## Git

| Feature | Shortcut | What it does |
|---|---|---|
| Open in GitHub | — | Open/copy GitHub URLs for the file, repo, blame, history, or a permalink |
| Git File History | — | Commit history + diffs for a file in a panel, paged with Load more |
| Git Blame | — | Toggle JetBrains-style inline blame annotations on every line |
| Commit History view | — | SCM sidebar: edit message/date, reset HEAD (soft/mixed/hard), squash/fixup into parent, cherry-pick from branch |
| Compare with Branch | — | Diff the file, a folder, or the whole project against another local branch |
| Expand Changed Files | — | Expand only the explorer folders containing git changes |
| Stage Changes | — | Stage files/folders from the explorer (multi-select, multi-repo) |
| Peek Last Commit | — | Hover any line to see the commit that last touched it |

## Packages

| Feature | Shortcut | What it does |
|---|---|---|
| NuGet Package Manager | — | Browse/install/update/uninstall NuGet packages; solution-wide overview |
| npm Package Manager | — | Same for npm/yarn/pnpm; workspace-wide overview |
| NPM Intellisense | — | Autocomplete package names in import/require |
| npm Audit | — | Known vulnerabilities via npm/yarn/pnpm audit, sorted by severity, with apply-fixes |
| NuGet Vulnerabilities | — | Same for .NET projects and solutions via dotnet list package |

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
| UUID / ULID Hover | — | Hover an id to see its kind and embedded creation time |
| Format Markdown Table | — | Align table pipes to the widest cell, honoring GFM alignment |
| Compact Markdown Table | — | Strip the padding back out for minimal tables and clean diffs |
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
| TODO Tree | — | TODO/FIXME/HACK... comments in a sidebar tree, grouped by tag or file |
| REST Client | — | Run .http requests; rich response panel with live timer/cancel and retry-on-timeout, environments (env.json), variables, file bodies, copy as curl |
| REST Requests | — | Sidebar tree of every workspace .http/.rest file and its requests — open, jump to, or send each |
| REST Response History | — | Sidebar tree of recent responses grouped per request; color-coded status, filter, re-send, diff, detail panel, copy as curl/body/URL, save body, go to source |
| Regex Playground | — | Live regex tester in a panel, safe against catastrophic backtracking |

## Viewers & Appearance

| Feature | Shortcut | What it does |
|---|---|---|
| Diagnostic Highlight | — | Make hint/info diagnostics actually visible (colored underlines) |
| CSV Rainbow | — | Color each CSV/TSV column; hover shows the column header |
| PDF Viewer | — | Open PDFs in a tab: search, outline, thumbnails, zoom, text selection |
| SVG Preview | — | Live side-panel preview with zoom and background toggle |
| Generic Dark Theme | — | Dark+ base with JetBrains-style syntax colors per language |
| JetBrains Dark Icons | — | File/folder icon theme inspired by the JetBrains New UI |

## Where to find things

- Most actions live in the **right-click menus** — the editor menu shows the actions for that file type (`.http`, `.json`, `.md`, `package.json`, `.csproj`...), the explorer menu the file/folder ones.
- Tree views (Commit History, TODOs, NuGet, npm, REST Requests, REST Response History) have **inline icons** on hover.
- Everything is also in the **Command Palette** under `Toolkit:`.
