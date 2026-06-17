export type Schema =
  | { kind: 'unknown'; nullable: boolean }
  | { kind: 'string'; nullable: boolean }
  | { kind: 'number'; integer: boolean; large: boolean; nullable: boolean }
  | { kind: 'boolean'; nullable: boolean }
  | { kind: 'array'; element: Schema; nullable: boolean }
  | { kind: 'object'; fields: ObjectField[]; nullable: boolean }

export interface ObjectField {
  key: string
  schema: Schema
  optional: boolean
}

const INT32_MAX = 2147483647
const INT32_MIN = -2147483648

/* -------------------------------------------------------------------------- */
/*  Parsing                                                                   */
/* -------------------------------------------------------------------------- */

export class JsonParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JsonParseError'
  }
}

export function parseJson(input: string): unknown {
  try {
    return JSON.parse(input)
  } catch (e) {
    throw new JsonParseError((e as Error).message)
  }
}

/* -------------------------------------------------------------------------- */
/*  Inference                                                                 */
/* -------------------------------------------------------------------------- */

export function inferSchema(value: unknown): Schema {
  if (value === null) {
    return { kind: 'unknown', nullable: true }
  }
  if (typeof value === 'string') {
    return { kind: 'string', nullable: false }
  }
  if (typeof value === 'number') {
    return {
      kind: 'number',
      integer: Number.isInteger(value),
      large: value > INT32_MAX || value < INT32_MIN,
      nullable: false
    }
  }
  if (typeof value === 'boolean') {
    return { kind: 'boolean', nullable: false }
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { kind: 'array', element: { kind: 'unknown', nullable: false }, nullable: false }
    }
    let element: Schema = inferSchema(value[0])
    for (let i = 1; i < value.length; i++) {
      element = mergeSchemas(element, inferSchema(value[i]))
    }
    return { kind: 'array', element, nullable: false }
  }
  if (typeof value === 'object') {
    const fields: ObjectField[] = []
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      fields.push({ key, schema: inferSchema(v), optional: false })
    }
    return { kind: 'object', fields, nullable: false }
  }
  return { kind: 'unknown', nullable: false }
}

export function mergeSchemas(a: Schema, b: Schema): Schema {
  if (a.kind === 'unknown') {
    return { ...b, nullable: a.nullable || b.nullable }
  }
  if (b.kind === 'unknown') {
    return { ...a, nullable: a.nullable || b.nullable }
  }
  if (a.kind !== b.kind) {
    return { kind: 'unknown', nullable: a.nullable || b.nullable }
  }
  const nullable = a.nullable || b.nullable
  switch (a.kind) {
    case 'string':
    case 'boolean':
      return { kind: a.kind, nullable }
    case 'number': {
      const bn = b as Extract<Schema, { kind: 'number' }>
      return {
        kind: 'number',
        integer: a.integer && bn.integer,
        large: a.large || bn.large,
        nullable
      }
    }
    case 'array': {
      const ba = b as Extract<Schema, { kind: 'array' }>
      return {
        kind: 'array',
        element: mergeSchemas(a.element, ba.element),
        nullable
      }
    }
    case 'object': {
      const bo = b as Extract<Schema, { kind: 'object' }>
      return mergeObjects(a, bo, nullable)
    }
  }
}

function mergeObjects(
  a: Extract<Schema, { kind: 'object' }>,
  b: Extract<Schema, { kind: 'object' }>,
  nullable: boolean
): Schema {
  const aMap = new Map(a.fields.map(f => [f.key, f]))
  const bMap = new Map(b.fields.map(f => [f.key, f]))
  const allKeys = Array.from(new Set([...a.fields.map(f => f.key), ...b.fields.map(f => f.key)]))
  const fields: ObjectField[] = allKeys.map(key => {
    const af = aMap.get(key)
    const bf = bMap.get(key)
    if (af && bf) {
      return {
        key,
        schema: mergeSchemas(af.schema, bf.schema),
        optional: af.optional || bf.optional
      }
    }
    return { key, schema: (af ?? bf)!.schema, optional: true }
  })
  return { kind: 'object', fields, nullable }
}

/* -------------------------------------------------------------------------- */
/*  Naming                                                                    */
/* -------------------------------------------------------------------------- */

export function pascalCase(input: string): string {
  const cleaned = input.replace(/[^a-zA-Z0-9]+/g, ' ').trim()
  if (cleaned.length === 0) {
    return ''
  }
  return cleaned
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

export function singularize(name: string): string {
  if (name.length < 4) {
    return name
  }
  if (/[^aeiou]ies$/i.test(name)) {
    return name.slice(0, -3) + 'y'
  }
  if (/(ses|xes|zes|ches|shes)$/i.test(name)) {
    return name.slice(0, -2)
  }
  if (/(us|ss|is)$/i.test(name)) {
    return name
  }
  if (/s$/i.test(name)) {
    return name.slice(0, -1)
  }
  return name
}

export function isValidIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
}

/* -------------------------------------------------------------------------- */
/*  Name assignment for object schemas                                        */
/* -------------------------------------------------------------------------- */

type NameMap = Map<Extract<Schema, { kind: 'object' }>, string>

function assignNames(root: Schema, rootName: string): { names: NameMap; ordered: Array<Extract<Schema, { kind: 'object' }>> } {
  const names: NameMap = new Map()
  const ordered: Array<Extract<Schema, { kind: 'object' }>> = []
  const used = new Set<string>()

  function pick(hint: string): string {
    const base = pascalCase(hint) || 'Type'
    if (!used.has(base)) {
      used.add(base)
      return base
    }
    let i = 2
    while (used.has(`${base}${i}`)) i++
    used.add(`${base}${i}`)
    return `${base}${i}`
  }

  function walk(s: Schema, hint: string) {
    switch (s.kind) {
      case 'object':
        if (names.has(s)) {
          return
        }
        names.set(s, pick(hint))
        ordered.push(s)
        for (const f of s.fields) {
          walk(f.schema, f.key)
        }
        return
      case 'array':
        walk(s.element, singularize(hint))
        return
      default:
        return
    }
  }

  if (root.kind === 'object') {
    const baseName = pascalCase(rootName) || 'Root'
    used.add(baseName)
    names.set(root, baseName)
    ordered.push(root)
    for (const f of root.fields) {
      walk(f.schema, f.key)
    }
  } else {
    walk(root, rootName)
  }
  return { names, ordered }
}

/* -------------------------------------------------------------------------- */
/*  TypeScript emission                                                       */
/* -------------------------------------------------------------------------- */

export type TypeScriptStyle = 'interface' | 'type'

export interface TypeScriptOptions {
  style: TypeScriptStyle
  semicolons: boolean
  extractNestedTypes: boolean
}

export const DEFAULT_TS_OPTIONS: TypeScriptOptions = {
  style: 'interface',
  semicolons: true,
  extractNestedTypes: true
}

export function generateTypeScript(schema: Schema, rootName: string, opts: TypeScriptOptions = DEFAULT_TS_OPTIONS): string {
  const safeRoot = isValidIdentifier(rootName) ? rootName : pascalCase(rootName) || 'Root'
  const { names, ordered }: { names: NameMap; ordered: Array<Extract<Schema, { kind: 'object' }>> } =
    opts.extractNestedTypes
      ? assignNames(schema, safeRoot)
      : { names: new Map(), ordered: [] }

  if (schema.kind !== 'object') {
    const ref = tsRef(schema, safeRoot, names, opts)
    return `type ${safeRoot} = ${ref};\n`
  }

  if (!opts.extractNestedTypes) {
    return emitTsBlock(schema, safeRoot, names, opts) + '\n'
  }

  const blocks: string[] = []
  for (const s of ordered) {
    blocks.push(emitTsBlock(s, names.get(s)!, names, opts))
  }
  return blocks.join('\n\n') + '\n'
}

function emitTsBlock(
  obj: Extract<Schema, { kind: 'object' }>,
  name: string,
  names: NameMap,
  opts: TypeScriptOptions
): string {
  const sep = opts.semicolons ? ';' : ''
  if (opts.style === 'interface') {
    if (obj.fields.length === 0) {
      return `interface ${name} {}`
    }
    const lines = obj.fields.map(f => {
      const keyName = isValidIdentifier(f.key) ? f.key : JSON.stringify(f.key)
      const optMark = f.optional ? '?' : ''
      return `  ${keyName}${optMark}: ${tsRef(f.schema, f.key, names, opts)}${sep}`
    })
    return [`interface ${name} {`, ...lines, '}'].join('\n')
  }
  if (obj.fields.length === 0) {
    return `type ${name} = {}${sep}`
  }
  const lines = obj.fields.map(f => {
    const keyName = isValidIdentifier(f.key) ? f.key : JSON.stringify(f.key)
    const optMark = f.optional ? '?' : ''
    return `  ${keyName}${optMark}: ${tsRef(f.schema, f.key, names, opts)}${sep}`
  })
  return [`type ${name} = {`, ...lines, `}${sep}`].join('\n')
}

function tsRef(s: Schema, hint: string, names: NameMap, opts: TypeScriptOptions): string {
  let base: string
  switch (s.kind) {
    case 'unknown':
      base = 'unknown'
      break
    case 'string':
      base = 'string'
      break
    case 'number':
      base = 'number'
      break
    case 'boolean':
      base = 'boolean'
      break
    case 'array':
      base = formatArrayType(tsRef(s.element, singularize(hint), names, opts))
      break
    case 'object':
      if (opts.extractNestedTypes && names.has(s)) {
        base = names.get(s)!
      } else {
        base = inlineTsObject(s, names, opts)
      }
      break
  }
  return s.nullable ? `${base} | null` : base
}

function formatArrayType(elementRef: string): string {
  // Wrap if necessary so unions don't bind loosely
  if (/\s\|\s/.test(elementRef)) {
    return `(${elementRef})[]`
  }
  return `${elementRef}[]`
}

function inlineTsObject(
  s: Extract<Schema, { kind: 'object' }>,
  names: NameMap,
  opts: TypeScriptOptions
): string {
  const sep = opts.semicolons ? ';' : ''
  if (s.fields.length === 0) {
    return '{}'
  }
  const parts = s.fields.map(f => {
    const keyName = isValidIdentifier(f.key) ? f.key : JSON.stringify(f.key)
    const optMark = f.optional ? '?' : ''
    return `${keyName}${optMark}: ${tsRef(f.schema, f.key, names, opts)}${sep}`
  })
  return `{ ${parts.join(' ')} }`
}

/* -------------------------------------------------------------------------- */
/*  C# emission                                                               */
/* -------------------------------------------------------------------------- */

export type CSharpCollectionType = 'IReadOnlyList' | 'List' | 'IEnumerable' | 'array'
export type CSharpRecordStyle = 'positional' | 'withProperties'
export type CSharpOutputKind = 'record' | 'class'

export interface CSharpOptions {
  collectionType: CSharpCollectionType
  recordStyle: CSharpRecordStyle
  useNullable: boolean
  outputKind: CSharpOutputKind
  extractNestedTypes: boolean
}

export const DEFAULT_CS_OPTIONS: CSharpOptions = {
  collectionType: 'IReadOnlyList',
  recordStyle: 'positional',
  useNullable: true,
  outputKind: 'record',
  extractNestedTypes: true
}

export function generateCSharp(schema: Schema, rootName: string, opts: CSharpOptions = DEFAULT_CS_OPTIONS): string {
  const safeRoot = isValidIdentifier(rootName) ? rootName : pascalCase(rootName) || 'Root'
  const { names, ordered }: { names: NameMap; ordered: Array<Extract<Schema, { kind: 'object' }>> } =
    opts.extractNestedTypes
      ? assignNames(schema, safeRoot)
      : { names: new Map(), ordered: [] }

  if (schema.kind !== 'object') {
    return `// JSON root is not an object. Use the TypeScript output for primitive roots.\npublic record ${safeRoot}(${csRef(schema, safeRoot, names, opts)} Value);\n`
  }

  if (!opts.extractNestedTypes) {
    return emitCsType(schema, safeRoot, names, opts) + '\n'
  }

  const blocks: string[] = []
  for (const s of ordered) {
    blocks.push(emitCsType(s, names.get(s)!, names, opts))
  }
  return blocks.join('\n\n') + '\n'
}

function emitCsType(
  obj: Extract<Schema, { kind: 'object' }>,
  name: string,
  names: NameMap,
  opts: CSharpOptions
): string {
  if (opts.outputKind === 'record' && opts.recordStyle === 'positional') {
    if (obj.fields.length === 0) {
      return `public record ${name}();`
    }
    const params = obj.fields.map(f => `${csRef(f.schema, f.key, names, opts, f.optional)} ${pascalCase(f.key)}`).join(', ')
    return `public record ${name}(${params});`
  }

  // record with properties OR class
  const decl = opts.outputKind === 'record' ? 'record' : 'class'
  if (obj.fields.length === 0) {
    return `public ${decl} ${name} { }`
  }
  const lines: string[] = [`public ${decl} ${name}`, '{']
  for (const f of obj.fields) {
    const accessor = opts.outputKind === 'record' ? 'get; init;' : 'get; set;'
    lines.push(`    public ${csRef(f.schema, f.key, names, opts, f.optional)} ${pascalCase(f.key)} { ${accessor} }`)
  }
  lines.push('}')
  return lines.join('\n')
}

function csRef(
  s: Schema,
  hint: string,
  names: NameMap,
  opts: CSharpOptions,
  fieldOptional: boolean = false
): string {
  let base: string
  switch (s.kind) {
    case 'unknown':
      base = 'object'
      break
    case 'string':
      base = 'string'
      break
    case 'number':
      base = s.integer ? (s.large ? 'long' : 'int') : 'double'
      break
    case 'boolean':
      base = 'bool'
      break
    case 'array':
      base = formatCsCollection(csRef(s.element, singularize(hint), names, opts), opts.collectionType)
      break
    case 'object':
      if (opts.extractNestedTypes && names.has(s)) {
        base = names.get(s)!
      } else {
        // Fall back to object since C# cannot inline anonymous types in fields
        base = 'object'
      }
      break
  }
  if (!opts.useNullable) {
    return base
  }
  const needsNullable = s.nullable || fieldOptional
  if (!needsNullable) {
    return base
  }
  // Value types use ? suffix; reference types in nullable context likewise.
  return `${base}?`
}

function formatCsCollection(elementRef: string, kind: CSharpCollectionType): string {
  switch (kind) {
    case 'IReadOnlyList':
      return `IReadOnlyList<${elementRef}>`
    case 'List':
      return `List<${elementRef}>`
    case 'IEnumerable':
      return `IEnumerable<${elementRef}>`
    case 'array':
      return `${elementRef}[]`
  }
}
