import { strict as assert } from 'assert'
import {
  parseLsof,
  parseNetstat,
  parseTasklist,
  portFromAddress
} from '../../../src/features/workspace/kill-port-utils'

describe('portFromAddress', () => {
  it('should read the port from an IPv4 address', () => {
    assert.equal(portFromAddress('127.0.0.1:8080'), 8080)
  })

  it('should read the port from a wildcard address', () => {
    assert.equal(portFromAddress('*:3000'), 3000)
  })

  it('should read the port from a bracketed IPv6 address', () => {
    assert.equal(portFromAddress('[::1]:3000'), 3000)
  })

  it('should ignore a peer after ->', () => {
    assert.equal(portFromAddress('127.0.0.1:3000->10.0.0.1:55000'), 3000)
  })

  it('should reject addresses without a port', () => {
    assert.equal(portFromAddress('localhost'), null)
  })

  it('should reject out-of-range ports', () => {
    assert.equal(portFromAddress('*:70000'), null)
    assert.equal(portFromAddress('*:0'), null)
  })
})

describe('parseLsof', () => {
  it('should pair each socket with its process pid and command', () => {
    const stdout = ['p4321', 'cnode', 'n*:3000', 'p910', 'cPython', 'n127.0.0.1:8000'].join('\n')
    assert.deepEqual(parseLsof(stdout), [
      { pid: 4321, command: 'node', port: 3000, address: '*:3000' },
      { pid: 910, command: 'Python', port: 8000, address: '127.0.0.1:8000' }
    ])
  })

  it('should dedupe the IPv4 + IPv6 pair a single process binds to one port', () => {
    const stdout = ['p4321', 'cnode', 'n*:3000', 'n[::1]:3000'].join('\n')
    assert.deepEqual(parseLsof(stdout), [{ pid: 4321, command: 'node', port: 3000, address: '*:3000' }])
  })

  it('should keep the same port held by different processes', () => {
    const stdout = ['p1', 'ca', 'n*:5000', 'p2', 'cb', 'n*:5000'].join('\n')
    assert.deepEqual(parseLsof(stdout).map(p => p.pid), [1, 2])
  })

  it('should return nothing for empty output', () => {
    assert.deepEqual(parseLsof(''), [])
  })
})

describe('parseNetstat', () => {
  it('should keep only listening TCP rows with their pid', () => {
    const stdout = [
      'Active Connections',
      '',
      '  Proto  Local Address          Foreign Address        State           PID',
      '  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       4321',
      '  TCP    127.0.0.1:51000        127.0.0.1:3000         ESTABLISHED     999',
      '  TCP    [::]:8080              [::]:0                 LISTENING       910',
      '  UDP    0.0.0.0:53             *:*                                    111'
    ].join('\r\n')
    assert.deepEqual(parseNetstat(stdout), [
      { pid: 4321, port: 3000, address: '0.0.0.0:3000' },
      { pid: 910, port: 8080, address: '[::]:8080' }
    ])
  })

  it('should dedupe the IPv4 + IPv6 listeners of one process on one port', () => {
    const stdout = [
      '  TCP    0.0.0.0:3000   0.0.0.0:0   LISTENING   4321',
      '  TCP    [::]:3000      [::]:0      LISTENING   4321'
    ].join('\r\n')
    assert.deepEqual(parseNetstat(stdout), [{ pid: 4321, port: 3000, address: '0.0.0.0:3000' }])
  })
})

describe('parseTasklist', () => {
  it('should map pids to image names from CSV rows', () => {
    const stdout = ['"node.exe","4321","Console","1","45,678 K"', '"python.exe","910","Console","1","12,000 K"'].join(
      '\r\n'
    )
    const map = parseTasklist(stdout)
    assert.equal(map.get(4321), 'node.exe')
    assert.equal(map.get(910), 'python.exe')
  })

  it('should skip malformed rows', () => {
    assert.equal(parseTasklist('garbage\n\n').size, 0)
  })
})
