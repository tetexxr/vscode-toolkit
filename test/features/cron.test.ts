import { strict as assert } from 'assert'
import { describeCron, nextRuns, parseCron } from '../../src/features/cron-utils'

describe('parseCron', () => {
  it('should parse a standard 5-field expression', () => {
    const cron = parseCron('0 9 * * 1')
    assert.ok(cron)
    assert.deepEqual(cron?.minute.values, [0])
    assert.deepEqual(cron?.hour.values, [9])
    assert.deepEqual(cron?.dow.values, [1])
    assert.equal(cron?.hasSeconds, false)
  })

  it('should parse a 6-field (seconds-first) expression', () => {
    const cron = parseCron('30 0 9 * * *')
    assert.ok(cron)
    assert.equal(cron?.hasSeconds, true)
    assert.deepEqual(cron?.second.values, [30])
  })

  it('should expand ranges, lists and steps', () => {
    assert.deepEqual(parseCron('0 0 * * 1-5')?.dow.values, [1, 2, 3, 4, 5])
    assert.deepEqual(parseCron('0,30 0 * * *')?.minute.values, [0, 30])
    assert.deepEqual(parseCron('*/15 0 * * *')?.minute.values, [0, 15, 30, 45])
  })

  it('should accept month and day names', () => {
    assert.deepEqual(parseCron('0 0 1 JAN *')?.month.values, [1])
    assert.deepEqual(parseCron('0 0 * * MON')?.dow.values, [1])
  })

  it('should normalize 7 to 0 for Sunday', () => {
    assert.deepEqual(parseCron('0 0 * * 7')?.dow.values, [0])
  })

  it('should reject invalid expressions', () => {
    assert.equal(parseCron('the quick brown fox jumps'), null)
    assert.equal(parseCron('0 0 * *'), null)
    assert.equal(parseCron('99 0 * * *'), null)
    assert.equal(parseCron('0 0 * * 8'), null)
  })
})

describe('describeCron', () => {
  const describe5 = (expr: string) => describeCron(parseCron(expr)!)

  it('should describe every-minute and step expressions', () => {
    assert.equal(describe5('* * * * *'), 'Every minute')
    assert.equal(describe5('*/5 * * * *'), 'Every 5 minutes')
    assert.equal(describeCron(parseCron('*/30 * * * * *')!), 'Every 30 seconds')
  })

  it('should describe a daily time', () => {
    assert.equal(describe5('0 9 * * *'), 'At 09:00')
  })

  it('should append weekday, day-of-month and month qualifiers', () => {
    assert.equal(describe5('0 9 * * 1-5'), 'At 09:00, on Monday, Tuesday, Wednesday, Thursday, Friday')
    assert.equal(describe5('30 8 1 * *'), 'At 08:30, on day-of-month 1')
    assert.equal(describe5('0 0 1 1 *'), 'At 00:00, on day-of-month 1, in January')
  })

  it('should describe minute-of-every-hour', () => {
    assert.equal(describe5('0 * * * *'), 'At minute 0 of every hour')
  })
})

describe('nextRuns', () => {
  it('should compute the next daily runs', () => {
    const cron = parseCron('0 9 * * *')!
    const runs = nextRuns(cron, new Date(2024, 0, 1, 8, 0, 0), 2)
    assert.equal(runs.length, 2)
    assert.equal(runs[0].getFullYear(), 2024)
    assert.equal(runs[0].getMonth(), 0)
    assert.equal(runs[0].getDate(), 1)
    assert.equal(runs[0].getHours(), 9)
    assert.equal(runs[0].getMinutes(), 0)
    assert.equal(runs[1].getDate(), 2)
  })

  it('should skip to the next interval for step expressions', () => {
    const cron = parseCron('*/15 * * * *')!
    const runs = nextRuns(cron, new Date(2024, 0, 1, 8, 5, 0), 1)
    assert.equal(runs[0].getHours(), 8)
    assert.equal(runs[0].getMinutes(), 15)
  })

  it('should handle a yearly leap-day expression', () => {
    const cron = parseCron('0 0 29 2 *')!
    const runs = nextRuns(cron, new Date(2024, 0, 1, 0, 0, 0), 1)
    assert.equal(runs[0].getFullYear(), 2024)
    assert.equal(runs[0].getMonth(), 1)
    assert.equal(runs[0].getDate(), 29)
  })

  it('should respect the count', () => {
    const cron = parseCron('0 0 * * *')!
    assert.equal(nextRuns(cron, new Date(2024, 0, 1, 12, 0, 0), 3).length, 3)
  })
})
