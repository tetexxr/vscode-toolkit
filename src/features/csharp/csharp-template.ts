import * as fs from 'fs';
import * as path from 'path';
import { BuildTemplateOptions, BuildTemplateResult } from './csharp-types';

export function buildTemplate(options: BuildTemplateOptions): BuildTemplateResult {
  const templatePath = path.join(options.extensionPath, 'templates', 'csharp', options.templateFile);
  let content = fs.readFileSync(templatePath, 'utf-8');

  // Normalize to \n for processing
  content = content.replace(/\r\n/g, '\n');

  // Build using statements
  const usingsBlock = buildUsings(options);

  // Apply substitutions
  content = content.replace(/\$\{namespaces\}/g, usingsBlock);
  content = content.replace(/\$\{namespace\}/g, options.namespace);
  content = content.replace(/\$\{classname\}/g, options.className);

  // Convert to file-scoped namespace if enabled
  if (options.useFileScopedNamespace) {
    content = toFileScopedNamespace(content, options.tabSize);
  }

  // Find cursor position (before removing placeholder)
  const cursorPosition = findCursorPosition(content);

  // Remove cursor placeholder
  content = content.replace('${cursor}', '');

  // Apply target EOL
  if (options.eol !== '\n') {
    content = content.replace(/\n/g, options.eol);
  }

  return { content, cursorPosition };
}

export function buildUsings(options: BuildTemplateOptions): string {
  const allUsings = [...options.requiredUsings, ...options.optionalUsings];

  // Remove implicit usings and project-level removes
  const filtered = allUsings.filter(
    u => !options.implicitUsings.includes(u) && !options.usingsRemove.includes(u),
  );

  // Deduplicate
  const unique = [...new Set(filtered)];

  if (unique.length === 0) return '';

  // Sort: System.* first, then alphabetically
  unique.sort((a, b) => {
    const aSystem = a.startsWith('System');
    const bSystem = b.startsWith('System');
    if (aSystem !== bSystem) return aSystem ? -1 : 1;
    return a.localeCompare(b);
  });

  return unique.map(u => `using ${u};`).join('\n') + '\n\n';
}

export function toFileScopedNamespace(content: string, tabSize: number): string {
  const indent = ' '.repeat(tabSize);
  const lines = content.split('\n');
  const result: string[] = [];
  let inNamespace = false;

  // Find the last closing brace belonging to the namespace
  let closingBraceIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '}') {
      closingBraceIndex = i;
      break;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (!inNamespace && trimmed.startsWith('namespace ') && !trimmed.endsWith(';')) {
      result.push(trimmed + ';');
      result.push('');
      // Skip opening brace on next line
      if (i + 1 < lines.length && lines[i + 1].trim() === '{') {
        i++;
      }
      inNamespace = true;
      continue;
    }

    if (inNamespace && i === closingBraceIndex && trimmed === '}') {
      continue;
    }

    if (inNamespace && lines[i].startsWith(indent)) {
      result.push(lines[i].substring(tabSize));
    } else {
      result.push(lines[i]);
    }
  }

  return result.join('\n');
}

export function findCursorPosition(content: string): [number, number] | null {
  const index = content.indexOf('${cursor}');
  if (index === -1) return null;

  const before = content.substring(0, index);
  const lines = before.split('\n');
  return [lines.length - 1, lines[lines.length - 1].length];
}
