import { execFile, spawn } from 'node:child_process'
import { createWriteStream, existsSync, statSync } from 'node:fs'
import { platform } from 'node:process'

export class ClipboardImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClipboardImageError'
  }
}

/**
 * Writes the image currently on the system clipboard to `targetPath` as PNG.
 * Throws ClipboardImageError when no image is found, when the OS tooling is
 * missing, or when the extraction otherwise fails.
 */
export async function saveClipboardImage(targetPath: string): Promise<void> {
  if (platform === 'darwin') {
    return saveOnMac(targetPath)
  }
  if (platform === 'win32') {
    return saveOnWindows(targetPath)
  }
  return saveOnLinux(targetPath)
}

/* -------------------------------------------------------------------------- */
/*  macOS                                                                     */
/* -------------------------------------------------------------------------- */

async function saveOnMac(targetPath: string): Promise<void> {
  const script = [
    'try',
    `  set thePath to POSIX file ${appleStringLiteral(targetPath)}`,
    '  set theData to the clipboard as «class PNGf»',
    '  set theFile to open for access thePath with write permission',
    '  set eof of theFile to 0',
    '  write theData to theFile',
    '  close access theFile',
    '  return "OK"',
    'on error errMsg',
    '  try',
    '    close access thePath',
    '  end try',
    '  return "ERROR:" & errMsg',
    'end try'
  ].join('\n')

  const result = await runCommand('osascript', ['-e', script])
  const stdout = result.stdout.trim()
  if (stdout === 'OK') {
    return
  }
  if (stdout.startsWith('ERROR:')) {
    const detail = stdout.slice('ERROR:'.length).trim()
    throw new ClipboardImageError(
      detail.toLowerCase().includes("can't make") || detail.toLowerCase().includes('class pngf')
        ? 'No image in clipboard.'
        : `osascript reported: ${detail}`
    )
  }
  if (!existsSync(targetPath) || statSync(targetPath).size === 0) {
    throw new ClipboardImageError('No image was written. Is there an image in the clipboard?')
  }
}

function appleStringLiteral(value: string): string {
  // AppleScript strings: backslash and quote need escaping.
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/* -------------------------------------------------------------------------- */
/*  Windows                                                                   */
/* -------------------------------------------------------------------------- */

async function saveOnWindows(targetPath: string): Promise<void> {
  const escapedPath = targetPath.replace(/'/g, "''")
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    '$img = [System.Windows.Forms.Clipboard]::GetImage()',
    'if ($img -eq $null) { Write-Output "ERROR:no image"; exit 0 }',
    `$img.Save('${escapedPath}', [System.Drawing.Imaging.ImageFormat]::Png)`,
    'Write-Output "OK"'
  ].join('\n')

  const result = await runCommand('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script
  ])
  const stdout = result.stdout.trim()
  if (stdout.endsWith('OK')) {
    return
  }
  if (stdout.includes('ERROR:no image')) {
    throw new ClipboardImageError('No image in clipboard.')
  }
  throw new ClipboardImageError(`PowerShell did not confirm the save (${stdout || 'no output'}).`)
}

/* -------------------------------------------------------------------------- */
/*  Linux                                                                     */
/* -------------------------------------------------------------------------- */

async function saveOnLinux(targetPath: string): Promise<void> {
  const tools: Array<{ name: string; args: string[] }> = [
    { name: 'wl-paste', args: ['-t', 'image/png'] },
    { name: 'xclip', args: ['-selection', 'clipboard', '-t', 'image/png', '-o'] }
  ]

  let lastError: string | null = null
  for (const tool of tools) {
    try {
      await runCommandToFile(tool.name, tool.args, targetPath)
      if (existsSync(targetPath) && statSync(targetPath).size > 0) {
        return
      }
    } catch (e) {
      lastError = (e as Error).message
    }
  }
  throw new ClipboardImageError(
    `Could not extract an image from the clipboard. Install 'xclip' (X11) or 'wl-clipboard' (Wayland). ${lastError ?? ''}`.trim()
  )
}

/* -------------------------------------------------------------------------- */
/*  Process helpers                                                           */
/* -------------------------------------------------------------------------- */

interface CommandResult {
  stdout: string
  stderr: string
}

function runCommand(cmd: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new ClipboardImageError(`Required tool '${cmd}' is not installed.`))
          return
        }
        reject(new ClipboardImageError(error.message))
        return
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

function runCommandToFile(cmd: string, args: string[], targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    const out = createWriteStream(targetPath)
    child.stdout.pipe(out)
    let stderr = ''
    child.stderr.on('data', chunk => (stderr += String(chunk)))
    child.on('error', err => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new ClipboardImageError(`Required tool '${cmd}' is not installed.`))
        return
      }
      reject(new ClipboardImageError(err.message))
    })
    child.on('close', code => {
      out.end()
      if (code === 0) {
        resolve()
      } else {
        reject(new ClipboardImageError(`${cmd} exited with code ${code}. ${stderr.trim()}`))
      }
    })
  })
}
