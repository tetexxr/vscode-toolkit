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

Automatically renames the matching HTML/XML tag when you edit its pair. Works out of the box for all languages.

> **Note:** VS Code includes a built-in linked editing feature that does the same for HTML and Handlebars files. To use it instead, add this to your `settings.json`:
>
> ```json
> "editor.linkedEditing": true
> ```
>
> When linked editing is active, this feature automatically steps aside for those languages to avoid double renaming. For other languages (JSX, TSX, Vue, PHP, etc.) this feature remains active.

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

Click the list icon in the sidebar title bar (or run **Toolkit: NuGet Solution Overview**) to open a summary table of all projects and their packages. Click **Load Package Versions** to check for updates across the entire solution — outdated packages are highlighted with a red "No" badge.

**Settings:**

| Setting | Default | Description |
|---|---|---|
| `toolkit.nuget.sources` | `[nuget.org]` | NuGet V3 package sources (supports private feeds with auth) |
| `toolkit.nuget.requestTimeout` | `10000` | HTTP timeout in milliseconds |
| `toolkit.nuget.defaultPrerelease` | `false` | Include prerelease packages by default |

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

### C# Code Actions

Two refactoring code actions available via `Ctrl+.` (or `Cmd+.`) in C# files:

- **Generate constructor from properties** — scans the class for auto-properties and generates a constructor with assignments.
- **Generate expression-bodied constructor from properties** — same, but uses expression body syntax: `=> (A, B) = (a, b);`.

Supports properties with generics (`List<string>`), nullable types (`string?`), arrays (`int[]`), `init` accessors, and the `required` modifier.

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

Tests cover all pure logic in `src/utils/` and `src/features/` (text transformations, slug generation, git URL parsing, tag matching, file exclusion patterns, C# namespace detection, template building, file-scoped namespace conversion, npm intellisense context detection).

### Package

Generate a `.vsix` file for distribution:

```bash
npm run package
```

This produces `vscode-toolkit-<version>.vsix` in the project root.

### Install

Install the packaged extension into VS Code:

```bash
code --install-extension vscode-toolkit-<version>.vsix
```

Then reload VS Code (`Cmd+Shift+P` → "Developer: Reload Window").

### Update

After making changes:

1. Bump the `version` in `package.json`
2. Build and package:
   ```bash
   npm run package
   ```
3. Install the new version:
   ```bash
   code --install-extension vscode-toolkit-<version>.vsix
   ```

VS Code will replace the previous version automatically.

### Uninstall

```bash
code --uninstall-extension tete.vscode-toolkit
```

### Update Dependencies

```bash
npm outdated
npx npm-check-updates -u
npm install
npm run compile
npm test
```

### One line command

To uninstall the old version, build, package, and install the new version in one command:

```bash
code --uninstall-extension tete.vscode-toolkit && npx --yes vsce package --allow-missing-repository --skip-license && code --install-extension vscode-toolkit-1.2.0.vsix --force
```