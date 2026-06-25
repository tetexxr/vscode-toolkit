/**
 * The feature catalog behind "Toolkit: All Features".
 * Pure data — a test cross-checks it against FEATURES.md so the cheat sheet,
 * this launcher, and the actual commands never drift apart.
 */

export interface FeatureEntry {
  /** Must match a section header in FEATURES.md. */
  category: string
  /** Must match the row's first cell in FEATURES.md. */
  name: string
  /** Toolkit keybinding, when one exists (display only). */
  shortcut?: string
  description: string
  /** Command to run when picked; entries without one open the cheat sheet. */
  command?: string
}

export const FEATURE_CATALOG: FeatureEntry[] = [
  // ── Git ────────────────────────────────────────────────
  { category: 'Git', name: 'Open in GitHub', command: 'toolkit.openInGitHub.file', description: 'Open/copy GitHub URLs for the file, repo, blame, history, or a permalink' },
  { category: 'Git', name: 'Git File History', command: 'toolkit.gitHistory', description: 'Commit history + diffs for a file in a panel, paged with Load more' },
  { category: 'Git', name: 'Git Blame', command: 'toolkit.toggleGitBlame', description: 'Toggle JetBrains-style inline blame annotations on every line' },
  { category: 'Git', name: 'Commit History view', command: 'toolkitCommitList.focus', description: 'SCM sidebar: edit message/date, reset HEAD, squash/fixup, cherry-pick from branch' },
  { category: 'Git', name: 'Git Stash Manager', command: 'toolkitGitStash.focus', description: 'SCM sidebar: list stashes with diff preview; create, apply, pop, drop' },
  { category: 'Git', name: 'Compare with Branch or Commit', command: 'toolkit.compareWithBranch', description: 'Diff the file (or a folder / the project, from the explorer) against another local branch or a specific commit' },
  { category: 'Git', name: 'Diff Tools', command: 'toolkit.diff.withClipboard', description: 'Compare the selection/file with the clipboard, or the active file with another open tab' },
  { category: 'Git', name: 'Expand Changed Files', command: 'toolkit.expandChangedFiles', description: 'Expand only the explorer folders containing git changes' },
  { category: 'Git', name: 'Stage Changes', description: 'Stage files/folders from the explorer context menu (multi-select, multi-repo)' },
  { category: 'Git', name: 'Peek Last Commit', command: 'toolkit.peekCommit.showLast', description: 'Hover any line to see the commit that last touched it' },

  // ── Packages ───────────────────────────────────────────
  { category: 'Packages', name: 'NuGet Package Manager', command: 'toolkit.nuget.managePackagesPalette', description: 'Browse/install/update/uninstall NuGet packages; solution-wide overview' },
  { category: 'Packages', name: 'npm Package Manager', command: 'toolkit.npm.managePackagesPalette', description: 'Same for npm/yarn/pnpm; workspace-wide overview' },
  { category: 'Packages', name: 'NPM Intellisense', command: 'toolkit.npmIntellisense.import', description: 'Autocomplete package names in import/require; command to insert an import' },
  { category: 'Packages', name: 'npm Audit', command: 'toolkit.npm.audit', description: 'Known vulnerabilities via npm/yarn/pnpm audit, sorted by severity, with apply-fixes' },
  { category: 'Packages', name: 'NuGet Vulnerabilities', command: 'toolkit.nuget.vulnerabilities', description: 'Same for .NET projects and solutions via dotnet list package' },
  { category: 'Packages', name: 'Run Scripts', command: 'toolkit.runScripts.pick', description: 'Run a package.json script via a CodeLens above each one, or a Run Script… picker; auto-detects npm/yarn/pnpm' },

  // ── Editing ────────────────────────────────────────────
  { category: 'Editing', name: 'Change Case', command: 'toolkit.changeCase', description: 'Convert selection between 13 case formats (live preview)' },
  { category: 'Editing', name: 'Slugify', command: 'toolkit.slugify', description: 'Turn text into a clean URL slug' },
  { category: 'Editing', name: 'Move Symbol Up', shortcut: 'Cmd+Shift+↑', command: 'toolkit.moveSymbolUp', description: 'Move the function/method under the cursor above its previous sibling' },
  { category: 'Editing', name: 'Move Symbol Down', shortcut: 'Cmd+Shift+↓', command: 'toolkit.moveSymbolDown', description: 'Move it below its next sibling' },
  { category: 'Editing', name: 'Add / Remove Braces', description: 'Wrap/unwrap single-statement blocks (appears as a Quick Fix code action)' },
  { category: 'Editing', name: 'Convert Imports to Relative', command: 'toolkit.convertImportsToRelative', description: 'Rewrite alias imports as relative paths using tsconfig paths' },
  { category: 'Editing', name: 'Convert Imports to Alias', command: 'toolkit.convertImportsToAlias', description: 'The inverse: relative imports back to aliases' },
  { category: 'Editing', name: 'Type-Only Imports', command: 'toolkit.typeOnlyImports.analyzeCurrentFile', description: 'Flags imports usable as `import type` automatically; command for a verbose pass' },
  { category: 'Editing', name: 'Lines', command: 'toolkit.lines', description: 'Sort, dedupe, shuffle, reverse, trim the selected lines' },
  { category: 'Editing', name: 'Align by Character', command: 'toolkit.align', description: 'Vertically align lines by =, :, comma, =>, //, # or a custom delimiter' },
  { category: 'Editing', name: 'Toggle Quotes', command: 'toolkit.toggleQuotes', description: "Cycle ' → \" → ` on the string under the cursor" },
  { category: 'Editing', name: 'Transform Selection', command: 'toolkit.transform', description: 'Base64/URL/HTML/hex encode-decode, hashes, JWT decode, JSON ⇄ YAML, JSON prettify/minify/sort' },
  { category: 'Editing', name: 'Sum Numbers', command: 'toolkit.sumNumbers', description: 'Sum the leading number of each selected line' },
  { category: 'Editing', name: 'Insert', command: 'toolkit.insert', description: 'UUID v4/v7, ULID, timestamps, random hex/base64 at each cursor' },
  { category: 'Editing', name: 'Timestamp Converter & Hover', command: 'toolkit.timestamp.convert', description: 'Convert epoch ⇄ ISO; hover any epoch number to decode it' },
  { category: 'Editing', name: 'Number Base Converter', command: 'toolkit.numberBase.convert', description: 'Convert a selected number between dec/hex/bin/oct; hover any number to see all bases' },
  { category: 'Editing', name: 'Cron Hover', description: 'Hover a cron expression to see a plain-English description and the next run times (automatic)' },
  { category: 'Editing', name: 'Password Generator', command: 'toolkit.passwordGenerator.open', description: 'KeePassXC-style panel: secure (CSPRNG) passwords with class/length options and a live entropy strength meter' },
  { category: 'Editing', name: 'UUID / ULID Hover', description: 'Hover an id to see its kind and embedded creation time (automatic)' },
  { category: 'Editing', name: 'Format Markdown Table', command: 'toolkit.markdown.formatTable', description: 'Align table pipes to the widest cell, honoring GFM alignment' },
  { category: 'Editing', name: 'Compact Markdown Table', command: 'toolkit.markdown.compactTable', description: 'Strip the padding back out for minimal tables and clean diffs' },
  { category: 'Editing', name: 'Generate Table of Contents', command: 'toolkit.markdown.generateToc', description: 'Build a nested TOC of the markdown headings up to a chosen level; updates in place between markers' },
  { category: 'Editing', name: 'JSON to Type', command: 'toolkit.jsonToType', description: 'Generate TypeScript/C# types from a JSON sample' },

  // ── Code Generation ────────────────────────────────────
  { category: 'Code Generation', name: 'New C# File', description: 'Explorer right-click on a folder → New C# submenu: class, record, controller, Blazor, tests...' },
  { category: 'Code Generation', name: 'C# Code Actions', description: 'Generate (expression-bodied) constructor from properties (Quick Fix code action)' },
  { category: 'Code Generation', name: 'Auto Rename Tag', description: 'Rename the matching HTML/XML tag pair (disabled by default)' },

  // ── Workspace ──────────────────────────────────────────
  { category: 'Workspace', name: 'All Features', shortcut: 'Shift+Alt+P', command: 'toolkit.showAllFeatures', description: 'This launcher — a searchable index of every feature' },
  { category: 'Workspace', name: 'Find File or Folder', shortcut: 'Opt+P', command: 'toolkit.findFileOrFolder', description: 'Quick-open that also finds folders; recents, AND terms, - negation' },
  { category: 'Workspace', name: 'Remove from Recent', shortcut: 'Cmd+Backspace', description: 'Remove the highlighted item from the recent list (while the picker is open, empty input)' },
  { category: 'Workspace', name: 'Expand / Collapse Recursively', description: 'Expand or collapse a whole explorer subtree (explorer context menu)' },
  { category: 'Workspace', name: 'Format Files', command: 'toolkit.formatFiles.workspace', description: 'Bulk-format workspace/folder/glob in memory, without stealing focus' },
  { category: 'Workspace', name: 'Paste Image', command: 'toolkit.pasteImage', description: 'Save the clipboard image to disk and insert the link' },
  { category: 'Workspace', name: 'Clipboard History', command: 'toolkit.clipboardHistory.show', description: 'Recall recent copies; pin the ones you need all session' },
  { category: 'Workspace', name: 'Toggle Bookmark', shortcut: 'F7', command: 'toolkit.bookmarks.toggle', description: 'Add/remove a bookmark on the current line' },
  { category: 'Workspace', name: 'Toggle Bookmark with Label', shortcut: 'Shift+F7', command: 'toolkit.bookmarks.toggleWithLabel', description: 'Add a bookmark asking for a label' },
  { category: 'Workspace', name: 'Show Bookmarks', shortcut: 'Ctrl+F7', command: 'toolkit.bookmarks.show', description: 'Quick pick of every bookmark; pick one to jump' },
  { category: 'Workspace', name: 'Next Bookmark', shortcut: 'Alt+F7', command: 'toolkit.bookmarks.next', description: 'Jump to the next bookmark (across files, wraps around)' },
  { category: 'Workspace', name: 'Previous Bookmark', shortcut: 'Shift+Alt+F7', command: 'toolkit.bookmarks.previous', description: 'Jump to the previous one' },
  { category: 'Workspace', name: '.env Checker', command: 'toolkit.envCheck.checkWorkspace', description: 'Diagnostics when .env drifts from .env.example, with quick fix' },
  { category: 'Workspace', name: 'Resource Translations', command: 'toolkit.resx.checkWorkspace', description: 'Edit .resx localization groups as a grid (one column per language) with add/rename/delete/sort/normalize; plus drift diagnostics, quick fixes, group sync and a workspace audit' },
  { category: 'Workspace', name: 'TODO Tree', command: 'toolkitTodoTree.focus', description: 'TODO/FIXME/HACK... comments in a sidebar tree, grouped by tag or file' },
  { category: 'Workspace', name: 'REST Client', command: 'toolkit.restClient.send', description: 'Run .http requests; rich response panel with live timer/cancel and retry-on-timeout, environments (with a scaffoldable gitignored private overlay), variables, file bodies, @assert checks on status/headers/body, copy as curl' },
  { category: 'Workspace', name: 'REST Requests', command: 'toolkitRestFiles.focus', description: 'Sidebar tree of every workspace .http/.rest file and its requests — open, jump to, or send each' },
  { category: 'Workspace', name: 'REST Response History', command: 'toolkitRestHistory.focus', description: 'Sidebar tree of recent responses grouped per request; filter, re-send, diff, detail panel, copy as curl/body/URL, save body, go to source' },
  { category: 'Workspace', name: 'Import cURL', command: 'toolkit.restClient.importCurl', description: 'Turn a curl command on the clipboard into an .http request block (the inverse of Copy as curl)' },
  { category: 'Workspace', name: 'Regex Playground', command: 'toolkit.regexPlayground.open', description: 'Live regex tester in a panel, safe against catastrophic backtracking' },
  { category: 'Workspace', name: 'JSON Playground', command: 'toolkit.jsonPlayground.open', description: 'Query JSON live with a JavaScript expression ($ is your JSON), evaluated safely in a worker' },
  { category: 'Workspace', name: 'Local History', command: 'toolkitLocalHistory.focus', description: 'JetBrains-style per-file revisions captured on every save; diff against or restore any past version' },
  { category: 'Workspace', name: 'Scratch Files', command: 'toolkit.scratch.new', description: 'Throwaway files kept outside the workspace (never committed); listed in the Explorer, with new-from-selection' },
  { category: 'Workspace', name: 'Kill Port', command: 'toolkit.killPort', description: 'List the processes listening on TCP ports and kill one or several (multi-select)' },

  // ── Viewers & Appearance ───────────────────────────────
  { category: 'Viewers & Appearance', name: 'Diagnostic Highlight', command: 'toolkit.toggleDiagnosticHighlight', description: 'Make hint/info diagnostics actually visible (colored underlines)' },
  { category: 'Viewers & Appearance', name: 'CSV Rainbow', command: 'toolkit.toggleCsvRainbow', description: 'Color each CSV/TSV column; hover shows the column header' },
  { category: 'Viewers & Appearance', name: 'Color Decorators', description: 'Inline color swatches + native picker for hex/rgb/hsl in any language (CSS-family excluded; automatic)' },
  { category: 'Viewers & Appearance', name: 'Pick Color from Screen', command: 'toolkit.colorPicker.pickFromScreen', description: 'Eyedropper: pick any pixel on screen and insert it as hex/rgb/hsl at the cursor' },
  { category: 'Viewers & Appearance', name: 'PDF Viewer', description: 'Open PDFs in a tab: search, outline, thumbnails, zoom, text selection (automatic)' },
  { category: 'Viewers & Appearance', name: 'SVG Preview', command: 'toolkit.svgPreview.open', description: 'Live side-panel preview with zoom and background toggle' },
  { category: 'Viewers & Appearance', name: 'Generic Dark Theme', description: 'Dark+ base with JetBrains-style syntax colors per language (pick it in Color Theme)' },
  { category: 'Viewers & Appearance', name: 'JetBrains Dark Icons', description: 'File/folder icon theme inspired by the JetBrains New UI (pick it in File Icon Theme)' }
]
