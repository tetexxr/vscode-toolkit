# Toolkit

All-in-one VS Code utility extension.

## Features

### Change Case

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

### Slugify

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

### Auto Rename Tag

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

### Open in GitHub

Open the current file, repository, blame view, or commit history directly in GitHub. Supports both SSH and HTTPS remotes.

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

### Format Files

Bulk format all files in the workspace or a specific folder using VS Code's built-in formatter.

| Command | Description |
|---|---|
| Format Files - Workspace | Format all matching files in the workspace |
| Format Files - From Glob | Prompt for a custom glob pattern |
| Format Files - This Folder | Format files in a folder (right-click in explorer) |

Shows progress with cancellation support. Each file is opened, formatted, saved, and closed sequentially.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.formatFiles.includeGlob` | `**/*.{ts,js,json,html,...}` | Glob pattern for files to include |
| `toolkit.formatFiles.excludedFolders` | `[node_modules, .git, ...]` | Folders to skip |
| `toolkit.formatFiles.runOrganizeImports` | `false` | Run Organize Imports before formatting |
| `toolkit.formatFiles.useGitIgnore` | `true` | Skip git-ignored files |

### Expand / Collapse Recursively

Expand or collapse all subfolders of a directory in the file explorer. Available from the right-click context menu on any folder.

Supports multi-select — select several folders, right-click, and expand/collapse all of them at once.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.expandRecursively.excludePatterns` | `[node_modules, .git, dist, ...]` | Folder names to skip |

### Expand Changed Files

Expand only the folders in the file explorer that contain git-modified, added, or untracked files. Useful for quickly navigating to the parts of the project you're actively working on without expanding the entire tree.

**Access:**

- **Explorer context menu** — right-click a folder and select **Toolkit: Expand Changed Files** to expand only within that folder.
- **Command Palette** — run **Toolkit: Expand Changed Files** to expand across the entire workspace.

Folders are expanded from shallowest to deepest, revealing the full path to every changed file. Deleted files are ignored since they no longer exist on disk. Renames are handled by expanding to the new file location.

### NuGet Package Manager

Manage NuGet packages for .NET projects directly from VS Code. Supports browsing, installing, updating, and uninstalling packages using the NuGet V3 API.

**Access:**

- **Activity Bar** — click the NuGet icon in the sidebar to see all `.csproj` / `.fsproj` / `.vbproj` projects in the workspace. Click a project to open its package manager.
- **Explorer context menu** — right-click a project file and select **Manage NuGet Packages**.
- **Command Palette** — run **Toolkit: Manage NuGet Packages** to pick a project file.

**Package Manager panel:**

| Tab | Description |
|---|---|
| Browse | Search the NuGet gallery with pagination (Load More) |
| Installed | View all installed packages and their status |
| Updates | View packages with available updates, with bulk update support |

Click any package to view its details: all versions, description, dependencies, vulnerabilities, license, and project URL.

**Solution Overview:**

Click the list icon in the sidebar title bar (or run **Toolkit: NuGet Solution Overview**) to open a summary table of all projects and their packages. Click **Load Package Versions** to check for updates across the entire solution — outdated packages are highlighted with a red "No" badge. Once versions are loaded, click **Update All** to update every outdated package across all projects in one go.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.nuget.sources` | `[nuget.org]` | NuGet V3 package sources (supports private feeds with auth) |
| `toolkit.nuget.requestTimeout` | `10000` | HTTP timeout in milliseconds |
| `toolkit.nuget.defaultPrerelease` | `false` | Include prerelease packages by default |

### npm Package Manager

Manage npm packages for Node.js projects directly from VS Code. Supports browsing, installing, updating, and uninstalling packages using the npm registry API. Automatically detects and uses the project's package manager — **npm**, **yarn**, or **pnpm** — based on the lock file present in the project directory.

**Access:**

- **Activity Bar** — click the npm icon in the sidebar to see all `package.json` projects in the workspace. Click a project to open its package manager.
- **Explorer context menu** — right-click a `package.json` file and select **Manage npm Packages**.
- **Command Palette** — run **Toolkit: Manage npm Packages** to pick a project.

**Package Manager panel:**

| Tab | Description |
|---|---|
| Browse | Search the npm registry with pagination (shows popular packages by default) |
| Installed | View all installed packages with their dependency type (dep/dev) |
| Updates | View packages with available updates, with bulk update support |

Click any package to view its details: all versions, description, author, license, homepage, keywords, dependencies, peer dependencies, and deprecation warnings. When installing a new package, a checkbox allows choosing between regular and dev dependency.

**Workspace Overview:**

Click the list icon in the sidebar title bar (or run **Toolkit: npm Workspace Overview**) to open a summary table of all projects and their packages. Click **Load Package Versions** to check for updates across the entire workspace — outdated packages are highlighted with a red "No" badge. Once versions are loaded, click **Update All** to update every outdated package across all projects in one go.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.npm.sources` | `[npmjs.org]` | npm registry sources (supports private registries with auth) |
| `toolkit.npm.requestTimeout` | `10000` | HTTP timeout in milliseconds |
| `toolkit.npm.defaultPrerelease` | `false` | Include prerelease packages by default |

### New C# File

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

### Convert Import Paths

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

Works with `import ... from`, `export ... from`, `require()`, and dynamic `import()`. Supported languages: TypeScript, JavaScript, TSX, JSX, Vue, Svelte.

### NPM Intellisense

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

### Git File History

View the full commit history and diffs for any file directly in VS Code. Renders a rich HTML panel with syntax-highlighted patches, showing each commit's author, date, message, and changes.

Available from:

- **Explorer context menu** — right-click a file and select **Toolkit: Git File History**
- **Editor context menu** — right-click inside an editor
- **Command Palette** — run **Toolkit: Git File History**

Reuses the same panel if the file is already open. Supports VS Code's built-in find widget (`Ctrl+F` / `Cmd+F`) inside the history view.

### Git Blame (Inline Annotations)

Show git blame annotations for every line in the editor, similar to JetBrains IDEs. Displays author, date, and commit message inline before each line of code.

Toggle with **Toolkit: Toggle Git Blame** from the Command Palette.

**Features:**

- Annotations appear on **all lines at once** — not just the current line
- Consecutive lines from the same commit are grouped: only the first line shows the annotation, the rest stay clean
- Groups alternate between two subtle background colors to visually separate commits
- Hover over any line to see full commit details (hash, author, date, message)
- Annotations update automatically when switching files or saving
- Toggle on/off with the same command

### Move Symbol Up / Down

Move functions, methods, classes, and other code symbols up or down past their siblings — similar to JetBrains' "Move Statement" feature. Swaps the symbol under the cursor with the adjacent one above or below, preserving spacing between them.

Works with any language that has a symbol provider (language server) installed — including TypeScript, JavaScript, C#, Go, Python, Rust, Java, and more.

**Context-aware:** if the cursor is inside a method of a class, it moves the method within the class. If the cursor is on a top-level function, it moves it among other top-level declarations.

| Command | Default Keybinding |
|---|---|
| Toolkit: Move Symbol Up | `Cmd+Shift+Up` |
| Toolkit: Move Symbol Down | `Cmd+Shift+Down` |

### Add / Remove Braces

Code actions available via `Ctrl+.` (or `Cmd+.`) in TypeScript, JavaScript, TSX, and JSX files:

- **Add braces** — wraps a braceless control statement body in `{ }`. Appears when the cursor is on (or inside) an `if`, `else`, `else if`, `for`, or `while` without braces.
- **Remove braces** — removes `{ }` from a single-statement block. Appears when the block contains exactly one statement and is not followed by `else`.

Works with and without semicolons, respects the editor's indentation settings (spaces/tabs, tab size), and handles multi-line bodies including method chaining.

### C# Code Actions

Two refactoring code actions available via `Ctrl+.` (or `Cmd+.`) in C# files:

- **Generate constructor from properties** — scans the class for auto-properties and generates a constructor with assignments.
- **Generate expression-bodied constructor from properties** — same, but uses expression body syntax: `=> (A, B) = (a, b);`.

Supports properties with generics (`List<string>`), nullable types (`string?`), arrays (`int[]`), `init` accessors, and the `required` modifier.

### PDF Viewer

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

### Diagnostic Highlight

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

### Generic Dark Theme

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

### JetBrains Dark Icons

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
