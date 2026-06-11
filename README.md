# Toolkit

All-in-one VS Code utility extension.

## Table of Contents

- [Features](#features)
  - [Git](#git)
    - [Open in GitHub](#open-in-github)
    - [Git File History](#git-file-history)
    - [Git Blame (Inline Annotations)](#git-blame-inline-annotations)
    - [Edit Commit Message & Reset HEAD](#edit-commit-message--reset-head)
    - [Expand Changed Files](#expand-changed-files)
    - [Stage Changes](#stage-changes)
    - [Compare with Branch](#compare-with-branch)
    - [Compare Project / Folder with Branch](#compare-project--folder-with-branch)
    - [Peek Last Commit on Line](#peek-last-commit-on-line)
  - [Package Management](#package-management)
    - [NuGet Package Manager](#nuget-package-manager)
    - [NPM Package Manager](#npm-package-manager)
    - [NPM Intellisense](#npm-intellisense)
    - [Dependency Vulnerability Audit](#dependency-vulnerability-audit)
  - [Code Editing](#code-editing)
    - [Change Case](#change-case)
    - [Slugify](#slugify)
    - [Move Symbol Up / Down](#move-symbol-up--down)
    - [Add / Remove Braces](#add--remove-braces)
    - [Convert Import Paths](#convert-import-paths)
    - [Type-Only Imports](#type-only-imports)
    - [Sum Numbers in Selection](#sum-numbers-in-selection)
    - [Sort, Dedupe & Transform Lines](#sort-dedupe--transform-lines)
    - [Align by Character](#align-by-character)
    - [Toggle Quotes](#toggle-quotes)
    - [Transform Selection](#transform-selection)
    - [Insert UUID / Timestamp / Random](#insert-uuid--timestamp--random)
    - [Timestamp Converter & Hover](#timestamp-converter--hover)
    - [UUID / ULID Hover](#uuid--ulid-hover)
    - [Format Markdown Table](#format-markdown-table)
    - [JSON to TypeScript / C# Types](#json-to-typescript--c-types)
  - [Code Generation & Refactoring](#code-generation--refactoring)
    - [New C# File](#new-c-file)
    - [C# Code Actions](#c-code-actions)
    - [Auto Rename Tag](#auto-rename-tag)
  - [Workspace & Explorer](#workspace--explorer)
    - [Find File or Folder](#find-file-or-folder)
    - [Expand / Collapse Recursively](#expand--collapse-recursively)
    - [Format Files](#format-files)
    - [Paste Image](#paste-image)
    - [Clipboard History](#clipboard-history)
    - [Bookmarks](#bookmarks)
    - [.env Checker](#env-checker)
    - [TODO Tree](#todo-tree)
    - [REST Client](#rest-client)
    - [Regex Playground](#regex-playground)
  - [Appearance & Viewers](#appearance--viewers)
    - [Diagnostic Highlight](#diagnostic-highlight)
    - [CSV Rainbow](#csv-rainbow)
    - [PDF Viewer](#pdf-viewer)
    - [SVG Preview](#svg-preview)
    - [Generic Dark Theme](#generic-dark-theme)
    - [JetBrains Dark Icons](#jetbrains-dark-icons)
- [Development](#development)

## Features

### Git

#### Open in GitHub

Open the current file, repository, blame view, or commit history directly in GitHub. Supports both SSH and HTTPS remotes, including SSH remotes with a custom port. With a detached HEAD, links use the exact commit hash instead of a branch.

| Command | Description |
|---|---|
| Open in GitHub - File | Opens the file at the current line/selection |
| Open in GitHub - Repository | Opens the repository root |
| Open in GitHub - Blame | Opens the blame view for the current file |
| Open in GitHub - File History | Opens the commit history for the current file |
| Open in GitHub - Copy File Link | Copies the GitHub URL to clipboard |
| Open in GitHub - Copy Permalink | Copies a permanent link using the commit hash |

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.openInGitHub.remoteName` | `origin` | Git remote name |
| `toolkit.openInGitHub.defaultBranch` | `main` | Fallback branch |
| `toolkit.openInGitHub.useCurrentBranch` | `true` | Use the current local branch |
| `toolkit.openInGitHub.useLocalLine` | `true` | Include line numbers in the URL |

#### Git File History

View the full commit history and diffs for any file directly in VS Code. Renders a rich HTML panel with syntax-highlighted patches, showing each commit's author, date, message, and changes.

Available from:

- **Explorer context menu** — right-click a file and select **Toolkit: Git File History**
- **Editor context menu** — right-click inside an editor
- **Command Palette** — run **Toolkit: Git File History**

Reuses the same panel if the file is already open. Supports VS Code's built-in find widget (`Ctrl+F` / `Cmd+F`) inside the history view.

History is loaded in pages of 50 commits — files with a long history open instantly, and a **Load more** button at the bottom fetches the next page.

#### Git Blame (Inline Annotations)

Show git blame annotations for every line in the editor, similar to JetBrains IDEs. Displays author, date, and commit message inline before each line of code.

Toggle with **Toolkit: Toggle Git Blame** from the Command Palette.

**Features:**

- Annotations appear on **all lines at once** — not just the current line
- Consecutive lines from the same commit are grouped: only the first line shows the annotation, the rest stay clean
- Groups alternate between two subtle background colors to visually separate commits
- Hover over any line to see full commit details (hash, author, date, message)
- Annotations update automatically when switching files or saving
- Toggle on/off with the same command

#### Edit Commit Message & Reset HEAD

Edit the message of any commit in the repository history, or move HEAD to a previous commit, similar to JetBrains IDEs. Provides a **Commit History** tree view in the Source Control sidebar listing the most recent commits.

**Access:**

- **Source Control sidebar** — expand the **Commit History** section. Each commit shows inline icons:
  - **Pencil** — opens the edit panel (message, date, and per-file diff). Available on every commit.
  - **Reset arrow** — opens a quick picker to reset HEAD to that commit (Soft / Mixed / Hard). Hidden on the HEAD commit, since resetting HEAD to itself is a no-op.
  - **Fold-down arrow** — **Squash into Parent...** melds the commit with its parent (see below).
- **View title bar** — the cherry-pick icon runs **Cherry-pick from Branch...** (see below).
- **Command Palette** — run **Toolkit: Edit Commit Message** or **Toolkit: Reset HEAD to Commit...** when a commit is selected, or **Toolkit: Cherry-pick from Branch...** anytime.

**Squash into Parent:**

Click the fold-down icon on any commit (including HEAD) and pick the variant:

- **Fixup** — melds the commit into its parent keeping the **parent's** message (the classic "absorb my 'fix typo' commit").
- **Squash** — melds keeping **both** messages, concatenated.

Runs the same automated, cross-platform interactive rebase as message editing — with the same safeguards: rejected if a rebase is already in progress or the working tree is dirty, modal confirmation (history is rewritten — force push needed if already pushed), and automatic rollback if the rebase fails. Root commits and merge commits cannot be squashed.

**Cherry-pick from Branch:**

Pick a local branch, then one of the commits that branch has and the current branch doesn't (already cherry-picked, patch-equivalent commits are filtered out), and it is applied onto HEAD with `git cherry-pick`. On conflicts, the cherry-pick is left in the standard in-progress state so you can resolve it with VS Code's regular merge UI — or abort with `git cherry-pick --abort`.

**Workflow:**

1. Select a commit in the tree view and click the pencil icon.
2. A panel opens showing the commit info, a text area with the full message, the changed files, and the per-file diff.
3. From here you can either:
   - Edit the message, optionally change the date (see below), then click **Apply** (or press `Ctrl+Enter`) to save, or **Discard** to cancel.
   - Move HEAD to that commit using **Reset HEAD here: Soft / Hard** (see below). For all three modes including `--mixed`, use the inline reset icon in the tree view instead.
4. The commit history refreshes automatically after a successful edit or reset.

**Panel contents:**

- **Commit info** — hash, author, and date.
- **Commit message** — editable text area (supports multi-line).
- **Change date** — optional checkbox with a date picker to modify the commit timestamp.
- **Reset HEAD here** — Soft / Hard buttons (hidden when the selected commit is already HEAD). For `--mixed`, use the inline reset icon in the tree view.
- **Changed Files** — list of files affected by the commit with status (M/A/D), directory and file name, and per-file addition/deletion counts. Click a file to scroll to its diff.
- **Changes** — diffs rendered per file with syntax-highlighted patches (additions in green, deletions in red, hunk headers in blue). Diffs are loaded lazily as you scroll into view, so the panel opens instantly even for commits with hundreds of changed files. Files with more than 5,000 modified lines and binary files are not auto-loaded — they show a "Load diff" button or a "Binary file" placeholder.

**Changing the commit date:**

Check the **Change date** box to enable the date picker. The date is pre-filled with the current commit timestamp. When you apply, the commit will be amended (or rebased for older commits) with the new date.

- **HEAD commit** — uses `git commit --amend --date`.
- **Older commits** — uses an automated `git rebase -i` that stops at the commit, amends it with the new date, then continues.

**How edit message works:**

- **HEAD commit** — uses `git commit --amend`.
- **Older commits** — uses an automated `git rebase -i` that rewords only the selected commit.

**How reset works:**

- **Soft** — runs `git reset --soft <hash>`. Moves HEAD to the selected commit; all changes from the discarded commits remain in the index (staged), so you can recommit them as a single commit. Working tree is untouched.
- **Mixed** — runs `git reset --mixed <hash>` (git's default reset). Moves HEAD to the selected commit; later changes are kept in the working tree but unstaged. Available from the inline reset icon in the tree view.
- **Hard** — runs `git reset --hard <hash>`. Moves HEAD to the selected commit and **discards** all later commits **and** any uncommitted changes in the working tree.

All three actions show a modal confirmation before running. The Hard button in the panel is rendered in red as a visual reminder that it is destructive, and the inline reset picker marks the Hard option with a warning icon.

**Safeguards:**

- If there are **staged changes** when editing HEAD's message, the operation is rejected to prevent accidentally including them in the amend.
- If a **rebase is already in progress** in the repository (e.g. stopped on a conflict), editing older commits is rejected — your rebase is never touched.
- If the **working tree is dirty** when editing an older commit's message, the operation is rejected (rebase requires a clean tree). Commit or stash your changes first.
- If the automated rebase fails midway, it is **rolled back automatically** so the repository is left exactly as it was.
- Both **edit message** and **reset** rewrite git history. If the commits have already been pushed, a force push will be required.
- **Reset --hard cannot be easily undone** — the modal confirmation is the only check. If in doubt, use Soft instead and decide what to do with the staged changes afterwards.

#### Expand Changed Files

Expand only the folders in the file explorer that contain git-modified, added, or untracked files. Useful for quickly navigating to the parts of the project you're actively working on without expanding the entire tree.

**Access:**

- **Explorer context menu** — right-click a folder and select **Toolkit: Expand Changed Files** to expand only within that folder.
- **Command Palette** — run **Toolkit: Expand Changed Files** to expand across the entire workspace.

Folders are expanded from shallowest to deepest, revealing the full path to every changed file. Deleted files are ignored since they no longer exist on disk. Renames are handled by expanding to the new file location.

#### Stage Changes

Stage files or folders directly from the file explorer context menu. Works with single items, multiple selections, and folders (staged recursively).

**Access:**

- **Explorer context menu** — right-click a file, folder, or multi-selection and select **Toolkit: Stage Changes**.

Supports multi-select — select several files and/or folders with `Cmd+Click` or `Shift+Click`, right-click, and stage them all at once. In multi-root workspaces the selection can span repositories: targets are grouped and staged per repository.

#### Compare with Branch

Diff the active file against the same file in any other local branch.

Run **Toolkit: Compare with Branch...** from the Command Palette or the editor context menu. A quick pick shows every local branch (sorted by most recent commit, excluding the current one). Picking one opens a diff editor: `file (branch)` on the left (read-only) and your working-tree copy on the right.

If the file doesn't exist on the chosen branch — or the file is untracked / outside a git repo — a warning explains why and the diff is not opened.

#### Compare Project / Folder with Branch

Preview a merge before you make it: diff **every** changed file at once against any other local branch.

- Run **Toolkit: Compare Project with Branch...** from the Command Palette — or right-click any folder in the Explorer — to compare the whole project.
- Right-click a folder in the Explorer and choose **Compare Folder with Branch...** to scope the comparison to that folder.

A quick pick shows the local branches (excluding the current one). Picking one opens a single multi-file diff view listing each changed file: its content at the merge-base on the left, your working-tree copy on the right — so you see exactly what your side has changed since the branches diverged, including unsaved edits. Added files show an empty left side, deleted files an empty right side.

If there are no differences a message says so, and above 100 changed files a confirmation is asked first. Untracked (never-committed) files are not included.

#### Peek Last Commit on Line

Hover any line in a tracked file to see the **full commit** that last touched it: short SHA, author, relative date, and the complete message (subject + body). A `Show full commit` link in the hover opens the entire `git show` output (message + diff) in a new editor.

| Command | Description |
|---|---|
| (hover, automatic) | Hover any line — the hover appears alongside any other ones for that range |
| Toolkit: Show Last Commit for Line | Opens the full commit for the line under the cursor without going through the hover |

**Behavior:**

- Backed by `git blame --porcelain` for the active line, with the full message read via `git log -1 --format=%B`.
- Results are cached per file version; the cache is invalidated on every document edit.
- Lines with uncommitted changes show a short *"Not committed yet"* message — no commit link is rendered.
- Coexists with the inline blame annotations; both hovers stack.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.peekCommit.hover.enabled` | `true` | Toggle the peek-commit hover |
| `toolkit.peekCommit.hover.languages` | `["*"]` | Languages where the hover is active (reload required after change) |

### Package Management

#### NuGet Package Manager

Manage NuGet packages for .NET projects directly from VS Code. Supports browsing, installing, updating, and uninstalling packages using the NuGet V3 API. Requires the `dotnet` CLI on `PATH` — the panel shows a clear error message if it isn't installed.

**Access:**

- **Activity Bar** — click the NuGet icon in the sidebar to see all `.csproj` / `.fsproj` / `.vbproj` projects in the workspace. Click a project to open its package manager.
- **Explorer context menu** — right-click a project file and select **Manage NuGet Packages**.
- **Editor context menu** — right-click inside an open project file (also offers **NuGet Vulnerabilities**).
- **Command Palette** — run **Toolkit: Manage NuGet Packages** to pick a project file.

**Package Manager panel:**

| Tab | Description |
|---|---|
| Browse | Search the NuGet gallery with pagination (Load More) |
| Installed | View all installed packages and their status |
| Updates | View packages with available updates, with bulk update support |

Click any package to view its details: all versions, description, dependencies, vulnerabilities, license, and project URL.

In the **Installed** and **Updates** tabs, the **Latest** column is tinted by semver bump severity (red for major, orange for minor, yellow for patch) so the riskier updates stand out at a glance. Versions pinned to an exact value in the project file show a lock icon instead of the latest version, since they will not be auto-updated.

**Solution Overview:**

Click the list icon in the sidebar title bar (or run **Toolkit: NuGet Solution Overview**) to open a summary table of all projects and their packages. Click **Load Package Versions** to check for updates across the entire solution — outdated packages are highlighted with a red "No" badge, and the **Latest** column uses the same semver-severity colour and lock icon as the per-project panel. Once versions are loaded, click **Update All** to update every outdated package across all projects in one go.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.nuget.sources` | `[nuget.org]` | NuGet V3 package sources (supports private feeds with auth) |
| `toolkit.nuget.requestTimeout` | `10000` | HTTP timeout in milliseconds |
| `toolkit.nuget.defaultPrerelease` | `false` | Include prerelease packages by default |

> Security note: the `authorizationHeader` of a source is only ever sent to that source's own origin (scheme + host + port). Endpoint URLs advertised by the registry that point to a different host are fetched without credentials.

#### NPM Package Manager

Manage npm packages for Node.js projects directly from VS Code. Supports browsing, installing, updating, and uninstalling packages using the npm registry API. Automatically detects and uses the project's package manager — **npm**, **yarn**, or **pnpm** — based on the lock file present in the project directory.

**Access:**

- **Activity Bar** — click the npm icon in the sidebar to see all `package.json` projects in the workspace. Click a project to open its package manager.
- **Explorer context menu** — right-click a `package.json` file and select **Manage npm Packages**.
- **Editor context menu** — right-click inside an open `package.json` (also offers **npm Audit**).
- **Command Palette** — run **Toolkit: Manage npm Packages** to pick a project.

**Package Manager panel:**

| Tab | Description |
|---|---|
| Browse | Search the npm registry with pagination (shows popular packages by default) |
| Installed | View all installed packages with their dependency type (dep/dev) |
| Updates | View packages with available updates, with bulk update support |

Click any package to view its details: all versions, description, author, license, homepage, keywords, dependencies, peer dependencies, and deprecation warnings. When installing a new package, a checkbox allows choosing between regular and dev dependency.

In the **Installed** and **Updates** tabs, the **Latest** column is tinted by semver bump severity (red for major, orange for minor, yellow for patch). Versions pinned to an exact value in `package.json` show a lock icon instead of the latest version, since they will not be auto-updated.

**Workspace Overview:**

Click the list icon in the sidebar title bar (or run **Toolkit: npm Workspace Overview**) to open a summary table of all projects and their packages. Click **Load Package Versions** to check for updates across the entire workspace — outdated packages are highlighted with a red "No" badge, and the **Latest** column uses the same semver-severity colour and lock icon as the per-project panel. Once versions are loaded, click **Update All** to update every outdated package across all projects in one go.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.npm.sources` | `[npmjs.org]` | npm registry sources (supports private registries with auth) |
| `toolkit.npm.requestTimeout` | `10000` | HTTP timeout in milliseconds |
| `toolkit.npm.defaultPrerelease` | `false` | Include prerelease packages by default |

#### NPM Intellisense

Autocompletes npm module names in `import` and `require()` statements. Reads your project's `package.json` and suggests matching packages as you type.

Works in TypeScript, JavaScript, JSX, and TSX files by default. Supports monorepos (recursive `package.json` lookup), scoped packages (`@scope/pkg`), and multi-root workspaces.

**Import command:**

Run **Toolkit: NPM Intellisense - Import Module** from the Command Palette to pick a package and insert an `import` or `require` statement at the cursor position.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.npmIntellisense.languages` | `[typescript, javascript, ...]` | Language IDs to activate on (requires reload) |
| `toolkit.npmIntellisense.scanDevDependencies` | `false` | Include devDependencies in completions |
| `toolkit.npmIntellisense.recursivePackageJsonLookup` | `true` | Find nearest package.json instead of workspace root |
| `toolkit.npmIntellisense.packageSubfoldersIntellisense` | `false` | (Experimental) Suggest subfolders of packages |
| `toolkit.npmIntellisense.showBuiltinModules` | `false` | Include built-in Node.js modules (fs, path, etc.) |
| `toolkit.npmIntellisense.excludePackages` | `[]` | Package names to exclude from completions |
| `toolkit.npmIntellisense.importES6` | `true` | Use `import` syntax instead of `require()` |
| `toolkit.npmIntellisense.importQuotes` | `'` | Quote style for the import command |
| `toolkit.npmIntellisense.importLinebreak` | `;\n` | Line ending after the import statement |
| `toolkit.npmIntellisense.importDeclarationType` | `const` | Declaration type for `require()` imports |

#### Dependency Vulnerability Audit

Check a project's dependencies for known vulnerabilities using each ecosystem's official tool — no extra services or accounts.

| Command | Tool used |
|---|---|
| Toolkit: npm Audit | `npm audit` / `yarn audit` / `pnpm audit` (auto-detected from the lock file) |
| Toolkit: NuGet Vulnerabilities | `dotnet list package --vulnerable --include-transitive` |

**Access:**

- **Explorer context menu** — right-click a `package.json`, a `.csproj`/`.fsproj`/`.vbproj`, or a **solution** (`.sln`/`.slnx`) to audit every project in it at once
- **Editor context menu** — also available when right-clicking inside an open `package.json` or project file
- **Command Palette** — run either command; with several projects in the workspace, a picker asks which one

**Results:** findings are listed in a quick pick sorted by severity (critical → high → moderate → low), showing the affected range, whether it is a transitive dependency, and the concrete fix when the tool names one (e.g. `fix: mocha@11.0.0 (major)` — the direct dependency to update, which is what actually resolves transitive vulnerabilities). When auditing a solution, each finding is tagged with the project it belongs to — the same advisory in two projects shows once per project. Picking an entry opens its security advisory in the browser. A clean project shows a confirmation message instead.

**Apply fixes:** for npm and pnpm projects, the first entry of the quick pick is **Apply fixes** — it runs the ecosystem's official remediation (`npm audit fix` / `pnpm audit --fix`) and re-audits so you can see what's left (fixes requiring a major bump are not applied automatically; update those from the package manager panel). yarn classic has no fix command, so the entry is not shown there. For NuGet there is no official auto-fix either — remediate by updating the affected package from the [NuGet panel](#nuget-package-manager).

> Note: NuGet requires the project to be restored (`dotnet restore`) — the vulnerability data comes from the restore graph.

### Code Editing

#### Change Case

Convert selected text between 13 case formats. Supports multiple cursors and multi-line selections.

Open the picker with **Toolkit: Change Case...** from the Command Palette — it shows a live preview of each transformation for the current selection.

| Command | Example |
|---|---|
| camelCase | `my variable` → `myVariable` |
| snake_case | `my variable` → `my_variable` |
| PascalCase | `my variable` → `MyVariable` |
| CONSTANT_CASE | `my variable` → `MY_VARIABLE` |
| kebab-case | `my variable` → `my-variable` |
| Title Case | `my variable` → `My Variable` |
| lowercase | `My Variable` → `my variable` |
| UPPERCASE | `my variable` → `MY VARIABLE` |
| dot.case | `my variable` → `my.variable` |
| path/case | `my variable` → `my/variable` |
| Sentence case | `my variable` → `My variable` |
| sWAP cASE | `Hello` → `hELLO` |
| no case | `myVariable` → `my variable` |

Also available from the editor right-click menu when text is selected.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.changeCase.includeDotInCurrentWord` | `false` | Include dots when expanding the current word under the cursor (no selection). Useful when working with dotted identifiers like `foo.bar.baz` |

#### Slugify

Generate clean URL slugs from selected text. Handles unicode normalization, diacritics removal, and special character mapping.

- `Café & Résumé` → `cafe-and-resume`
- `myVariableName` → `my-variable-name`
- `Ñoño más allá` → `nono-mas-alla`

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.slug.separator` | `-` | Separator character |
| `toolkit.slug.decamelize` | `true` | Split camelCase words |
| `toolkit.slug.lowercase` | `true` | Convert to lowercase |

#### Move Symbol Up / Down

Move functions, methods, classes, and other code symbols up or down past their siblings — similar to JetBrains' "Move Statement" feature. Swaps the symbol under the cursor with the adjacent one above or below, preserving spacing between them.

Works with any language that has a symbol provider (language server) installed — including TypeScript, JavaScript, C#, Go, Python, Rust, Java, and more.

**Context-aware:** if the cursor is inside a method of a class, it moves the method within the class. If the cursor is on a top-level function, it moves it among other top-level declarations.

| Command | Default Keybinding |
|---|---|
| Toolkit: Move Symbol Up | `Cmd+Shift+Up` |
| Toolkit: Move Symbol Down | `Cmd+Shift+Down` |

#### Add / Remove Braces

Code actions available via `Ctrl+.` (or `Cmd+.`) in TypeScript, JavaScript, TSX, JSX, C#, Razor, Java, C, and C++ files:

- **Add braces** — wraps a braceless control statement body in `{ }`. Appears when the cursor is on (or inside) an `if`, `else`, `else if`, `for`, `foreach`, or `while` without braces.
- **Remove braces** — removes `{ }` from a single-statement block. Appears when the block contains exactly one statement and is not followed by `else` on the same line.

Works with and without semicolons, respects the editor's indentation settings (spaces/tabs, tab size), and handles multi-line bodies including method chaining. C# files use Allman brace style (opening brace on its own line).

#### Convert Import Paths

Convert between alias imports and relative imports using path mappings from `tsconfig.json` or `jsconfig.json`. Supports the `extends` chain and both wildcard (`@server/*`) and exact (`@utils`) aliases.

| Command | Description |
|---|---|
| Convert Imports to Relative Paths | Convert all alias imports in the current file to relative paths |
| Convert Imports to Alias Paths | Convert all relative imports in the current file to alias paths |

**Example — alias to relative:**

```typescript
// tsconfig.json: { "paths": { "@lib/*": ["src/lib/*"] } }

// File: src/lib/orders/controller.ts
import * as store from '@lib/orders/store'
// → import * as store from './store'

import { search } from '@lib/catalog/helpers'
// → import { search } from '../catalog/helpers'
```

**Example — relative to alias:**

```typescript
import * as store from './store'
// → import * as store from '@lib/orders/store'

import { search } from '../catalog/helpers'
// → import { search } from '@lib/catalog/helpers'
```

**Code actions:**

When the cursor is on an import line, a code action (lightbulb / `Ctrl+.`) offers the conversion in the appropriate direction — alias to relative or relative to alias.

Works with `import ... from`, `export ... from`, `require()`, and dynamic `import()`. Supported languages: TypeScript, JavaScript, TSX, JSX, Vue, Svelte. Both commands are available from the editor context menu in those languages, and from the Command Palette.

#### Type-Only Imports

Surface imports whose bindings are used only as types and offer a one-click fix to convert them to `import type ...`. Similar to JetBrains' "Import can be type-only" inspection — runs automatically as you edit, no command needed.

Catches the runtime error you get under ESM when a type-only binding is imported as a value (`SyntaxError: The requested module '...' does not provide an export named 'X'`).

**Example:**

```typescript
import { Foo } from './foo'
//     ^^^ flagged — only used in `: Foo` below

function bar(x: Foo): void {}
```

A code action (lightbulb / `Ctrl+.`) on the underlined `import` keyword offers:

| Action | Effect |
|---|---|
| Convert to type-only import | Rewrites a single declaration to `import type ...` |
| Convert all N type-only imports in file | Bulk fix when the file has more than one |

**Detection rules (conservative — false negatives over false positives):**

The whole declaration is flagged only when **every** imported binding (default, namespace, and named) is used **only** in unambiguous type positions: type annotations, generics, `as Type` / `satisfies`, `interface X extends Y`, `class X implements Y`, `typeof X` inside a type, qualified type references (`Foo.Bar`).

It will **not** flag — even if part of the import looks type-only — when any binding appears as a value: `Foo()`, `new Foo()`, `class extends Foo`, `@Foo`, `<Foo />`, `typeof Foo === '...'` in an expression, property/element access. Already-`import type` declarations and side-effect imports (`import './setup'`) are ignored.

Supported languages: TypeScript and TSX. **Analyze Type-Only Imports in Current File** (a verbose, on-demand pass) is available from the editor context menu in those languages.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.typeOnlyImports.enabled` | `true` | Enable detection of imports usable as `import type` |
| `toolkit.typeOnlyImports.severity` | `hint` | Diagnostic severity: `error`, `warning`, `information`, or `hint` |

> Tip: `hint` shows as the same near-invisible three dots that VS Code uses for unused-variable hints — pair it with the [Diagnostic Highlight](#diagnostic-highlight) feature above to make hints visible, or set `severity` to `warning` for a standard squiggly underline.

#### Sum Numbers in Selection

Sum the leading number of each line in the selected text. Useful for tallying time estimates, budget items, or any list where each row begins with a number.

Run **Toolkit: Sum Numbers in Selection** from the Command Palette or the editor right-click menu. The total appears in a notification with a **Copy** button — the selection is never modified.

- Both `,` and `.` are accepted as the decimal separator.
- Only the first number on each line is used; numbers inside the line description are ignored.
- Lines that don't start with a number are skipped.

**Example selection:**

```
3 h Sprint planning
1,5 h Architecture review
0,75 h Daily standups for the week
2 h QA pass on release candidate 2
```

→ notification: `sum of 4 numbers = 7,25`.

#### Sort, Dedupe & Transform Lines

Operate on the lines under the current selection (or the whole document if nothing is selected). Each operation is available as a dedicated command, and a unified **Toolkit: Lines...** quick pick lists them all when you don't remember the exact name.

Available from:

- **Editor context menu** — when there is an active selection, right-click and pick **Toolkit: Lines...**
- **Command Palette** — run any of the individual commands or **Toolkit: Lines...** for the picker

**Operations:**

| Command | Description |
|---|---|
| Sort Lines - Ascending | A → Z, case-sensitive |
| Sort Lines - Descending | Z → A, case-sensitive |
| Sort Lines - Ascending (Case-Insensitive) | A → Z ignoring case |
| Sort Lines - Descending (Case-Insensitive) | Z → A ignoring case |
| Sort Lines - By Length | Shorter lines first |
| Sort Lines - By Length (Descending) | Longer lines first |
| Sort Lines - Numerically | Sort by the first number found on each line |
| Reverse Lines | Flip the line order |
| Shuffle Lines | Random order (Fisher-Yates) |
| Remove Duplicate Lines | Drop repeated lines, keep first occurrence |
| Remove Duplicate Lines (Case-Insensitive) | Same, ignoring case |
| Remove Empty Lines | Drop blank and whitespace-only lines |
| Trim Trailing Whitespace (Selection) | Trim trailing spaces and tabs on each line |

**Behavior:**

- If there is a non-empty selection, the operation applies to the full lines touched by the selection. Each selection block is processed independently (multi-cursor friendly).
- If every selection is empty, the operation applies to the whole document.
- Line endings (`\n` vs `\r\n`) are preserved.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.lines.naturalSort` | `true` | Use natural sort (so `item2` comes before `item10`) when sorting alphabetically |
| `toolkit.lines.dedupeKeepLast` | `false` | When removing duplicates, keep the last occurrence instead of the first |

#### Align by Character

Vertically align consecutive lines by the first occurrence of a delimiter, inserting spaces so the delimiter appears in the same column on every line.

Useful for lining up assignment blocks, object keys, type annotations, trailing comments, or arrow functions.

**Example — Align by `=`:**

```ts
const FOO_BAR = 1;
const SHORT = 2;
const LONG_NAME = 3;
```

→

```ts
const FOO_BAR   = 1;
const SHORT     = 2;
const LONG_NAME = 3;
```

**Commands:**

| Command | Description |
|---|---|
| Align by Character... | Quick pick with common delimiters + "Other..." (custom delimiter) |
| Align by = | Assignment |
| Align by : | Object key / type annotation |
| Align by , | Comma |
| Align by => | Arrow function |
| Align by // | Line comment |

Available from:

- **Editor context menu** — with an active selection, right-click and pick **Toolkit: Align by Character...**
- **Command Palette** — any of the individual commands or the dispatcher

**Behavior:**

- Operates on the lines touched by the current selection. Needs at least two selected lines.
- Aligns by the **first** occurrence of the delimiter on each line.
- Aligning by `=` skips compound operators (`==`, `===`, `+=`, `=>`, `??=`, …) — they are never split, and lines whose only `=` is part of one are left untouched.
- Lines that don't contain the delimiter are left untouched.
- Leading indentation and the suffix after the delimiter are preserved (leading whitespace on the suffix is normalized).

**Settings:**

Both settings accept a `default` key and optional per-delimiter overrides.

| Setting | Default | Description |
|---|---|---|
| `toolkit.align.spacesBefore` | `{ "default": 1, ":": 0, ",": 0 }` | Spaces between the (trimmed) prefix and the delimiter |
| `toolkit.align.spacesAfter` | `{ "default": 1 }` | Spaces between the delimiter and the (trimmed) suffix |

Example — to enforce zero spaces before `=>`:

```json
"toolkit.align.spacesBefore": {
  "default": 1,
  ":": 0,
  ",": 0,
  "=>": 0
}
```

#### Toggle Quotes

Cycle the quotes around the string literal under the cursor: `'` → `"` → `` ` `` → `'`. Escapes and unescapes the relevant quote characters automatically.

**Example:**

```ts
const s = 'It\'s "great"'
```

→ Toggle (now `"`):

```ts
const s = "It's \"great\""
```

→ Toggle (now `` ` ``):

```ts
const s = `It's "great"`
```

**Commands:**

| Command | Description |
|---|---|
| Toggle Quotes | Cycles `'` → `"` → `` ` `` → `'` |
| Quote as Single | Force `'…'` |
| Quote as Double | Force `"…"` |
| Quote as Backtick | Force `` `…` `` |

Available from:

- **Editor context menu** — right-click and pick **Toolkit: Toggle Quotes**
- **Command Palette** — any of the four commands

**Behavior:**

- Works on the string that encloses the cursor on the current line. Multi-cursor supported (each cursor processed independently).
- Detects escaped quotes (`\'`, `\"`, `` \` ``) so they don't end the literal prematurely.
- When converting **to** backtick, any literal `${` in the content is escaped to `\${` so it does not become a template interpolation.
- When converting **from** a backtick literal that contains an unescaped `${...}`, the command is aborted with a warning — converting it would silently drop the interpolation expression.
- Other escape sequences (`\n`, `\t`, `\\`, `\uXXXX`, etc.) are preserved as-is.
- String detection is single-line and language-agnostic. Multi-line template literals or exotic forms (Python triple-quoted, C# verbatim `@"..."`, raw strings, etc.) are not detected — select the string manually if needed.

**Per-language quote sets:**

The toggle cycles only through the quotes that are valid for the current language. Defaults:

| Language id | Cycle |
|---|---|
| `typescript`, `typescriptreact`, `javascript`, `javascriptreact` | `'` → `"` → `` ` `` |
| `csharp`, `java`, `c`, `cpp`, `rust`, `go` | `"` only (toggle is a no-op) |
| `python`, `yaml`, `shellscript` | `'` ↔ `"` |
| `json`, `jsonc` | `"` only |
| _anything else_ | `'` ↔ `"` |

Override via the `toolkit.toggleQuotes.languageQuotes` setting. Example — to enable single + double + backtick in PHP:

```json
"toolkit.toggleQuotes.languageQuotes": {
  "php": ["'", "\"", "`"]
}
```

The `default` key applies to language ids not explicitly listed. If a force command (e.g. `Quote as Backtick`) targets a quote that is not in the language's allowed list, a confirmation prompt is shown before proceeding.

#### Transform Selection

A toolbox of encode/decode and hash operations over the current selection. Available as individual commands and through a unified **Toolkit: Transform Selection...** quick pick.

**Operations:**

| Operation | Description |
|---|---|
| Base64 Encode / Decode | UTF-8 ↔ Base64 |
| Base64 URL Encode / Decode | UTF-8 ↔ URL-safe Base64 (no padding) |
| URL Encode / Decode | `encodeURIComponent` / `decodeURIComponent` |
| HTML Encode / Decode | Escape `& < > " '`; decode named (`&amp;`) and numeric (`&#65;`, `&#x41;`) entities |
| Hex Encode / Decode | UTF-8 ↔ hex string (case-insensitive on decode, accepts whitespace) |
| MD5 / SHA-1 / SHA-256 / SHA-512 | Hex digest of the selection |
| JWT Decode | Decode header + payload, open the result in a new editor |
| JSON to YAML | Convert a JSON selection to YAML (2-space indentation) |
| YAML to JSON | Convert a YAML selection to pretty-printed JSON |
| JSON Prettify / Minify | Re-indent with 2 spaces / strip all whitespace |
| JSON Sort Keys | Recursively sort object keys (pretty-printed output) |

Available from:

- **Editor context menu** — with a selection, right-click and pick **Toolkit: Transform Selection...**
- **Command Palette** — any of the individual commands or the dispatcher

**Behavior:**

- All operations require a non-empty selection. Multi-selection is supported for string-to-string operations.
- Invalid input (malformed Base64, non-hex characters, broken percent encoding, malformed JWT, invalid JSON/YAML) triggers a warning and leaves the selection untouched.
- Hashes always output lowercase hex.
- JWT Decode opens a new untitled `jsonc` editor with the formatted header, payload and signature. The signature is **not** verified.
- The JSON operations (Prettify / Minify / Sort Keys / JSON to YAML) also appear in the editor context menu of JSON files when text is selected; YAML to JSON appears in YAML files.
- The YAML converter has no external dependencies and covers the block-style subset typical of config files, plus flow collections (`[a, b]` / `{k: v}`), quoted scalars, and comments. Unsupported YAML constructs — block scalars (`|`, `>`), anchors/aliases, tags, multiple documents — are rejected with a clear message instead of being converted incorrectly.

#### Insert UUID / Timestamp / Random

Insert freshly-generated values at the cursor position (or replace the selection if any). Multi-cursor: **each cursor receives its own generated value** — no duplicates.

**Commands:**

| Command | Output |
|---|---|
| Insert... | Quick pick of all generators |
| Insert UUID v4 | Random UUID, e.g. `f47ac10b-58cc-4372-a567-0e02b2c3d479` |
| Insert UUID v7 | Time-ordered UUID (RFC 9562), e.g. `01893f81-a3a8-7000-b2bb-7a76e84d0a5d` |
| Insert ULID | Crockford Base32, time-ordered, e.g. `01ARYZ6S41ABCDEFGHJKMNPQRS` |
| Insert ISO Timestamp | `2026-05-26T17:30:00.000Z` |
| Insert Unix Epoch (seconds) | `1748278800` |
| Insert Unix Epoch (milliseconds) | `1748278800000` |
| Insert Random Hex... | Prompts for byte count; output is 2× hex chars |
| Insert Random Base64... | Prompts for byte count; URL-safe Base64 without padding |

Available from:

- **Editor context menu** — right-click and pick **Toolkit: Insert...**
- **Command Palette** — any of the individual commands or the dispatcher

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.insert.randomHexBytes` | `16` | Default byte count for Random Hex (output is `2 ×` this many chars) |
| `toolkit.insert.randomBase64Bytes` | `16` | Default byte count for Random Base64 (URL-safe, no padding) |
| `toolkit.insert.uuidUppercase` | `false` | Emit UUID v4 / v7 in uppercase. ULID is always uppercase per its spec |

#### Timestamp Converter & Hover

Convert timestamps in the selection between formats (Unix seconds / ms / µs ↔ ISO 8601), and hover any plausible epoch number anywhere in the workspace to see what date it represents.

**Commands:**

| Command | Description |
|---|---|
| Convert Timestamp... | Auto-detects the input format and shows a quick pick with each target format (with a live preview) |
| Timestamp to ISO (UTC) | → ISO 8601 in UTC, e.g. `2024-03-15T12:34:56.789Z` |
| Timestamp to ISO (Local) | → ISO 8601 with local offset, e.g. `2024-03-15T13:34:56.789+01:00` |
| Timestamp to Unix Seconds | → integer seconds |
| Timestamp to Unix Milliseconds | → integer milliseconds |
| Show Timestamp Info | Quick pick of every format + a relative description (`3 days ago`). Picking copies to the clipboard; the document is not modified |

Available from:

- **Editor context menu** — with a selection, right-click and pick **Toolkit: Convert Timestamp...**
- **Command Palette** — any of the individual commands

**Input format detection:**

| Input | Treated as |
|---|---|
| 10 digits (optionally signed) | Unix seconds |
| 13 digits | Unix milliseconds |
| 16 digits | Unix microseconds (rounded to ms) |
| Other digit-only lengths | First plausible reading (seconds → ms → µs) whose date lands between 1971 and 2150 — e.g. 9-digit values are 1973–2001 epochs in seconds. Falls back to milliseconds |
| ISO 8601-like (date with optional time / offset) | ISO |

**Hover:**

Place the cursor over a 10-, 13- or 16-digit number anywhere in any file. If the value falls within the configured year range, a hover appears with the decoded UTC and local ISO timestamps and a relative description.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.timestamp.hover.enabled` | `true` | Toggle the timestamp hover |
| `toolkit.timestamp.hover.languages` | `["*"]` | Languages where the hover is active (reload required after change) |
| `toolkit.timestamp.hover.minYear` | `1990` | Lower bound for considering a number to be a timestamp |
| `toolkit.timestamp.hover.maxYear` | `2100` | Upper bound for considering a number to be a timestamp |

#### UUID / ULID Hover

Hover any UUID or ULID — in logs, database dumps, JSON payloads, or code — to see what it is and, for time-ordered formats, **when it was created**.

| Identifier | Hover shows |
|---|---|
| UUID v7 / ULID | Kind + embedded creation time (UTC, local, and relative — e.g. `2 years ago`) |
| UUID v1 / v6 | Kind + creation time decoded from the Gregorian clock |
| UUID v4 | "random" — no embedded timestamp |
| UUID v3 / v5 | "name-based (MD5 / SHA-1)" |
| Nil / non-RFC variants | Identified as such |

**Behavior:**

- Works in any file type; matching is case-insensitive and requires the identifier to stand alone (it won't trigger inside a longer token).
- ULID detection is plausibility-checked: 26-character Base32 strings whose embedded date falls outside 2010–2120 are ignored, so random identifiers don't produce bogus hovers.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.uuidHover.enabled` | `true` | Toggle the UUID/ULID hover |
| `toolkit.uuidHover.languages` | `["*"]` | Languages where the hover is active (reload required after change) |

#### Format Markdown Table

Align the pipes of Markdown tables so the source reads as cleanly as the rendered output.

```markdown
| Name | Age |
|---|---|
| Alice | 30 |
| Bob | 9 |
```

→

```markdown
| Name  | Age |
| ----- | --- |
| Alice | 30  |
| Bob   | 9   |
```

Run **Toolkit: Format Markdown Table** from the Command Palette or the editor context menu (Markdown files). With no selection it formats the table under the cursor; with a selection it formats every table the selection touches.

The inverse also exists: **Toolkit: Compact Markdown Table** strips all alignment padding — single spaces around each cell and minimal separators (`---`, alignment colons kept). Renders identically, uses fewer characters, and keeps diffs clean: in an aligned table, widening one cell re-pads the whole column (the diff touches every row); in compact form each change touches only its own row.

**Behavior:**

- GFM alignment markers (`:--`, `:-:`, `--:`) are preserved and applied to the cell content — header included, like Prettier.
- Escaped pipes (`\|`) and pipes inside inline code (`` `a|b` ``) don't break cells.
- Rows with missing cells are padded with empty ones; leading indentation (tables inside lists) is preserved.
- Tables with or without surrounding pipes are recognized; the output always uses surrounding pipes.

#### JSON to TypeScript / C# Types

Generate type definitions from a JSON sample. The source is the current selection if non-empty, otherwise the clipboard.

**Commands:**

| Command | Output |
|---|---|
| JSON to Type... | Dispatcher: pick the target language + style |
| JSON to TypeScript Interface | `interface Root { ... }` |
| JSON to TypeScript Type | `type Root = { ... }` |
| JSON to C# Record | `public record Root(int Id, string Name)` |
| JSON to C# Class | `public class Root { public int Id { get; set; } }` |

Available from the **Command Palette** — the dispatcher or any of the individual commands (they also work without a selection, reading the JSON from the clipboard) — and from the **editor context menu of JSON files**.

**Behavior:**

- Nested objects become their own named types, derived from the property key (singularized for array items).
- Arrays of objects merge field shapes; fields missing in some samples are emitted as `?` (TS) or nullable (C#).
- Numbers are inferred as integer or float; integers beyond `Int32.MaxValue` become `long` in C#.
- The output replaces the JSON selection in place, or opens in a new editor when the JSON comes from the clipboard. If the document changed (or was closed) while the name prompt was open, the result opens in a new editor instead of overwriting anything.

**Example input:**

```json
{
  "id": 1,
  "name": "Alice",
  "tags": ["admin", "user"],
  "address": { "street": "Main", "zip": 12345 }
}
```

**TypeScript interface (default):**

```ts
interface User {
  id: number;
  name: string;
  tags: string[];
  address: Address;
}

interface Address {
  street: string;
  zip: number;
}
```

**C# record (positional, default):**

```csharp
public record User(int Id, string Name, IReadOnlyList<string> Tags, Address Address);

public record Address(string Street, int Zip);
```

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.jsonToType.extractNestedTypes` | `true` | Emit a named type for each nested object instead of inlining |
| `toolkit.jsonToType.typescript.semicolons` | `true` | Terminate TypeScript fields with `;` |
| `toolkit.jsonToType.csharp.collectionType` | `IReadOnlyList` | One of `IReadOnlyList`, `List`, `IEnumerable`, `array` |
| `toolkit.jsonToType.csharp.recordStyle` | `positional` | `positional` (`record X(int Y)`) or `withProperties` |
| `toolkit.jsonToType.csharp.useNullable` | `true` | Mark optional/nullable fields with `?` |

**Limitations:**

- Only strict JSON is accepted (no JSON5, comments, trailing commas).
- All strings are inferred as `string` — no format inference (no auto-detection of dates, UUIDs, etc.).
- Mixed-type arrays (e.g. `[1, "a"]`) degrade to `unknown[]` / `IReadOnlyList<object>`.

### Code Generation & Refactoring

#### New C# File

Create C# files from templates with automatic namespace detection, using statements, and file-scoped namespace support. Available from the explorer right-click menu on any folder via the **New C#** submenu.

| Group | Templates |
|---|---|
| **Types** | Class, Interface, Enum, Struct, Record, Record Struct |
| **ASP.NET Core** | Controller, API Controller, Razor Page, Minimal API Endpoint, Middleware |
| **Blazor** | Blazor Component, Blazor Page |
| **Test** | xUnit Test, NUnit Test, MSTest |
| **Resources** | Resource File |

Also available from the Command Palette under the **New C#** category.

**Smart features:**

- **Namespace detection** — reads `<RootNamespace>` from the nearest `.csproj` and appends subdirectory segments automatically.
- **File-scoped namespaces** — generates `namespace X;` syntax by default for .NET 6+ projects.
- **Implicit usings** — filters out usings already included globally in .NET 6+ projects (`ImplicitUsings=enable`).
- **Using statements** — includes and sorts relevant usings per template type (System.* first).

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.csharp.useFileScopedNamespace` | `true` | Use file-scoped namespaces (.NET 6+) |
| `toolkit.csharp.includeUsings` | `true` | Include default using statements |
| `toolkit.csharp.filterImplicitUsings` | `true` | Filter out implicit usings (.NET 6+) |
| `toolkit.csharp.useThisForCtorAssignments` | `true` | Use `this.` in generated constructors |
| `toolkit.csharp.privateMemberPrefix` | `""` | Prefix for private members in generated constructors |

#### C# Code Actions

Two refactoring code actions available via `Ctrl+.` (or `Cmd+.`) in C# files:

- **Generate constructor from properties** — scans the class for auto-properties and generates a constructor with assignments.
- **Generate expression-bodied constructor from properties** — same, but uses expression body syntax: `=> (A, B) = (a, b);`.

Supports properties with generics (`List<string>`), nullable types (`string?`), arrays (`int[]`), `init` accessors, and the `required` modifier.

#### Auto Rename Tag

> **Note:** This feature is currently disabled. VS Code's built-in linked editing covers the main use case. To enable it, uncomment the registration in `extension.ts`.

Automatically renames the matching HTML/XML tag when you edit its pair. Works out of the box for all languages.

VS Code includes a built-in linked editing feature that does the same for HTML and Handlebars files. To use it instead, add this to your `settings.json`:

```json
"editor.linkedEditing": true
```

When linked editing is active, this feature automatically steps aside for those languages to avoid double renaming. For other languages (JSX, TSX, Vue, PHP, etc.) this feature remains active.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.autoRenameTag.enabled` | `true` | Enable/disable the feature |
| `toolkit.autoRenameTag.activationOnLanguage` | `["*"]` | Restrict to specific language IDs |

### Workspace & Explorer

#### Find File or Folder

A quick-open picker similar to `Cmd+P`, but that also searches **folders** — not just files. Open it with `Opt+P` or from the Command Palette.

| Command | Description |
|---|---|
| Find File or Folder... | Open the file/folder picker |
| Find File or Folder — Clear Recent | Clear the recently selected items |
| Find File or Folder — Remove Active From Recent | Remove the currently highlighted item from the recent list |

**Keybindings:**

| Key | Action |
|---|---|
| `Opt+P` | Open the picker |
| `Delete` (Win/Linux) / `Cmd+Backspace` (Mac) | Remove the currently highlighted item from the recent list — only active while the picker is open and the search input is empty, so it never interferes with editing your query |

**Features:**

- Searches both files and folders in the workspace
- Selecting a file opens it; selecting a folder reveals it in the Explorer
- **Multi-term search** — separate terms with spaces for AND matching (e.g., `utils braces` finds files with both terms in the name or path, in any order)
- **Negative terms** — prefix a term with `-` to exclude matches (e.g., `utils -test` finds items in utils excluding anything with "test")
- **Prefix scoring** — results where a term matches the start of a filename or folder name are ranked higher
- **Recent selections** — previously selected items appear at the top, with a visible separator
- **Open to the Side** — each file item has a button to open in a split editor
- **Remove from recent** — each recent item has a button (or keyboard shortcut above) to remove it from the recent list
- Respects `files.exclude` and `search.exclude` settings
- Results are cached for instant subsequent opens

#### Expand / Collapse Recursively

Expand or collapse all subfolders of a directory in the file explorer. Available from the right-click context menu on any folder.

Supports multi-select — select several folders, right-click, and expand/collapse all of them at once.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.expandRecursively.excludePatterns` | `[node_modules, .git, dist, ...]` | Folder names to skip |

#### Format Files

Bulk format all files in the workspace or a specific folder using VS Code's built-in formatter.

| Command | Description |
|---|---|
| Format Files - Workspace | Format all matching files in the workspace |
| Format Files - From Glob | Prompt for a custom glob pattern |
| Format Files - This Folder | Format files in a folder (right-click in explorer) |

Shows progress with cancellation support. Files are formatted in memory through the language's formatting provider — no editors are opened or focused, so you can keep working while a batch runs.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.formatFiles.includeGlob` | `**/*.{ts,js,json,html,...}` | Glob pattern for files to include |
| `toolkit.formatFiles.excludedFolders` | `[node_modules, .git, ...]` | Folders to skip |
| `toolkit.formatFiles.runOrganizeImports` | `false` | Run Organize Imports before formatting |
| `toolkit.formatFiles.useGitIgnore` | `true` | Skip files ignored by `.gitignore` (uses `git check-ignore`; no-op outside a git repo) |

#### Paste Image

Take a screenshot to the clipboard (e.g. `Cmd+Shift+Ctrl+4` on macOS, `Win+Shift+S` on Windows), then run **Toolkit: Paste Image** in any document — the image is saved to disk and an image link is inserted at the cursor.

**Commands:**

| Command | Description |
|---|---|
| Paste Image | Auto-format (Markdown for `.md`, HTML for `.html`/`.htm`/`.razor`/`.cshtml`) |
| Paste Image (Markdown) | Force Markdown image syntax |
| Paste Image (HTML) | Force HTML img tag syntax |

Available from:

- **Editor context menu** — right-click and pick **Toolkit: Paste Image**
- **Command Palette** — any of the three commands

**Behavior:**

- The image is read from the OS clipboard:
  - **macOS:** via AppleScript (`osascript`) — no extra tools needed.
  - **Windows:** via PowerShell.
  - **Linux:** via `wl-paste` (Wayland) or `xclip` (X11) — at least one must be installed.
- Saved as PNG with a timestamp-based filename, into the configured directory.
- If a file with the same name already exists, a numeric suffix is appended (`image-...-1.png`, `-2`, …).
- The inserted link path is relative to the active file, with forward slashes by default.
- Multi-cursor: the link is inserted at each cursor; the image is saved only once.
- Cannot be used on an untitled (unsaved) document when the base path is `file`.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.pasteImage.directory` | `assets/images` | Target folder for saved images |
| `toolkit.pasteImage.basePath` | `file` | `file` (relative to the active file) or `workspace` (relative to the workspace root) |
| `toolkit.pasteImage.naming` | `timestamp` | `timestamp` (auto) or `prompt` (ask each time) |
| `toolkit.pasteImage.timestampFormat` | `YYYYMMDD-HHmmss` | Tokens: `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss` |
| `toolkit.pasteImage.format` | `auto` | `auto`, `markdown`, or `html` |
| `toolkit.pasteImage.useForwardSlashes` | `true` | Use `/` separators in the inserted path |
| `toolkit.pasteImage.htmlAttributes` | `""` | Extra attributes for the inserted image tag (e.g. `class="screenshot"`) |

#### Clipboard History

Keep a list of recently-copied text snippets while VS Code is focused. Recall any of them via a quick pick — the chosen entry is copied back to the clipboard and pasted at the cursor.

**Commands:**

| Command | Description |
|---|---|
| Show Clipboard History | Quick pick of recent entries; selecting one pastes it at the cursor |
| Clear Clipboard History | Wipe the in-memory history (with confirmation; pinned entries can be kept) |

**How it works:**

- VS Code does not expose a clipboard-change event, so the extension polls the clipboard while the window is focused (default every 1 s). Polling pauses when the window loses focus.
- The history lives **in memory only** — nothing is persisted to disk, `globalState`, or `workspaceState`. Closing the window drops everything.
- Duplicates are deduplicated: re-copying an existing entry just moves it to the top (a pinned entry stays pinned).
- The current clipboard is captured on activation but not added as an entry; only subsequent changes appear.

**Pinning:**

- Every entry in the quick pick has a pin button — pinned entries move to a **Pinned** section at the top.
- Pinned entries are exempt from the FIFO cap, so they stay available for the whole session no matter how much you copy.
- **Clear Clipboard History** offers to keep them (`Clear unpinned`) or wipe everything.
- Pins are session-only, like the rest of the history — nothing is ever written to disk.

**Privacy:**

- No persistence between sessions.
- Per-entry cap (default 10 000 characters) skips very large clipboard contents.
- Per-history cap (default 50 entries) keeps memory bounded.
- The `Clear` command is available for sensitive sessions.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.clipboardHistory.enabled` | `true` | Toggle clipboard tracking |
| `toolkit.clipboardHistory.maxItems` | `50` | FIFO cap on the number of entries |
| `toolkit.clipboardHistory.maxItemLength` | `10000` | Skip entries longer than this many characters |
| `toolkit.clipboardHistory.pollInterval` | `1000` | Polling interval in milliseconds |

#### Bookmarks

Pin specific lines in your code with an optional label and jump between them from a unified quick pick. JetBrains-style.

**Commands:**

| Command | Default Key | Description |
|---|---|---|
| Toggle Bookmark | `F7` | Add / remove a bookmark on the current line |
| Toggle Bookmark with Label... | `Shift+F7` | Add a bookmark, asking for a label |
| Edit Bookmark Label... | — | Change (or clear) the label of the bookmark on the current line |
| Show Bookmarks | `Ctrl+F7` | Quick pick of every bookmark in the workspace; selecting one navigates to it |
| Next Bookmark | `Alt+F7` | Jump to the next bookmark in document order, crossing files, with wrap-around |
| Previous Bookmark | `Shift+Alt+F7` | Jump to the previous bookmark, crossing files, with wrap-around |
| Clear Bookmarks (Current File) | — | Remove all bookmarks in the active file |
| Clear All Bookmarks | — | Remove every bookmark in the workspace (with confirmation) |

**UI:**

- A bookmark icon appears in the gutter of every bookmarked line. Hovering it shows the label, when present.
- Optionally, the whole line is highlighted with a subtle background color.
- Multi-cursor: the toggle commands act on the active cursor's line only.

**Persistence:**

- Bookmarks live in the workspace state and survive across sessions.
- Line numbers are auto-adjusted while you edit the document (insertions / deletions above a bookmark shift it accordingly).
- Bookmarks placed inside a region that gets deleted are dropped.
- Bookmarks follow file and folder renames, and are cleaned up when their file is deleted.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.bookmarks.gutterIcon` | `true` | Show the bookmark icon in the gutter |
| `toolkit.bookmarks.highlightLine` | `false` | Highlight the full line with a subtle background |
| `toolkit.bookmarks.highlightColor` | `rgba(255,200,0,0.15)` | CSS color used when `highlightLine` is enabled |

#### .env Checker

Keeps your local `.env` files in sync with the committed example (`.env.example`, `.env.sample`, `.env.template`, or `.env.dist` — first one found in the same folder).

**Diagnostics (automatic, on open/save):**

- Editing a `.env` (or `.env.local`, `.env.development`, …): a warning on the first line lists the keys declared in the example but **missing** from your file, and each key **not declared** in the example gets a hint on its line.
- Editing the example: a warning lists the keys present in the sibling `.env` that are not declared in it (so new variables get documented).

**Quick fix:** `Ctrl+.` on the missing-keys warning offers **Add missing keys** — appends them to your `.env` with the example's placeholder values.

**Command:** run **Toolkit: Check .env Files** from the Command Palette — or the editor context menu of any `.env` file — to scan every `.env`/example pair in the workspace at once; out-of-sync files are listed in a quick pick (useful after a big pull).

**Privacy:** only key *names* ever appear in messages — values from a real `.env` are secrets and are never shown or copied anywhere.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.envCheck.enabled` | `true` | Toggle the .env diagnostics |
| `toolkit.envCheck.exampleNames` | `[.env.example, .env.sample, .env.template, .env.dist]` | File names recognized as the example, in lookup order |
| `toolkit.envCheck.severity` | `warning` | Severity of the missing-keys diagnostic (undeclared keys are always hints) |

#### TODO Tree

Scans the workspace for `TODO`, `FIXME`, `HACK`, etc. comments and lists them in a dedicated activity bar panel. Click an entry to jump to the file at that line.

**Commands:**

| Command | Description |
|---|---|
| TODO Tree - Refresh | Re-scan the whole workspace |
| TODO Tree - Group by Tag | Group entries by tag (default) |
| TODO Tree - Group by File | Group entries by file |
| TODO Tree - Exclude Folder… | Add a folder to `excludedFolders` for the current workspace |

The first three commands are also available as title-bar icons on the **TODOs** view in the activity bar. **Exclude Folder…** is available from the right-click menu on any file or TODO entry inside the **TODOs** view, and from the right-click menu on any folder in the file explorer. When invoked on a folder, that exact path is excluded; when invoked on a file or a TODO entry, a quick pick lets you choose which ancestor folder to exclude.

**Recognized comment styles:**

| Syntax | Languages |
|---|---|
| `// TAG: ...` | C-family, JS/TS, C#, Go, Rust, Java… |
| `# TAG: ...` | Python, Ruby, Shell, YAML |
| `/* TAG: ... */` and ` * TAG: ... ` (block continuations) | C-family |
| `<!-- TAG: ... -->` | HTML, Razor, cshtml, XML |
| `-- TAG: ...` | SQL |

Tags must match a whole word — `// TODOLIST: foo` is not picked up.

**Behavior:**

- The initial scan runs in the background the first time the TODOs view becomes visible (so startup pays nothing if you don't use it; the badge appears after that first scan).
- Saving a document re-scans only that file (fast), honoring the include glob, the excluded folders, and `.gitignore`.
- Changes to any `toolkit.todoTree.*` setting trigger a full re-scan.
- The view shows a badge with the total number of detected TODOs.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.todoTree.tags` | `["TODO","FIXME","HACK","XXX","NOTE","BUG","REVIEW"]` | Tags to look for |
| `toolkit.todoTree.caseSensitive` | `false` | Match tags case-sensitively |
| `toolkit.todoTree.includeGlob` | `**/*.{ts,js,tsx,...}` | Files to scan |
| `toolkit.todoTree.excludedFolders` | `["node_modules", ".git", ...]` | Folders to skip. Each entry can be a bare folder name matched at any depth (`node_modules`), a workspace-relative path (`src/vendor/lib-x`), or a glob (`packages/*/dist`) |
| `toolkit.todoTree.groupBy` | `tag` | `tag` or `file` |
| `toolkit.todoTree.maxFiles` | `5000` | Hard cap on files scanned |
| `toolkit.todoTree.useGitIgnore` | `true` | Skip files ignored by `.gitignore` (uses `git check-ignore`; no-op outside a git repo) |

#### REST Client

Run HTTP requests from `.http` / `.rest` files. Each request block gets a **Send Request** code lens; the response opens in a new tab with the right syntax highlighting and a pretty-printed body when it's JSON.

**Commands:**

| Command | Description |
|---|---|
| Send Request | Run the request under the cursor (also exposed as a CodeLens above each request) |
| Send All Requests | Run every request in the active file |
| Cancel Pending Requests | Abort any requests currently in flight |
| REST Client - Select Environment... | Pick the active environment from `http-client.env.json` (also via the status bar item) |
| REST Client - Copy as curl | Copy the request under the cursor as a `curl` command, with all variables resolved (also a CodeLens next to each Send Request) |

All of these are also available from the **editor context menu** when right-clicking inside a `.http` / `.rest` file.

**File format:**

```http
### Get users
GET https://api.example.com/users
Accept: application/json

### Create user
@baseUrl = https://api.example.com

POST {{baseUrl}}/users
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "name": "Alice",
  "email": "alice@example.com"
}
```

- `### name` separates request blocks (name optional).
- `@name = value` defines a variable scoped to the file.
- `{{name}}` interpolates a variable in the URL, headers or body.
- Lines starting with a single `#` are comments.
- Response bodies are capped at 50 MB; larger responses abort with an error.

**Environments:**

Point the same `.http` file at dev/staging/prod without editing it. Create an `http-client.env.json` (JetBrains-compatible) next to your `.http` files — or in any parent folder up to the workspace root; the nearest one wins:

```json
{
  "dev":  { "baseUrl": "http://localhost:3000", "token": "dev-token" },
  "prod": { "baseUrl": "https://api.example.com" }
}
```

- An optional `http-client.private.env.json` (gitignore it) overlays the public file key by key — put secrets there.
- Pick the active environment with **REST Client - Select Environment...** or by clicking the **globe item in the status bar** (visible while a `.http` file is active). The choice is remembered per workspace.
- Resolution order for `{{...}}`: file `@vars` → private environment → public environment → built-ins. A file can therefore override an environment value locally.

**Copy as curl:**

The **Copy as curl** CodeLens next to each request's Send Request (or the command / context menu entry) builds the `curl` equivalent of the request — method, URL, headers and body, with every variable (environment included) already resolved and shell-quoted — and copies it to the clipboard. Handy for reproducing an issue in a terminal, attaching to a ticket, or sharing with someone without VS Code.

**Built-in variables:**

| Placeholder | Value |
|---|---|
| `{{$timestamp}}` | Current Unix epoch in seconds |
| `{{$randomUUID}}` | Fresh UUID v4 |
| `{{$datetime iso8601}}` | Current time in ISO 8601 |

**Response format:**

The response opens in a new editor with the language inferred from `Content-Type` (JSON, XML, HTML, JavaScript, CSS, CSV — otherwise plaintext). The header block at the top looks like:

```
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 1234
X-Toolkit-Time: 234ms

{
  ...
}
```

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.restClient.timeout` | `30000` | Request timeout in ms (0 disables) |
| `toolkit.restClient.followRedirects` | `true` | Follow 3xx redirects |
| `toolkit.restClient.previewResponseAs` | `auto` | `auto`, `raw`, or `json` |

**Limitations (v1):**

- No syntax highlighting contributed — relies on whatever language is set (plaintext if none).
- No request history, no diff between responses, no response → file forwarding.
- No multipart uploads, file bodies (`< body.json`), WebSockets or gRPC.
- No built-in auth helpers (Basic, OAuth, AWS Sig) — set the headers manually.
- No request chaining (`> name`) or cookie persistence between requests.

#### Regex Playground

A side panel where you can test regexes interactively. Pattern, flags, test input and replace template — matches are highlighted live and capture groups are listed below.

**Commands:**

| Command | Description |
|---|---|
| Open Regex Playground | Opens the panel, restoring the last pattern/input/replace |
| Regex Playground - Test Selection as Regex | Opens the panel with the current selection as the pattern |
| Regex Playground - Test Selection as Input | Opens the panel with the current selection as the test input |

**UI:**

- Pattern input with toggles for the `g`, `i`, `m`, `s`, `u`, `y` flags.
- Test input textarea; the highlighted output renders just below it (matches alternate between two colors so consecutive ones stay readable).
- Match list with each match's range, the matched text, and every positional and named capture group.
- Replace template input with a live preview of the result.

**Behavior:**

- Matching uses JavaScript's `RegExp` — patterns work exactly as they do in Node.
- Evaluation runs in a **worker thread with a 1.5 s timeout**: a pattern with catastrophic backtracking shows a "Pattern timed out" error instead of freezing the editor.
- Input is debounced (~120 ms) before being sent back for matching, so typing stays responsive.
- The match cap (10 000) protects against runaway match lists.
- Pattern, flags, input and replace persist across sessions in `globalState`.

**Limitations (v1):**

- No cheat sheet of regex tokens.
- No save / load of named patterns (only the last state survives).
- No export of the pattern as a literal for other languages.

### Appearance & Viewers

#### Diagnostic Highlight

Enhances the visibility of VS Code diagnostics — especially **Hints** (the nearly invisible three dots) and **Information** messages — by adding colored underlines, similar to JetBrains IDEs.

VS Code renders Hint diagnostics as tiny dots under the first few characters, which are very easy to miss. This feature replaces them with clear, colored underlines and adds markers to the scrollbar overview ruler.

| Severity | Style | Default color |
|---|---|---|
| Hint | Dotted underline | Green (`#4EC9B0`) |
| Information | Dashed underline | Blue (`#3794FF`) |
| Warning | Solid underline | Yellow (`#CCA700`) — disabled by default |

Toggle with **Toolkit: Toggle Diagnostic Highlight** from the Command Palette.

Multi-line diagnostics are split into per-line decorations that cover only the text portion of each line (no underline bleeding into leading whitespace).

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.diagnosticHighlight.enabled` | `true` | Enable enhanced diagnostic visibility |
| `toolkit.diagnosticHighlight.highlightHints` | `true` | Highlight Hint-level diagnostics |
| `toolkit.diagnosticHighlight.highlightInfo` | `true` | Highlight Information-level diagnostics |
| `toolkit.diagnosticHighlight.highlightWarnings` | `false` | Highlight Warning-level diagnostics |
| `toolkit.diagnosticHighlight.hintColor` | `#4EC9B0` | Color for Hint diagnostics |
| `toolkit.diagnosticHighlight.infoColor` | `#3794FF` | Color for Information diagnostics |
| `toolkit.diagnosticHighlight.warningColor` | `#CCA700` | Color for Warning diagnostics |

#### CSV Rainbow

Colorize the columns of `.csv` and `.tsv` files in rotation so each field is easier to follow at a glance.

The delimiter is auto-detected from the first lines of the file (`,`, `;`, `\t`, `|`). `.tsv` files always use tab. The parser is quote-aware: delimiters inside `"..."` are ignored and `""` is treated as an escaped quote.

**Features:**

- 10 colors applied to columns in rotation, configurable
- Hover over any field to see its column number and the corresponding header from row 1
- Auto-detection of `,`, `;`, tab, and pipe as separators
- Quote-aware parsing — `"a,b",c` is two columns, not three
- Configurable line cap (default 5000) to keep huge files responsive

Toggle with **Toolkit: Toggle CSV Rainbow** from the Command Palette or the editor context menu of `.csv` / `.tsv` files.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.csvRainbow.enabled` | `true` | Enable rainbow column colors in `.csv` and `.tsv` files |
| `toolkit.csvRainbow.colors` | 10-color palette | Colors used to colorize columns in rotation |
| `toolkit.csvRainbow.delimiters` | `[",", ";", "\t", "\|"]` | Candidate delimiters for auto-detection |
| `toolkit.csvRainbow.maxLines` | `5000` | Maximum number of lines to colorize |

#### PDF Viewer

View PDF files directly in VS Code. Uses Mozilla's PDF.js (pdfjs-dist) for high-fidelity rendering with a lightweight custom UI.

Just open any `.pdf` file and it renders in an editor tab.

**Features:**

- Renders PDF pages to canvas with retina display support
- Lazy page rendering via IntersectionObserver (only visible pages are rendered)
- **Text selection and copy** — select text with the mouse and copy with `Ctrl+C`
- **Find in document** — `Ctrl+F` to search with Match Case, Whole Word, and Highlight All options. `Enter` / `Shift+Enter` to navigate results, `Escape` to close
- **Clickable links** — HTTP, HTTPS, and mailto links in the PDF are clickable (highlighted on hover)
- **Outline / bookmarks** — PDFs with a table of contents show a ☰ button in the toolbar to toggle a navigation sidebar
- **Page thumbnails** — toggle a sidebar with miniature previews of all pages. Click to navigate, use arrow keys to browse
- **Zoom** — dropdown with presets (Automatic, Page Fit, Page Width, 50%–200%), buttons, `Ctrl+=` / `Ctrl+-` (10% steps), `Ctrl+mouse wheel`, `Ctrl+0` to reset
- **Tools menu** — go to first/last page, rotate clockwise/counterclockwise, document properties (title, author, dates, etc.)
- Page navigation: previous/next buttons, go-to-page input
- Auto-reload when the PDF file changes on disk
- Respects VS Code theme colors

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.pdfViewer.scale` | `auto` | Default zoom level (`auto`, `page-actual`, `page-fit`, `page-width`, or a numeric value like `1.5`) |

#### SVG Preview

Render the active `.svg` file in a side panel that refreshes live as you edit the XML.

**Access:**

- **Editor title bar** — the preview icon when an `.svg` file is open
- **Editor / Explorer context menu** — right-click inside an open `.svg` (or on the file in the Explorer) and pick **Toolkit: Preview SVG**
- **Command Palette** — run **Toolkit: Preview SVG**

**Features:**

- **Live refresh** — the preview updates (debounced) as you type in the SVG source, without saving
- **Zoom** — `+` / `−` buttons, click the percentage to reset, or `Ctrl`/`Cmd` + mouse wheel
- **Background cycle** — checkerboard (transparency), light, and dark backgrounds
- Shows the image's natural dimensions; invalid SVG shows a clear error instead of a blank panel
- One panel per file, reused on subsequent invocations

**Security:** the SVG is rendered through an `<img>` element with a `data:` URI — browsers never execute scripts nor load external resources for image-rendered SVGs, so a malicious file cannot run code in the preview.

#### Generic Dark Theme

A dark color theme that combines the best of three worlds. Built on top of VS Code's Dark+ as a base, it applies language-specific syntax highlighting inspired by JetBrains IDEs:

| Language | Based on | Highlights |
|---|---|---|
| **JS / TS / JSX / TSX / Vue** | JetBrains WebStorm | Orange keywords, green strings, blue functions, gray comments |
| **C# / F# / Razor** | JetBrains Rider | Blue keywords, brown strings, teal functions, green comments, purple types |
| **Everything else** | VS Code Dark+ | Purple control flow, salmon strings, yellow functions, teal types |

The UI chrome (sidebar, tabs, status bar, activity bar) uses a JetBrains-inspired dark palette across all languages.

To activate it: `Cmd+K Cmd+T` (or `Ctrl+K Ctrl+T`) and select **Toolkit: Generic Dark Theme**.

**Recommended settings:**

```json
{
  "explorer.compactFolders": false,
  "workbench.tree.indent": 16,
  "workbench.tree.renderIndentGuides": "always",
  "editor.roundedSelection": false,
  "editor.bracketPairColorization.enabled": false
}
```

#### JetBrains Dark Icons

File and folder icons inspired by the JetBrains New UI. Covers 100+ file types and 20+ folder types with clean, minimal SVG icons.

To activate it: `Cmd+Shift+P` (or `Ctrl+Shift+P`) > `Preferences: File Icon Theme` > select **Toolkit: JetBrains Dark Icons**.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- npm (comes with Node.js)

### Setup

```bash
git clone <repo-url>
cd vscode-toolkit
npm install --ignore-scripts
```

### Build

Compile TypeScript to JavaScript:

```bash
npm run compile
```

To recompile automatically on file changes:

```bash
npm run watch
```

### Test

Run the unit test suite:

```bash
npm test
```

Tests cover the pure logic in `src/utils/` and `src/features/`.

### Lint

Static analysis is split between two tools, each catching what the other misses:

- **TypeScript compiler** — runs on `npm run compile` (or `npm run watch`). The following strict flags are enabled in `tsconfig.json` and surface most unused-code issues for free:
  - `noUnusedLocals` — unused local variables
  - `noUnusedParameters` — unused function parameters
  - `noImplicitReturns` — code paths that don't return a value
  - `noFallthroughCasesInSwitch` — missing `break` in `switch` cases
- **ESLint** — runs on `npm run lint`. Configured in `eslint.config.mjs` with the `typescript-eslint` `recommended-type-checked` preset plus a few opinionated rules (`consistent-type-imports`, `no-unused-vars` with `_`-prefix escape hatch). Catches deprecated API usage (`@deprecated`), unsafe `any` access, redundant type assertions, and many other code-quality issues that the TypeScript compiler doesn't flag.

```bash
npm run lint            # report issues in src/
npm run lint -- --fix   # auto-fix what can be fixed
```

Only `src/` is linted. The `test/` folder runs through `tsx` and is intentionally excluded.

### Package & Install

Build, package, and install the extension into VS Code:

```bash
npm install --ignore-scripts
npm run compile
npm run package
code --install-extension vscode-toolkit-<version>.vsix
```

Then reload VS Code (`Cmd+Shift+P` → "Developer: Reload Window").

`npm run package` generates a `vscode-toolkit-<version>.vsix` file in the project root. If the extension is already installed, VS Code will replace the previous version automatically.

When releasing a new version, bump the `version` in `package.json` before packaging.

### Uninstall

```bash
code --uninstall-extension tete.vscode-toolkit
```

### Update Dependencies

```bash
npm outdated
npx npm-check-updates -u
npm install --ignore-scripts
npm run compile
npm test
```
