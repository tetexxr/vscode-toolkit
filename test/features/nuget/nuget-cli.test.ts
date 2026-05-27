import { strict as assert } from 'assert'
import { parseJsonOutput } from '../../../src/features/nuget/nuget-cli'

describe('parseJsonOutput', () => {
  it('parses a clean dotnet list JSON body', () => {
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

  it('strips informational lines before the JSON body', () => {
    const noisy = 'Restoring packages for /repo/App.csproj...\nDone.\n{ "version": 1, "parameters": "", "projects": [] }'
    const result = parseJsonOutput(noisy)
    assert.equal(result.version, 1)
    assert.equal(result.projects.length, 0)
  })

  it('throws when there is no JSON body at all', () => {
    assert.throws(() => parseJsonOutput('error: command not found'), /no JSON body/)
  })

  it('throws when the JSON is malformed', () => {
    assert.throws(() => parseJsonOutput('{ this is not valid json'))
  })
})
