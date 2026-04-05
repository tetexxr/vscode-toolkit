import * as vscode from 'vscode'
import * as path from 'path'
import { getRepoRoot, getCurrentBranch, getCommitHash, getRemoteUrl, parseRemoteUrl } from '../utils/git'

async function getGitInfo(filePath?: string) {
  const cwd = filePath ? path.dirname(filePath) : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath

  if (!cwd) {
    vscode.window.showErrorMessage('No workspace folder open.')
    return undefined
  }

  const config = vscode.workspace.getConfiguration('toolkit.openInGitHub')
  const remoteName = config.get<string>('remoteName', 'origin')
  const defaultBranch = config.get<string>('defaultBranch', 'main')
  const useCurrentBranch = config.get<boolean>('useCurrentBranch', true)

  try {
    const [repoRoot, remoteUrlRaw, branch] = await Promise.all([
      getRepoRoot(cwd),
      getRemoteUrl(cwd, remoteName),
      useCurrentBranch ? getCurrentBranch(cwd) : Promise.resolve(defaultBranch)
    ])

    const remote = parseRemoteUrl(remoteUrlRaw)
    if (!remote) {
      vscode.window.showErrorMessage(`Could not parse remote URL: ${remoteUrlRaw}`)
      return undefined
    }

    const baseUrl = `https://${remote.domain}/${remote.owner}/${remote.repo}`

    return {
      repoRoot,
      baseUrl,
      branch: branch || defaultBranch,
      cwd
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Git error: ${err.message}`)
    return undefined
  }
}

function getFilePathAndLines(repoRoot: string): { relativePath: string; lineFragment: string } | undefined {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return undefined
  }

  const filePath = editor.document.uri.fsPath
  const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/')

  const config = vscode.workspace.getConfiguration('toolkit.openInGitHub')
  const useLocalLine = config.get<boolean>('useLocalLine', true)

  let lineFragment = ''
  if (useLocalLine && editor.selection) {
    const startLine = editor.selection.start.line + 1
    const endLine = editor.selection.end.line + 1
    if (startLine === endLine) {
      lineFragment = `#L${startLine}`
    } else {
      lineFragment = `#L${startLine}-L${endLine}`
    }
  }

  return { relativePath, lineFragment }
}

async function openUrl(url: string): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.parse(url))
}

async function copyUrl(url: string): Promise<void> {
  await vscode.env.clipboard.writeText(url)
  vscode.window.showInformationMessage('Link copied to clipboard.')
}

async function buildFileUrl(
  segment: 'blob' | 'blame' | 'commits',
  options?: { useCommitHash?: boolean }
): Promise<string | undefined> {
  const editor = vscode.window.activeTextEditor
  const info = await getGitInfo(editor?.document.uri.fsPath)
  if (!info) {
    return undefined
  }

  const fileInfo = getFilePathAndLines(info.repoRoot)
  if (!fileInfo) {
    vscode.window.showErrorMessage('No active file.')
    return undefined
  }

  let ref: string
  if (options?.useCommitHash) {
    try {
      ref = await getCommitHash(info.cwd)
    } catch (err: any) {
      vscode.window.showErrorMessage(`Git error: ${err.message}`)
      return undefined
    }
  } else {
    ref = encodeURIComponent(info.branch)
  }

  const encodedPath = fileInfo.relativePath.split('/').map(encodeURIComponent).join('/')
  const lineFragment = segment === 'commits' ? '' : fileInfo.lineFragment
  return `${info.baseUrl}/${segment}/${ref}/${encodedPath}${lineFragment}`
}

export function registerOpenInGitHubCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.openInGitHub.file', async () => {
      const url = await buildFileUrl('blob')
      if (url) {
        await openUrl(url)
      }
    }),

    vscode.commands.registerCommand('toolkit.openInGitHub.repo', async () => {
      const info = await getGitInfo()
      if (info) {
        await openUrl(info.baseUrl)
      }
    }),

    vscode.commands.registerCommand('toolkit.openInGitHub.blame', async () => {
      const url = await buildFileUrl('blame')
      if (url) {
        await openUrl(url)
      }
    }),

    vscode.commands.registerCommand('toolkit.openInGitHub.history', async () => {
      const url = await buildFileUrl('commits')
      if (url) {
        await openUrl(url)
      }
    }),

    vscode.commands.registerCommand('toolkit.openInGitHub.copyFileLink', async () => {
      const url = await buildFileUrl('blob')
      if (url) {
        await copyUrl(url)
      }
    }),

    vscode.commands.registerCommand('toolkit.openInGitHub.copyPermalink', async () => {
      const url = await buildFileUrl('blob', { useCommitHash: true })
      if (url) {
        await copyUrl(url)
      }
    }),

    vscode.commands.registerCommand('toolkit.openInGitHub.explorerFile', async (uri: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('No file selected.')
        return
      }
      const info = await getGitInfo(uri.fsPath)
      if (!info) {
        return
      }

      const relativePath = path.relative(info.repoRoot, uri.fsPath).replace(/\\/g, '/')
      const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/')
      const url = `${info.baseUrl}/blob/${encodeURIComponent(info.branch)}/${encodedPath}`
      await openUrl(url)
    })
  )
}
