/**
 * Minimal XML utilities for parsing .csproj PackageReference entries.
 * Zero external dependencies — regex-based extraction for the specific
 * patterns found in .NET project files.
 */

export interface PackageReference {
  id: string
  version: string
}

/**
 * Extracts all PackageReference entries from a .csproj/.fsproj/.vbproj XML string.
 *
 * Handles two common forms:
 *   1. Self-closing with attributes:
 *      <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
 *   2. Child element:
 *      <PackageReference Include="Newtonsoft.Json">
 *        <Version>13.0.3</Version>
 *      </PackageReference>
 *
 * Attribute order (Include/Version) does not matter.
 */
export function parsePackageReferences(xml: string): PackageReference[] {
  const results: PackageReference[] = []

  // Match every <PackageReference ...> or <PackageReference ... /> tag.
  // We capture everything between the opening < and the closing > or />.
  const tagRe = /<PackageReference\s([^>]*?)\/?>/gi
  let tagMatch: RegExpExecArray | null

  while ((tagMatch = tagRe.exec(xml)) !== null) {
    const attrs = tagMatch[1]
    const id = extractAttribute(attrs, 'Include')
    if (!id) {
      continue
    }

    // Try Version as an attribute first
    let version = extractAttribute(attrs, 'Version')

    // If not found as attribute, look for a <Version> child element
    if (!version) {
      const afterTag = xml.slice(tagMatch.index + tagMatch[0].length)
      const childMatch = afterTag.match(/<Version\s*>(.*?)<\/Version\s*>/i)
      if (childMatch) {
        version = childMatch[1].trim()
      }
    }

    results.push({ id, version: version || '' })
  }

  return results
}

/** Extracts the value of a named attribute from an XML attribute string. */
function extractAttribute(attrs: string, name: string): string | undefined {
  const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i')
  const match = attrs.match(re)
  return match ? match[1] : undefined
}
