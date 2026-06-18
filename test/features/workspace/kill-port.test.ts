import { strict as assert } from 'assert'
import {
  humanizeElapsed,
  parseLsof,
  parseNetstat,
  parsePs,
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

describe('humanizeElapsed', () => {
  it('should render mm:ss as minutes and seconds', () => {
    assert.equal(humanizeElapsed('15:30'), '15m 30s')
  })

  it('should render seconds-only when under a minute', () => {
    assert.equal(humanizeElapsed('00:42'), '42s')
  })

  it('should render hh:mm:ss as hours and minutes', () => {
    assert.equal(humanizeElapsed('02:15:30'), '2h 15m')
  })

  it('should render dd-hh:mm:ss as days and hours', () => {
    assert.equal(humanizeElapsed('1-02:15:30'), '1d 2h')
  })

  it('should return undefined for an unrecognized format', () => {
    assert.equal(humanizeElapsed('whenever'), undefined)
  })
})

describe('parsePs', () => {
  it('should parse the fixed columns and keep the full command line with args', () => {
    const stdout = [
      ' 4321   900 alice       02:15:30 node /Users/alice/proj/server.js --watch --port 3000',
      '  910     1 root           15:02 /usr/sbin/cupsd -l'
    ].join('\n')
    const map = parsePs(stdout)
    assert.deepEqual(map.get(4321), {
      pid: 4321,
      ppid: 900,
      user: 'alice',
      elapsed: '2h 15m',
      commandLine: 'node /Users/alice/proj/server.js --watch --port 3000'
    })
    assert.equal(map.get(910)?.commandLine, '/usr/sbin/cupsd -l')
    assert.equal(map.get(910)?.elapsed, '15m 2s')
  })

  it('should ignore the header line and blank lines', () => {
    assert.equal(parsePs('\n  PID  PPID USER ELAPSED COMMAND\n').size, 0)
  })
})
