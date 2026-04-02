import { strict as assert } from 'assert'
import { parsePackageReferences } from '../../src/utils/xml'

describe('parsePackageReferences', () => {
  it('should parse self-closing PackageReference with attributes', () => {
    const xml = `
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
  </ItemGroup>
</Project>`
    const result = parsePackageReferences(xml)
    assert.deepEqual(result, [{ id: 'Newtonsoft.Json', version: '13.0.3' }])
  })

  it('should parse PackageReference with Version as child element', () => {
    const xml = `
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="NLog">
      <Version>5.2.0</Version>
    </PackageReference>
  </ItemGroup>
</Project>`
    const result = parsePackageReferences(xml)
    assert.deepEqual(result, [{ id: 'NLog', version: '5.2.0' }])
  })

  it('should parse multiple packages across multiple ItemGroups', () => {
    const xml = `
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="PackageA" Version="1.0.0" />
    <PackageReference Include="PackageB" Version="2.0.0" />
  </ItemGroup>
  <ItemGroup>
    <PackageReference Include="PackageC" Version="3.0.0" />
  </ItemGroup>
</Project>`
    const result = parsePackageReferences(xml)
    assert.equal(result.length, 3)
    assert.deepEqual(result[0], { id: 'PackageA', version: '1.0.0' })
    assert.deepEqual(result[1], { id: 'PackageB', version: '2.0.0' })
    assert.deepEqual(result[2], { id: 'PackageC', version: '3.0.0' })
  })

  it('should return empty array for project with no PackageReferences', () => {
    const xml = `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
</Project>`
    const result = parsePackageReferences(xml)
    assert.deepEqual(result, [])
  })

  it('should return empty array for empty string', () => {
    assert.deepEqual(parsePackageReferences(''), [])
  })

  it('should handle attributes in any order (Version before Include)', () => {
    const xml = `<PackageReference Version="1.0.0" Include="MyPackage" />`
    const result = parsePackageReferences(xml)
    assert.deepEqual(result, [{ id: 'MyPackage', version: '1.0.0' }])
  })

  it('should handle non-self-closing tag with attribute Version', () => {
    const xml = `<PackageReference Include="Pkg" Version="1.0.0"></PackageReference>`
    const result = parsePackageReferences(xml)
    assert.deepEqual(result, [{ id: 'Pkg', version: '1.0.0' }])
  })

  it('should handle PackageReference without Version (empty version)', () => {
    const xml = `<PackageReference Include="Pkg" />`
    const result = parsePackageReferences(xml)
    assert.deepEqual(result, [{ id: 'Pkg', version: '' }])
  })

  it('should handle prerelease versions', () => {
    const xml = `<PackageReference Include="Pkg" Version="1.0.0-beta.1" />`
    const result = parsePackageReferences(xml)
    assert.deepEqual(result, [{ id: 'Pkg', version: '1.0.0-beta.1' }])
  })

  it('should handle four-part versions', () => {
    const xml = `<PackageReference Include="Pkg" Version="1.2.3.4" />`
    const result = parsePackageReferences(xml)
    assert.deepEqual(result, [{ id: 'Pkg', version: '1.2.3.4' }])
  })

  it('should handle wildcard versions', () => {
    const xml = `<PackageReference Include="Pkg" Version="1.0.*" />`
    const result = parsePackageReferences(xml)
    assert.deepEqual(result, [{ id: 'Pkg', version: '1.0.*' }])
  })

  it('should ignore non-PackageReference elements', () => {
    const xml = `
<Project>
  <ItemGroup>
    <ProjectReference Include="..\\Other\\Other.csproj" />
    <PackageReference Include="Real" Version="1.0.0" />
  </ItemGroup>
</Project>`
    const result = parsePackageReferences(xml)
    assert.deepEqual(result, [{ id: 'Real', version: '1.0.0' }])
  })

  it('should handle extra whitespace in attributes', () => {
    const xml = `<PackageReference   Include = "Pkg"   Version = "1.0.0"  />`
    const result = parsePackageReferences(xml)
    assert.deepEqual(result, [{ id: 'Pkg', version: '1.0.0' }])
  })

  it('should handle a realistic multi-package .csproj', () => {
    const xml = `
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.OpenApi" Version="8.0.0" />
    <PackageReference Include="Swashbuckle.AspNetCore" Version="6.5.0" />
    <PackageReference Include="Serilog.AspNetCore" Version="8.0.0" />
    <PackageReference Include="MediatR" Version="12.2.0" />
    <PackageReference Include="FluentValidation">
      <Version>11.9.0</Version>
    </PackageReference>
  </ItemGroup>
</Project>`
    const result = parsePackageReferences(xml)
    assert.equal(result.length, 5)
    assert.equal(result[0].id, 'Microsoft.AspNetCore.OpenApi')
    assert.equal(result[0].version, '8.0.0')
    assert.equal(result[4].id, 'FluentValidation')
    assert.equal(result[4].version, '11.9.0')
  })
})
