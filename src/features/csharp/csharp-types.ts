export interface TemplateFileInfo {
  template: string;
  extension: string;
}

export interface ProjectInfo {
  projectPath: string;
  rootNamespace: string | null;
  targetFramework: string | null;
  useImplicitUsings: boolean;
  implicitUsings: string[];
  usingsInclude: string[];
  usingsRemove: string[];
}

export interface BuildTemplateOptions {
  extensionPath: string;
  templateFile: string;
  className: string;
  namespace: string;
  requiredUsings: string[];
  optionalUsings: string[];
  useFileScopedNamespace: boolean;
  implicitUsings: string[];
  usingsRemove: string[];
  eol: string;
  tabSize: number;
}

export interface BuildTemplateResult {
  content: string;
  cursorPosition: [number, number] | null;
}

export const TEMPLATE_MAP: Record<string, TemplateFileInfo[]> = {
  Class: [{ template: 'class.tmpl', extension: '.cs' }],
  Interface: [{ template: 'interface.tmpl', extension: '.cs' }],
  Enum: [{ template: 'enum.tmpl', extension: '.cs' }],
  Struct: [{ template: 'struct.tmpl', extension: '.cs' }],
  Record: [{ template: 'record.tmpl', extension: '.cs' }],
  RecordStruct: [{ template: 'record-struct.tmpl', extension: '.cs' }],
  Controller: [{ template: 'controller.tmpl', extension: '.cs' }],
  ApiController: [{ template: 'api-controller.tmpl', extension: '.cs' }],
  RazorPage: [
    { template: 'razor-page.cs.tmpl', extension: '.cshtml.cs' },
    { template: 'razor-page.cshtml.tmpl', extension: '.cshtml' },
  ],
  BlazorComponent: [{ template: 'blazor-component.razor.tmpl', extension: '.razor' }],
  BlazorPage: [{ template: 'blazor-page.razor.tmpl', extension: '.razor' }],
  MinimalApi: [{ template: 'minimal-api.tmpl', extension: '.cs' }],
  Middleware: [{ template: 'middleware.tmpl', extension: '.cs' }],
  XUnit: [{ template: 'xunit.tmpl', extension: '.cs' }],
  NUnit: [{ template: 'nunit.tmpl', extension: '.cs' }],
  MSTest: [{ template: 'mstest.tmpl', extension: '.cs' }],
  Resx: [{ template: 'resx.tmpl', extension: '.resx' }],
};

export const REQUIRED_USINGS: Record<string, string[]> = {
  Controller: ['System.Diagnostics', 'Microsoft.AspNetCore.Mvc', 'Microsoft.Extensions.Logging'],
  ApiController: ['Microsoft.AspNetCore.Mvc'],
  RazorPage: ['Microsoft.AspNetCore.Mvc', 'Microsoft.AspNetCore.Mvc.RazorPages', 'Microsoft.Extensions.Logging'],
  MinimalApi: ['Microsoft.AspNetCore.Builder', 'Microsoft.AspNetCore.Http', 'Microsoft.AspNetCore.Routing'],
  Middleware: ['Microsoft.AspNetCore.Http'],
  XUnit: ['Xunit'],
  NUnit: ['NUnit.Framework'],
  MSTest: ['Microsoft.VisualStudio.TestTools.UnitTesting'],
};

export const OPTIONAL_USINGS = [
  'System',
  'System.Collections.Generic',
  'System.Linq',
  'System.Threading.Tasks',
];
