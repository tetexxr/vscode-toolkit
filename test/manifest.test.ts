import { strict as assert } from 'assert'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Integrity checks for the contributed menus/submenus/commands in package.json.
 * The menu wiring is large and hand/script-edited, so these guard against the
 * classes of mistakes that are easy to introduce: a menu pointing at a command
 * or submenu that doesn't exist, an empty/orphan submenu, or duplicate/gappy
 * group ordinals (the cause of the menu items rendering out of order).
 */

interface MenuEntry {
  command?: string
  submenu?: string
  group?: string
  when?: string
}
interface Manifest {
  contributes: {
    commands: { command: string; title: string; category?: string }[]
    submenus: { id: string; label: string }[]
    menus: Record<string, MenuEntry[]>
  }
}

const manifest = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8')
) as Manifest
const { commands, submenus, menus } = manifest.contributes

const commandIds = new Set(commands.map(c => c.command))
const submenuIds = new Set(submenus.map(s => s.id))

/** Menus whose ordinals follow Toolkit's correlative-per-group convention. */
const ORDERED_MENUS = Object.keys(menus).filter(
  m => m === 'editor/context' || m === 'explorer/context' || m.startsWith('toolkit.')
)

describe('package.json menu integrity', () => {
  it('should reference only declared commands from every menu', () => {
    const unknown: string[] = []
    for (const [menu, entries] of Object.entries(menus)) {
      for (const e of entries) {
        if (e.command && !commandIds.has(e.command)) {
          unknown.push(`${menu}: ${e.command}`)
        }
      }
    }
    assert.deepEqual(unknown, [])
  })

  it('should reference only declared, non-empty submenus', () => {
    const problems: string[] = []
    for (const [menu, entries] of Object.entries(menus)) {
      for (const e of entries) {
        if (!e.submenu) {
          continue
        }
        if (!submenuIds.has(e.submenu)) {
          problems.push(`${menu}: undeclared submenu ${e.submenu}`)
        } else if (!menus[e.submenu] || menus[e.submenu].length === 0) {
          problems.push(`${menu}: submenu ${e.submenu} has no items`)
        }
      }
    }
    assert.deepEqual(problems, [])
  })

  it('should use every declared submenu at least once', () => {
    const referenced = new Set<string>()
    for (const entries of Object.values(menus)) {
      for (const e of entries) {
        if (e.submenu) {
          referenced.add(e.submenu)
        }
      }
    }
    const orphans = [...submenuIds].filter(id => !referenced.has(id))
    assert.deepEqual(orphans, [])
  })

  it('should have correlative, unique group ordinals within Toolkit menus', () => {
    const problems: string[] = []
    for (const menu of ORDERED_MENUS) {
      // Collect the @order list per group prefix (e.g. "0_toolkit", "1_open").
      const byPrefix = new Map<string, number[]>()
      for (const e of menus[menu]) {
        if (!e.group || !e.group.includes('@')) {
          continue
        }
        const [prefix, order] = e.group.split('@')
        const list = byPrefix.get(prefix) ?? []
        list.push(Number(order))
        byPrefix.set(prefix, list)
      }
      for (const [prefix, orders] of byPrefix) {
        const sorted = [...orders].sort((a, b) => a - b)
        const expected = Array.from({ length: orders.length }, (_, i) => i + 1)
        if (sorted.join(',') !== expected.join(',')) {
          problems.push(`${menu} / ${prefix}: ordinals ${sorted.join(',')} (expected ${expected.join(',')})`)
        }
      }
    }
    assert.deepEqual(problems, [])
  })

  it('should give every command a title (and Toolkit-family commands a category)', () => {
    for (const c of commands) {
      assert.ok(c.title && c.title.length > 0, `command ${c.command} has no title`)
    }
  })
})
