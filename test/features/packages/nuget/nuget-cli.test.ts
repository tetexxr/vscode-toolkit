import { strict as assert } from 'assert'
import { parseJsonOutput } from '../../../../src/features/packages/nuget/nuget-cli'

describe('parseJsonOutput', () => {
  it('should parse a clean dotnet list JSON body', () => {
    const json = `{
      "version": 1,
      "parameters": "--outdated",
      "projects": [
        {
          "path": "/repo/App.csproj",
          "frameworks": [
            {
              "framework": "net8.0",
              "topLevelPackages": [
                { "id": "Serilog", "requestedVersion": "3.1.1", "resolvedVersion": "3.1.1", "latestVersion": "4.0.0" }
              ]
            }
          ]
        }
      ]
    }`
    const result = parseJsonOutput(json)
    assert.equal(result.version, 1)
    assert.equal(result.projects.length, 1)
    assert.equal(result.projects[0].frameworks?.[0].topLevelPackages?.[0].latestVersion, '4.0.0')
  })

  it('should strip informational lines before the JSON body', () => {
    const noisy = 'Restoring packages for /repo/App.csproj...\nDone.\n{ "version": 1, "parameters": "", "projects": [] }'
    const result = parseJsonOutput(noisy)
    assert.equal(result.version, 1)
    assert.equal(result.projects.length, 0)
  })

  it('should throw when there is no JSON body at all', () => {
    assert.throws(() => parseJsonOutput('error: command not found'), /no JSON body/)
  })

  it('should throw when the JSON is malformed', () => {
    assert.throws(() => parseJsonOutput('{ this is not valid json'))
  })
})
