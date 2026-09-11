import { useCallback, useEffect, useRef,useState } from 'react'

import { markdown } from '@codemirror/lang-markdown'
import { defaultHighlightStyle,syntaxHighlighting } from '@codemirror/language'
import { EditorState, StateEffect, StateField } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { Decoration, EditorView, lineNumbers } from '@codemirror/view'
import { getTrafficLightPaddingForZoom } from '@shared/constants'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Circle,
  Eye,
  EyeOff,
  FileJson,
  FileText,
  Folder,
  Globe,
  Info,
  Languages,
  Link2,
  Moon,
  Palette,
  RefreshCw,
  Search,
  Settings,
  Sun,
  X,
} from 'lucide-react'

import { GitStatusIcon } from './components/GitStatusIcon'
import { GroupIcon } from './components/GroupIcon'
import { CustomTitleBar } from './components/layout/CustomTitleBar'
import { COLORWAY_LABELS, COLORWAY_SWATCHES, COLORWAYS, useTheme } from './hooks/useTheme'
import { useZoomFactor } from './hooks/useZoomFactor'
import { isElectronMode } from './api'

import type { GitFileStatus, IndexSourceRef, LinkIndexResult, Project, Session } from '@shared/types'

// ============================================================
// Types & Constants
// ============================================================
interface MemFile { path: string; type: string; tokens: number; content?: string; dir?: string; sources?: IndexSourceRef[] }

interface FileGroup {
  type: string
  label: string
  color: string
  desc: string
  path: string
  priority: string
  labelZh: string
  descZh: string
  pathZh: string
  priorityZh: string
  files: MemFile[]
  expanded: boolean
}

const GLOBAL_GROUP_DEFS = [
  {
    type: 'Managed', label: 'Managed', color: '#A855F7',
    desc: 'System-level mandatory rules from Claude Code installation. Automatically loaded for every session — always in effect.',
    path: '<install>/CLAUDE.md  (e.g., C:\\Program Files\\ClaudeCode\\CLAUDE.md)',
    priority: 'Always loaded — applies to all projects',
    labelZh: '系统管理',
    descZh: '来自 Claude Code 安装的系统级强制规则。每个会话都会自动加载——始终生效。',
    pathZh: '<install>/CLAUDE.md  （例如 C:\\Program Files\\ClaudeCode\\CLAUDE.md）',
    priorityZh: '始终加载——适用于所有项目',
  },
  {
    type: 'User', label: 'User', color: '#3B82F6',
    desc: 'Your personal global instructions (via /config). Loaded for ALL projects. Merged with project-specific rules below.',
    path: '~/.claude/CLAUDE.md',
    priority: 'Always loaded — applies globally',
    labelZh: '用户',
    descZh: '你的个人全局指令（通过 /config 配置）。对所有项目加载，并与下面的项目级规则合并。',
    pathZh: '~/.claude/CLAUDE.md',
    priorityZh: '始终加载——全局生效',
  },
]

const PROJECT_GROUP_DEFS = [
  {
    type: 'Project', label: 'Project', color: '#F97316',
    desc: 'Project-level instructions, checked into git — shared with your team. Also loaded from .claude/ subdirectories.',
    path: './CLAUDE.md  /  .claude/CLAUDE.md',
    priority: 'Loaded per-project — adds to User rules',
    labelZh: '项目',
    descZh: '项目级指令，已纳入 git 版本控制——与团队共享。也会从 .claude/ 子目录加载。',
    pathZh: './CLAUDE.md  /  .claude/CLAUDE.md',
    priorityZh: '按项目加载——叠加在用户规则之上',
  },
  {
    type: 'Local', label: 'Local', color: '#22C55E',
    desc: 'Local-only additions, NEVER checked into git. Use for personal project tweaks. Takes precedence on conflicts.',
    path: './CLAUDE.local.md',
    priority: 'Loaded per-project — takes precedence on conflicts',
    labelZh: '本地',
    descZh: '仅本地的补充，绝不会纳入 git 版本控制。用于个人项目调整，冲突时优先。',
    pathZh: './CLAUDE.local.md',
    priorityZh: '按项目加载——冲突时优先',
  },
  {
    type: 'AutoMem', label: 'Memory', color: '#EC4899',
    desc: 'Auto-generated memory from conversations. Managed by Claude via MEMORY.md index. Project-scoped.',
    path: '~/.claude/projects/<proj>/memory/',
    priority: 'Loaded alongside rules (separate channel)',
    labelZh: '记忆',
    descZh: '从对话中自动生成的记忆，由 Claude 通过 MEMORY.md 索引管理，作用于项目范围。',
    pathZh: '~/.claude/projects/<proj>/memory/',
    priorityZh: '与规则同时加载（独立通道）',
  },
  {
    type: 'Index', label: 'Index', color: '#06B6D4',
    desc: 'Markdown files linked from CLAUDE.md files, grouped by directory. The backlink ("indexed by") is shown at the top of each file.',
    path: 'files linked from CLAUDE.md',
    priority: 'Reverse index — grouped by directory',
    labelZh: '索引',
    descZh: '被 CLAUDE.md 链接引用的 Markdown 文件，按目录分组。每个文件顶部会显示它的索引来源。',
    pathZh: '由 CLAUDE.md 链接引用的文件',
    priorityZh: '反向索引——按目录分组',
  },
]

const GROUP_DEFS = [...GLOBAL_GROUP_DEFS, ...PROJECT_GROUP_DEFS]

/** Shared row states — every selectable row in the tree uses these. */
const ROW_SELECTED = 'text-text bg-accent-subtle shadow-[inset_2px_0_0_var(--color-accent)]'
const ROW_IDLE = 'text-text-secondary hover:bg-surface-raised/60 hover:text-text'

// ------------------------------------------------------------
// Lightweight i18n (en / zh)
// ------------------------------------------------------------
type Lang = 'en' | 'zh'
const LANG_KEY = 'cc-memory-lang'
function loadLang(): Lang {
  try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'zh' } catch { return 'zh' }
}
function saveLang(l: Lang): void {
  try { localStorage.setItem(LANG_KEY, l) } catch { /* */ }
}

const HIDDEN_KEY = 'cc-memory-hidden-projects'
function loadHidden(): string[] {
  try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]') as string[] } catch { return [] }
}
function saveHidden(ids: string[]): void {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids)) } catch { /* */ }
}

const FILTER_KEY = 'cc-memory-filter-rules'
function loadFilters(): string[] {
  try { return JSON.parse(localStorage.getItem(FILTER_KEY) || '[]') as string[] } catch { return [] }
}
function saveFilters(rules: string[]): void {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(rules)) } catch { /* */ }
}
/** Localize a group definition's display fields. */
function localizeGroup(
  g: { label: string; desc: string; path: string; priority: string; labelZh: string; descZh: string; pathZh: string; priorityZh: string },
  lang: Lang
): { label: string; desc: string; path: string; priority: string } {
  return lang === 'zh'
    ? { label: g.labelZh, desc: g.descZh, path: g.pathZh, priority: g.priorityZh }
    : { label: g.label, desc: g.desc, path: g.path, priority: g.priority }
}
/** Localize a plain UI string. */
function t(lang: Lang, en: string, zh: string): string {
  return lang === 'zh' ? zh : en
}

function formatTokens(tokens: number): string {
  if (!tokens) return ''
  if (tokens < 1000) return `${tokens} tok`
  return `${(tokens / 1000).toFixed(1)}K tok`
}

function shortenPath(p: string): string {
  const m = /^([A-Za-z]:\\[Uu]sers\\[^\\]+)/.exec(p)
  return m ? '~' + p.slice(m[0].length) : p
}

/** Directory display: relative to the project path when inside it, else ~-shortened. */
function shortenDir(dir: string, projectPath: string): string {
  const np = projectPath.replace(/\\/g, '/')
  const d = dir.replace(/\\/g, '/')
  if (d.startsWith(np)) return d.slice(np.length).replace(/^\/+/, '') || '/'
  return shortenPath(d)
}

/**
 * Build a display-friendly project title.
 * Worktrees (paths containing .claude/worktrees/) show as "repo [worktree: name]".
 */
function projectTitle(proj: Project): string {
  const p = (proj.path || proj.name).replace(/\\/g, '/')
  const wtMatch = /\.claude\/worktrees\/(.+)$/.exec(p)
  if (wtMatch) {
    const repoPath = p.slice(0, p.indexOf('/.claude/worktrees/'))
    const repoName = repoPath.split('/').pop() || repoPath
    const wtName = wtMatch[1].replace(/-[a-f0-9]{6,}$/, '')
    return `${repoName} [wt: ${wtName}]`
  }
  // Use proj.path (resolved correctly) rather than proj.name (may be broken by lossy decode)
  return p.split('/').pop() || proj.name
}

// ============================================================
// App
// ============================================================
const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([])
  const [expandedProject, setExpandedProject] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedProjectPath, setSelectedProjectPath] = useState('')
  const [groups, setGroups] = useState<FileGroup[]>([])
  const [selectedFile, setSelectedFile] = useState<MemFile | null>(null)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [jsonlContent, setJsonlContent] = useState('')
  const [loadingJsonl, setLoadingJsonl] = useState(false)
  const [editingContent, setEditingContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [diskUpdated, setDiskUpdated] = useState(false)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const originalContentRef = useRef('')
  const [showAbout, setShowAbout] = useState(false)
  const [rulesExpanded, setRulesExpanded] = useState(true)
  const [globalSelected, setGlobalSelected] = useState(false)
  const [globalGroups, setGlobalGroups] = useState<FileGroup[]>([])
  const [linkIndex, setLinkIndex] = useState<LinkIndexResult | null>(null)
  const [gitStatus, setGitStatus] = useState<Record<string, GitFileStatus>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [highlightLine, setHighlightLine] = useState<number | null>(null)
  const [col1Width, setCol1Width] = useState(240)
  const [col2Width, setCol2Width] = useState(300)
  const col1Ref = useRef(240)
  const col2Ref = useRef(300)
  const draggingRef = useRef<'col1' | 'col2' | null>(null)
  const columnsRef = useRef<HTMLDivElement>(null)
  const globalFilesRef = useRef<MemFile[]>([])

  // Language preference (persisted to localStorage)
  const [lang, setLang] = useState<Lang>(() => loadLang())
  const toggleLang = useCallback(() => {
    setLang(prev => {
      const next: Lang = prev === 'zh' ? 'en' : 'zh'
      saveLang(next)
      return next
    })
  }, [])
  const [appVersion, setAppVersion] = useState('')

  // Hidden projects (persisted)
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => loadHidden())
  const [showHidden, setShowHidden] = useState(false)
  const [showFiltered, setShowFiltered] = useState(false)
  const hideProject = useCallback((id: string) => {
    setHiddenIds(prev => {
      const next = [...new Set([...prev, id])]
      saveHidden(next)
      return next
    })
  }, [])
  const unhideProject = useCallback((id: string) => {
    setHiddenIds(prev => {
      const next = prev.filter(x => x !== id)
      saveHidden(next)
      return next
    })
  }, [])

  // Auto-filter rules (prefix match on project title) + settings panel
  const [filterRules, setFilterRules] = useState<string[]>(() => loadFilters())
  const [showSettings, setShowSettings] = useState(false)
  const addFilterRule = useCallback((rule: string) => {
    const r = rule.trim()
    if (!r) return
    setFilterRules(prev => {
      if (prev.includes(r)) return prev
      const next = [...prev, r]
      saveFilters(next)
      return next
    })
  }, [])
  const removeFilterRule = useCallback((rule: string) => {
    setFilterRules(prev => {
      const next = prev.filter(x => x !== rule)
      saveFilters(next)
      return next
    })
  }, [])
  const [filterInput, setFilterInput] = useState('')

  // macOS hidden title bar: reserve space for the native traffic lights.
  // Windows/Linux use CustomTitleBar instead, so no left padding needed there.
  const zoomFactor = useZoomFactor()
  const isMac = /Mac/i.test(navigator.userAgent)
  const trafficLightPadding = isElectronMode() && isMac ? getTrafficLightPaddingForZoom(zoomFactor) : 0
  const { isLight, colorway, setTheme, toggleTheme, setColorway } = useTheme()

  // Reload global CLAUDE.md files (Managed + User). Used on mount and by the refresh button.
  const loadGlobalGroups = useCallback(async () => {
    const fileMap = new Map<string, MemFile[]>()
    for (const g of GLOBAL_GROUP_DEFS) fileMap.set(g.type, [])
    const homeDir = await window.electronAPI.getHomeDir().catch(() => '')
    try {
      const managedPath = await window.electronAPI.getManagedClaudePath()
      if (managedPath) {
        const r = await window.electronAPI.readFileByPath(managedPath)
        if (r.success && r.content) fileMap.get('Managed')!.push({ path: managedPath, type: 'Managed', tokens: Math.ceil(r.content.length / 4), content: r.content })
      }
    } catch { /* */ }
    if (homeDir) {
      try {
        const p = homeDir.replace(/\\/g, '/') + '/.claude/CLAUDE.md'
        const r = await window.electronAPI.readFileByPath(p)
        if (r.success && r.content) fileMap.get('User')!.push({ path: p, type: 'User', tokens: Math.ceil(r.content.length / 4), content: r.content })
      } catch { /* */ }
    }
    setGlobalGroups(GLOBAL_GROUP_DEFS.map(g => ({ ...g, files: fileMap.get(g.type) || [], expanded: (fileMap.get(g.type) || []).length > 0 })))
  }, [])

  // Dismiss splash
  useEffect(() => {
    const splash = document.getElementById('splash')
    if (splash) { splash.style.opacity = '0'; setTimeout(() => splash.remove(), 300) }
  }, [])

  useEffect(() => {
    window.electronAPI.getProjects().then(setProjects).catch(() => setProjects([]))
  }, [])

  useEffect(() => {
    window.electronAPI.getAppVersion().then(setAppVersion).catch(() => {})
  }, [])

  // Load global CLAUDE.md files (Managed + User) once on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async load, deferred setState, mount-only
    void loadGlobalGroups()
  }, [loadGlobalGroups])

  // Keep a ref of global file paths so loadAllFiles can include them in the git-status query.
  useEffect(() => {
    globalFilesRef.current = globalGroups.flatMap(g => g.files)
  }, [globalGroups])

  // Detect disk changes when window regains focus
  useEffect(() => {
    const onFocus = async () => {
      if (!selectedFile) return
      try {
        const r = selectedFile.type === 'AutoMem'
          ? await window.electronAPI.memory.readFile(selectedProjectId!, selectedFile.path.split(/[\\/]/).pop()!)
          : await window.electronAPI.readFileByPath(selectedFile.path)
        if (r.success && r.content !== undefined && r.content !== editingContent) {
          setDiskUpdated(true)
        }
      } catch { /* */ }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [selectedFile, editingContent, selectedProjectId])

  // Column resize handlers
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !columnsRef.current) return
      const rect = columnsRef.current.getBoundingClientRect()
      if (draggingRef.current === 'col1') {
        const w = Math.max(160, Math.min(rect.width - 340, e.clientX - rect.left))
        col1Ref.current = w; setCol1Width(w)
      } else {
        const dx = e.clientX - rect.left - col1Ref.current
        const w = Math.max(160, Math.min(rect.width - col1Ref.current - 160, dx))
        col2Ref.current = w; setCol2Width(w)
      }
    }
    const onUp = () => {
      draggingRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const loadSessions = useCallback(async (projectId: string) => {
    try { const s = await window.electronAPI.getSessions(projectId); setSessions(s || []) }
    catch { setSessions([]) }
  }, [])

  const loadAllFiles = useCallback(async (projectId: string, projectPath: string) => {
    setLoadingFiles(true)

    const fileMap = new Map<string, MemFile[]>()
    for (const g of PROJECT_GROUP_DEFS) fileMap.set(g.type, [])

    // 1. Project CLAUDE.md files
    const np = projectPath.replace(/\\/g, '/')
    const candidates: { path: string; type: string }[] = [
      { path: np + '/CLAUDE.md', type: 'Project' },
      { path: np + '/.claude/CLAUDE.md', type: 'Project' },
      { path: np + '/CLAUDE.local.md', type: 'Local' },
    ]
    for (const c of candidates) {
      try {
        const r = await window.electronAPI.readFileByPath(c.path)
        if (r.success && r.content) {
          fileMap.get(c.type)!.push({ path: c.path, type: c.type, tokens: Math.ceil(r.content.length / 4), content: r.content })
        }
      } catch { /* */ }
    }

    // 2. Memory files from ~/.claude/projects/
    try {
      const has = await window.electronAPI.memory.hasMemory(projectId)
      if (has) {
        const idx = await window.electronAPI.memory.getIndex(projectId)
        if (idx) {
          const allKeys = [...new Set([...idx.entries.map(e => e.file), ...idx.orphanFiles])]
          for (const fileName of allKeys) {
            try {
              const r = await window.electronAPI.memory.readFile(projectId, fileName)
              if (r.success && r.content) {
                fileMap.get('AutoMem')!.push({ path: r.path || fileName, type: 'AutoMem', tokens: Math.ceil((r.content || '').length / 4), content: r.content })
              }
            } catch { /* */ }
          }
        }
      }
    } catch { /* */ }

    // 3. Reverse index (files linked from CLAUDE.md / MEMORY.md) + git status
    const allPaths = globalFilesRef.current.map(f => f.path)
    for (const [, arr] of fileMap) for (const f of arr) allPaths.push(f.path)
    let linkResult: LinkIndexResult | null = null
    try {
      linkResult = await window.electronAPI.memory.getLinkIndex(projectId, projectPath, allPaths)
    } catch { /* */ }
    setGitStatus(linkResult?.git ?? {})
    setLinkIndex(linkResult)

    if (linkResult && linkResult.files.length > 0) {
      const indexedFiles: MemFile[] = []
      for (const f of linkResult.files) {
        let content: string | undefined
        try {
          const r = await window.electronAPI.readFileByPath(f.path)
          if (r.success) content = r.content
        } catch { /* */ }
        indexedFiles.push({
          path: f.path,
          type: 'Index',
          tokens: content ? Math.ceil(content.length / 4) : 0,
          content,
          dir: f.dir,
          sources: f.sources,
        })
      }
      fileMap.set('Index', indexedFiles)
    }

    const nextGroups: FileGroup[] = PROJECT_GROUP_DEFS.map(g => ({
      ...g,
      files: fileMap.get(g.type) || [],
      expanded: (fileMap.get(g.type) || []).length > 0,
    }))

    setGroups(nextGroups)
    setLoadingFiles(false)
  }, [])

  // Manual refresh: reload projects, global files, sessions, and the selected project's files.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      try {
        const projs = await window.electronAPI.getProjects()
        setProjects(projs || [])
      } catch { /* */ }
      await loadGlobalGroups()
      const tasks: Promise<void>[] = []
      if (expandedProject) tasks.push(loadSessions(expandedProject))
      if (selectedProjectId) tasks.push(loadAllFiles(selectedProjectId, selectedProjectPath))
      await Promise.all(tasks)
    } finally {
      setRefreshing(false)
    }
  }, [expandedProject, selectedProjectId, selectedProjectPath, loadSessions, loadAllFiles, loadGlobalGroups])

  useEffect(() => {
    const unsub = window.electronAPI.memory.onChanged(({ projectId }) => {
      if (projectId === selectedProjectId) void loadAllFiles(selectedProjectId, selectedProjectPath)
    })
    return unsub
  }, [selectedProjectId, selectedProjectPath, loadAllFiles])

  const handleArrowClick = useCallback((e: React.MouseEvent, projectId: string) => {
    e.stopPropagation()
    if (expandedProject === projectId) {
      setExpandedProject(null)
    } else {
      setExpandedProject(projectId)
      void loadSessions(projectId)
    }
  }, [expandedProject, loadSessions])

  const handleProjectClick = useCallback((proj: Project) => {
    setShowAbout(false)
    setShowSettings(false)
    setGlobalSelected(false)
    setSelectedProjectId(proj.id)
    setSelectedProjectPath(proj.path || proj.name)
    setSelectedFile(null)
    setEditingContent('')
    setIsDirty(false)
    setSelectedSession(null)
    setJsonlContent('')
    setLinkIndex(null)
    setGitStatus({})
    void loadAllFiles(proj.id, proj.path || proj.name)
  }, [loadAllFiles])

  const handleSessionClick = useCallback(async (session: Session, projectId: string) => {
    setShowAbout(false)
    setShowSettings(false)
    setSelectedSession(session)
    setSelectedFile(null)
    setEditingContent('')
    setIsDirty(false)
    setJsonlContent('')
    setLoadingJsonl(true)
    try {
      const homeDir = await window.electronAPI.getHomeDir()
      const jsonlPath = `${homeDir.replace(/\\/g, '/')}/.claude/projects/${projectId}/${session.id}.jsonl`
      const r = await window.electronAPI.readFileByPath(jsonlPath)
      if (r.success && r.content) {
        setJsonlContent(r.content)
      }
    } catch { /* */ }
    finally { setLoadingJsonl(false) }
  }, [])

  const handleSelectFile = useCallback(async (f: MemFile, line?: number | null) => {
    let content = f.content
    if (content === undefined) {
      try {
        const r = await window.electronAPI.readFileByPath(f.path)
        if (r.success) content = r.content
      } catch { /* */ }
    }
    const resolved = content ?? ''
    originalContentRef.current = resolved
    setShowAbout(false)
    setShowSettings(false)
    setSelectedFile(f)
    setEditingContent(resolved)
    setIsDirty(false)
    setDiskUpdated(false)
    setHighlightLine(typeof line === 'number' && line >= 1 ? line : null)
  }, [])

  const handleSave = useCallback(async () => {
    if (!selectedFile) return
    if (diskUpdated && !confirm('磁盘文件已被外部修改，覆盖保存？')) return
    setIsSaving(true)
    try {
      if (selectedFile.type === 'AutoMem') {
        const fileName = selectedFile.path.split(/[\\/]/).pop() || selectedFile.path
        await window.electronAPI.memory.saveFile(selectedProjectId!, fileName, editingContent)
      } else {
        await window.electronAPI.writeFileByPath(selectedFile.path, editingContent)
      }
      originalContentRef.current = editingContent
      setIsDirty(false)
      setDiskUpdated(false)
      if (selectedProjectId) void loadAllFiles(selectedProjectId, selectedProjectPath)
    } catch { /* */ }
    finally { setIsSaving(false) }
  }, [selectedFile, editingContent, selectedProjectId, selectedProjectPath, loadAllFiles, diskUpdated])

  const handleDelete = useCallback(async () => {
    if (!selectedFile || !selectedProjectId) return
    const fname = selectedFile.path.split(/[\\/]/).pop() ?? selectedFile.path
    if (!confirm(lang === 'zh' ? `删除 "${fname}"？` : `Delete "${fname}"?`)) return
    if (selectedFile.type === 'AutoMem') {
      const fileName = selectedFile.path.split(/[\\/]/).pop() || selectedFile.path
      await window.electronAPI.memory.deleteFile(selectedProjectId, fileName)
    }
    setSelectedFile(null); setEditingContent(''); setIsDirty(false)
    void loadAllFiles(selectedProjectId, selectedProjectPath)
  }, [selectedFile, selectedProjectId, selectedProjectPath, loadAllFiles, lang])

  /** Opens a file by absolute path (used by backlink chips) — finds it in the loaded groups, else fetches content. */
  const openFile = useCallback(async (filePath: string, line?: number | null) => {
    const allGroups = [...globalGroups, ...groups]
    for (const g of allGroups) {
      const found = g.files.find(x => x.path === filePath)
      if (found) {
        await handleSelectFile(found, line)
        return
      }
    }
    try {
      const r = await window.electronAPI.readFileByPath(filePath)
      if (r.success) {
        await handleSelectFile({
          path: filePath,
          type: 'Index',
          tokens: r.content ? Math.ceil(r.content.length / 4) : 0,
          content: r.content,
        }, line)
      }
    } catch { /* */ }
  }, [globalGroups, groups, handleSelectFile])

  /** Renders file rows for a group. The Index group groups files by their source (索引来源) and shows the directory on each row. */
  const renderGroupFiles = (group: FileGroup) => {
    const row = (f: MemFile, rowKey?: string, dirLabel?: string) => (
      <div
        key={rowKey ?? f.path}
        onClick={() => void handleSelectFile(f)}
        className={`pl-9 pr-3 py-2 cursor-pointer text-xs transition-colors flex items-center gap-2 ${
          selectedFile?.path === f.path ? ROW_SELECTED : ROW_IDLE
        }`}
      >
        <FileText className="size-3.5 shrink-0 text-text-muted" />
        <GitStatusIcon status={gitStatus[f.path]} lang={lang} />
        <span className="font-mono truncate">
          {dirLabel ? `${dirLabel}/` : ''}
          {f.path.split(/[\\/]/).pop()}
        </span>
        {f.tokens > 0 && (
          <span className="text-text-muted shrink-0 ml-auto text-2xs">{formatTokens(f.tokens)}</span>
        )}
      </div>
    )
    if (group.type !== 'Index') return group.files.map(f => row(f))

    // Index group: group files by the referencing source (来源), directory goes on each row.
    const pairs: { sourcePath: string; sourceName: string; file: MemFile }[] = []
    for (const f of group.files) {
      const sources = f.sources && f.sources.length > 0 ? f.sources : [{ path: '', fileName: t(lang, '(unknown source)', '来源未知') }]
      for (const s of sources) pairs.push({ sourcePath: s.path, sourceName: s.fileName, file: f })
    }
    const bySource = new Map<string, { sourceName: string; files: MemFile[] }>()
    for (const p of pairs) {
      const entry = bySource.get(p.sourcePath)
      if (entry) entry.files.push(p.file)
      else bySource.set(p.sourcePath, { sourceName: p.sourceName, files: [p.file] })
    }
    const sourcePaths = [...bySource.keys()].sort((a, b) => a.localeCompare(b))
    return sourcePaths.map(sourcePath => {
      const entry = bySource.get(sourcePath)
      if (!entry) return null
      const { sourceName, files } = entry
      return (
        <div key={sourcePath}>
          <div className="pl-9 pr-3 py-1 text-2xs text-text-muted font-mono truncate" title={sourcePath || undefined}>
            {sourceName}
          </div>
          {files.map(f => {
            const d = f.dir ? shortenDir(f.dir, selectedProjectPath) : ''
            const dirLabel = d === '/' ? '' : d
            return row(f, `${sourcePath}:${f.path}`, dirLabel)
          })}
        </div>
      )
    })
  }

  const toggleGroup = useCallback((type: string) => {
    setGroups(prev => prev.map(g => g.type === type ? { ...g, expanded: !g.expanded } : g))
  }, [])

  const toggleGlobalGroup = useCallback((type: string) => {
    setGlobalGroups(prev => prev.map(g => g.type === type ? { ...g, expanded: !g.expanded } : g))
  }, [])

  const startResize = (col: 'col1' | 'col2') => (e: React.MouseEvent) => {
    e.preventDefault()
    // eslint-disable-next-line react-hooks/refs -- event handler writes ref on mousedown, not during render
    draggingRef.current = col
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  // Files that index the currently open file (backlinks), for the "索引来源" row.
  const selectedFileSources = selectedFile
    ? (linkIndex?.files.find(f => f.path === selectedFile.path)?.sources ?? [])
    : []

  // Split projects: filtered (auto-rule match) → hidden (manual) → active/empty.
  const hiddenSet = new Set(hiddenIds)
  const isFiltered = (p: Project): boolean => {
    const title = projectTitle(p)
    return filterRules.some(rule => title.startsWith(rule))
  }
  const filteredProjects = projects.filter(p => isFiltered(p) && !hiddenSet.has(p.id))
  const visibleProjects = projects.filter(p => !hiddenSet.has(p.id) && !isFiltered(p))
  const activeProjects = visibleProjects.filter(p => p.sessions.length > 0)
  const emptyProjects = visibleProjects.filter(p => p.sessions.length === 0)
  const hiddenProjects = projects.filter(p => hiddenSet.has(p.id))

  const renderProjectItem = (proj: Project, hidden = false): React.JSX.Element => (
    <div key={proj.id}>
      <div
        className={`px-3 py-2 text-xs flex items-center gap-2 transition-colors group ${
          selectedProjectId === proj.id ? ROW_SELECTED : ROW_IDLE}`}>
        <span
          onClick={(e) => handleArrowClick(e, proj.id)}
          className="text-text-muted cursor-pointer hover:text-text shrink-0 flex items-center"
        >
          {expandedProject === proj.id
            ? <ChevronDown className="size-3" />
            : <ChevronRight className="size-3" />}
        </span>
        <Folder className="size-3.5 shrink-0 text-text-muted" />
        <span
          onClick={() => handleProjectClick(proj)}
          className={`font-medium truncate cursor-pointer flex-1 ${hidden ? 'text-text-muted' : ''}`} title={proj.path || proj.name}>{projectTitle(proj)}</span>
        <span className="text-2xs text-text-muted">{proj.sessions.length}</span>
        <button
          onClick={(e) => { e.stopPropagation(); if (hidden) unhideProject(proj.id); else hideProject(proj.id) }}
          title={hidden ? t(lang, 'Show', '显示') : t(lang, 'Hide', '隐藏')}
          aria-label={hidden ? t(lang, 'Show', '显示') : t(lang, 'Hide', '隐藏')}
          className="text-text-muted opacity-0 group-hover:opacity-100 hover:text-text transition-opacity px-1 flex items-center"
        >
          {hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </button>
      </div>
      {expandedProject === proj.id && (
        <div className="ml-6 border-l border-border">
          {sessions.map((s) => (
            <div key={s.id} onClick={() => handleSessionClick(s, proj.id)}
              className={`px-3 py-1.5 cursor-pointer text-xs transition-colors truncate ${
                selectedSession?.id === s.id ? ROW_SELECTED : 'text-text-muted hover:bg-surface-raised/60 hover:text-text'
              }`}>
              {s.firstMessage?.slice(0, 40) || s.id.slice(0, 8)}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="app-canvas flex flex-col h-screen text-text">
      <CustomTitleBar />
      <div ref={columnsRef} className="flex flex-1 min-h-0">
        {/* Column 1: Project Tree + Sessions */}
        <div style={{ width: col1Width, minWidth: 160 }} className="glass shrink-0 border-border flex flex-col">
          <div className="p-3 border-b border-border" style={{ WebkitAppRegion: 'drag', paddingLeft: trafficLightPadding } as React.CSSProperties}>
            <h1 className="text-sm font-semibold text-text-secondary text-center">{t(lang, 'Working Directories', '工作目录')}</h1>
          </div>
          <div className="flex-1 overflow-y-auto">
            {/* Global CLAUDE.md — special folder at top */}
            {globalGroups.some(g => g.files.length > 0) && (
              <>
                <div
                  onClick={() => { setShowAbout(false); setGlobalSelected(!globalSelected); setSelectedProjectId(null); setSelectedFile(null); setSelectedSession(null); setLinkIndex(null); setGitStatus({}) }}
                  className={`px-3 py-2 text-xs flex items-center gap-2 cursor-pointer transition-colors ${
                    globalSelected ? ROW_SELECTED : ROW_IDLE
                  }`}
                >
                  {globalSelected ? (
                    <ChevronDown className="size-3 shrink-0 text-text-muted" />
                  ) : (
                    <ChevronRight className="size-3 shrink-0 text-text-muted" />
                  )}
                  <Globe className="size-3.5 shrink-0" />
                  <span className="font-medium truncate flex-1">{t(lang, 'Global', '全局')}</span>
                  <span className="text-2xs text-text-muted">{globalGroups.reduce((n, g) => n + g.files.length, 0)}</span>
                </div>
                <div className="mx-3 border-t border-border" />
              </>
            )}

            {/* Active projects */}
            {activeProjects.map(p => renderProjectItem(p))}

            {/* Empty projects (conversations deleted) — grouped at the bottom */}
            {emptyProjects.length > 0 && (
              <>
                <div className="px-3 pt-3 pb-1 text-2xs text-text-muted uppercase tracking-wider">
                  {t(lang, 'Empty / Deleted', '空项目 / 已删除')}
                </div>
                {emptyProjects.map(p => renderProjectItem(p))}
              </>
            )}

            {/* Hidden projects — collapsed by default */}
            {hiddenProjects.length > 0 && (
              <>
                <div
                  onClick={() => setShowHidden(!showHidden)}
                  className="px-3 pt-3 pb-1 flex items-center gap-1 cursor-pointer text-2xs text-text-muted uppercase tracking-wider hover:text-text transition-colors"
                >
                  {showHidden ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                  <span>{t(lang, `Hidden (${hiddenProjects.length})`, `已隐藏 (${hiddenProjects.length})`)}</span>
                </div>
                {showHidden && hiddenProjects.map(p => renderProjectItem(p, true))}
              </>
            )}

            {/* Auto-filtered projects — collapsed by default */}
            {filteredProjects.length > 0 && (
              <>
                <div
                  onClick={() => setShowFiltered(!showFiltered)}
                  className="px-3 pt-3 pb-1 flex items-center gap-1 cursor-pointer text-2xs text-text-muted uppercase tracking-wider hover:text-text transition-colors"
                >
                  {showFiltered ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                  <span>{t(lang, `Filtered (${filteredProjects.length})`, `已过滤 (${filteredProjects.length})`)}</span>
                </div>
                {showFiltered && filteredProjects.map(p => renderProjectItem(p, true))}
              </>
            )}
          </div>
          <div className="shrink-0 border-t border-border px-3 py-2">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { setShowSettings(!showSettings); setShowAbout(false); setSelectedFile(null); setSelectedSession(null) }}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded transition-colors ${
                  showSettings ? 'bg-accent-subtle text-text' : 'text-text-muted hover:text-text hover:bg-surface-raised'
                }`}
              >
                {showSettings ? <X className="size-3.5" /> : <Settings className="size-3.5" />}
                {showSettings ? t(lang, 'Close', '关闭') : t(lang, 'Settings', '设置')}
              </button>
              <button
                onClick={() => void handleRefresh()}
                title={lang === 'zh' ? '刷新（重新加载项目 / 会话 / 文件）' : 'Refresh (reload projects, sessions, files)'}
                aria-label="Refresh"
                className="flex items-center justify-center size-7 rounded border border-border text-text-muted hover:text-text hover:bg-surface-raised transition-colors"
              >
                <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={toggleTheme}
                title={isLight ? 'Switch to dark' : 'Switch to light'}
                aria-label="Toggle theme"
                className="flex items-center justify-center size-7 rounded border border-border text-text-muted hover:text-text hover:bg-surface-raised transition-colors"
              >
                {isLight ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
              </button>
              <button
                onClick={toggleLang}
                title={lang === 'zh' ? 'Switch to English' : '切换为中文'}
                className="flex items-center justify-center size-7 rounded border border-border text-2xs text-text-muted hover:text-text hover:bg-surface-raised transition-colors"
              >
                {lang === 'zh' ? 'EN' : '中'}
              </button>
            </div>
          </div>
        </div>

        {/* Resize handle 1 */}
        <div
          onMouseDown={startResize('col1')}
          className="w-1 shrink-0 cursor-col-resize hover:bg-accent/50 transition-colors bg-transparent"
        />

        {/* Column 2: File Tree */}
        <div style={{ width: col2Width, minWidth: 160 }} className="glass shrink-0 border-r border-border flex flex-col">
          <div className="p-3 border-b border-border" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
            <h2 className="text-sm font-medium text-text-secondary text-center">
              {selectedProjectPath ? selectedProjectPath.split(/[\\/]/).pop() : t(lang, 'Memory Files', '记忆文件')}
            </h2>
          </div>
          {/* Settings category navigation — only shown while Settings is open */}
          {showSettings && (
            <div className="shrink-0 border-b border-border py-1.5">
              {[
                { key: 'theme', Icon: Palette, en: 'Theme', zh: '主题' },
                { key: 'lang', Icon: Languages, en: 'Language', zh: '语言' },
                { key: 'filter', Icon: Search, en: 'Filter', zh: '过滤' },
                { key: 'about', Icon: Info, en: 'About', zh: '关于' },
              ].map(({ key, Icon, en, zh }) => (
                <button
                  key={key}
                  onClick={() => {
                    setShowSettings(true)
                    setShowAbout(false)
                    setTimeout(() => {
                      document.getElementById(`setting-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }, 50)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-muted hover:text-text hover:bg-surface-raised/60 transition-colors"
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span>{t(lang, en, zh)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {/* Global folder content */}
            {!showSettings && globalSelected && (
              <div className="py-1 border-b border-border">
                {globalGroups.map((group) => {
                  const hasFiles = group.files.length > 0
                  return (
                    <div key={group.type}>
                      <div
                        onClick={() => hasFiles && toggleGlobalGroup(group.type)}
                        className={`px-3 py-1.5 flex items-center gap-2 text-xs cursor-pointer transition-colors hover:bg-surface-raised/60 ${!hasFiles ? 'opacity-40' : ''}`}
                      >
                        <span className="text-text-muted shrink-0 flex items-center">
                          {hasFiles
                            ? (group.expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />)
                            : <span className="size-3" />}
                        </span>
                        <GroupIcon type={group.type} color={group.color} />
                        <span style={{ color: group.color }} className="font-semibold uppercase tracking-wide">{localizeGroup(group, lang).label}</span>
                        <span className="text-2xs text-text-muted ml-auto">{group.files.length}</span>
                      </div>
                      {group.expanded && group.files.map((f) => (
                        <div key={f.path} onClick={() => void handleSelectFile(f)}
                          className={`pl-9 pr-3 py-2 cursor-pointer text-xs transition-colors flex items-center gap-2 ${
                            selectedFile?.path === f.path ? ROW_SELECTED : ROW_IDLE
                          }`}
                        >
                          <FileText className="size-3.5 shrink-0 text-text-muted" />
                          <GitStatusIcon status={gitStatus[f.path]} lang={lang} />
                          <span className="font-mono truncate">{f.path.split(/[\\/]/).pop()}</span>
                          {f.tokens > 0 && <span className="text-2xs text-text-muted shrink-0 ml-auto">{formatTokens(f.tokens)}</span>}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Project-specific files */}
            {showSettings ? null : !selectedProjectId && !globalSelected ? (
              <div className="p-4 text-sm text-text-muted">{t(lang, 'Select a project or Global', '选择一个项目或全局')}</div>
            ) : !selectedProjectId ? null : loadingFiles ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin size-4 border-2 border-accent border-t-transparent rounded-full" />
              </div>
            ) : (
              <div className="py-1">
                {groups.map((group) => {
                  const hasFiles = group.files.length > 0
                  return (
                    <div key={group.type}>
                      <div
                        onClick={() => hasFiles && toggleGroup(group.type)}
                        className={`px-3 py-1.5 flex items-center gap-2 text-xs cursor-pointer transition-colors hover:bg-surface-raised/60 ${
                          !hasFiles ? 'opacity-40' : ''
                        }`}
                      >
                        <span className="text-text-muted shrink-0 flex items-center">
                          {hasFiles
                            ? (group.expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />)
                            : <span className="size-3" />}
                        </span>
                        <GroupIcon type={group.type} color={group.color} />
                        <span style={{ color: group.color }} className="font-semibold uppercase tracking-wide">
                          {localizeGroup(group, lang).label}
                        </span>
                        <span className="text-2xs text-text-muted ml-auto">{group.files.length}</span>
                      </div>
                      {group.expanded && renderGroupFiles(group)}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Resize handle 2 */}
        <div
          onMouseDown={startResize('col2')}
          className="w-1 shrink-0 cursor-col-resize hover:bg-accent/50 transition-colors bg-transparent"
        />

        {/* Column 3: Content Viewer */}
        <div className="flex-1 flex flex-col bg-surface min-w-[160px]">
          {showSettings ? (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-xl mx-auto space-y-4">
                <h2 className="text-sm font-semibold text-text">{t(lang, 'Settings', '设置')}</h2>

                {/* Theme — mode + accent colorway */}
                <section id="setting-theme" className="bg-surface-sidebar rounded border border-border p-4">
                  <h3 className="text-xs font-semibold text-text mb-3">{t(lang, 'Theme', '主题')}</h3>

                  <div className="text-2xs uppercase tracking-wider text-text-muted mb-1.5">
                    {t(lang, 'Appearance', '外观')}
                  </div>
                  <div className="inline-flex rounded border border-border p-0.5 mb-4">
                    {([
                      { light: false, Icon: Moon, en: 'Dark', zh: '暗色' },
                      { light: true, Icon: Sun, en: 'Light', zh: '亮色' },
                    ] as const).map(({ light, Icon, en, zh }) => (
                      <button
                        key={en}
                        onClick={() => setTheme(light)}
                        aria-pressed={isLight === light}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-colors ${
                          isLight === light ? 'bg-accent-subtle text-text' : 'text-text-muted hover:text-text'
                        }`}
                      >
                        <Icon className="size-3.5" />
                        {t(lang, en, zh)}
                      </button>
                    ))}
                  </div>

                  <div className="text-2xs uppercase tracking-wider text-text-muted mb-2">
                    {t(lang, 'Accent Color', '强调色')}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {COLORWAYS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setColorway(c)}
                        aria-pressed={colorway === c}
                        className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded border transition-colors ${
                          colorway === c
                            ? 'border-accent text-text bg-accent-subtle'
                            : 'border-border text-text-secondary hover:text-text hover:bg-surface-raised'
                        }`}
                      >
                        <span
                          className="size-3 rounded-full shrink-0"
                          style={{ background: COLORWAY_SWATCHES[c] }}
                        />
                        {COLORWAY_LABELS[c]}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Language */}
                <section id="setting-lang" className="bg-surface-sidebar rounded border border-border p-4">
                  <h3 className="text-xs font-semibold text-text mb-2">{t(lang, 'Language', '语言')}</h3>
                  <button
                    onClick={toggleLang}
                    className="text-xs px-3 py-1.5 rounded border border-border text-text-secondary hover:text-text hover:bg-surface-raised transition-colors"
                  >
                    {lang === 'zh' ? 'English' : '中文'}
                  </button>
                </section>

                {/* Auto-filter rules */}
                <section id="setting-filter" className="bg-surface-sidebar rounded border border-border p-4">
                  <h3 className="text-xs font-semibold text-text mb-1">{t(lang, 'Auto-filter Rules', '自动过滤规则')}</h3>
                  <p className="text-2xs text-text-muted mb-2">
                    {lang === 'zh'
                      ? '按文件夹名称前缀匹配，匹配的文件夹自动归入"已过滤"分组。例如输入 vibe-cli- 会过滤所有以它开头的临时目录。'
                      : 'Prefix-match on folder name; matched folders are grouped as "Filtered". E.g. vibe-cli- filters all temp dirs starting with it.'}
                  </p>
                  <div className="flex gap-2 mb-2">
                    <input
                      value={filterInput}
                      onChange={(e) => setFilterInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { addFilterRule(filterInput); setFilterInput('') } }}
                      placeholder="vibe-cli-"
                      className="flex-1 text-xs px-2 py-1.5 rounded border border-border bg-surface text-text outline-none focus:border-accent"
                    />
                    <button
                      onClick={() => { addFilterRule(filterInput); setFilterInput('') }}
                      className="text-xs px-3 py-1.5 rounded bg-accent text-accent-fg hover:opacity-90 transition-opacity"
                    >
                      {t(lang, 'Add', '添加')}
                    </button>
                  </div>
                  {filterRules.length > 0 && (
                    <div className="space-y-1">
                      {filterRules.map(rule => (
                        <div key={rule} className="flex items-center gap-2 text-xs text-text-secondary">
                          <span className="font-mono">{rule}</span>
                          <span className="text-text-muted flex-1">→ {projects.filter(p => projectTitle(p).startsWith(rule)).length} {t(lang, 'projects', '个项目')}</span>
                          <button
                            onClick={() => removeFilterRule(rule)}
                            aria-label={t(lang, 'Remove', '移除')}
                            className="text-text-muted hover:text-red-400 px-1 flex items-center"
                          ><X className="size-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* About — Loading Rules */}
                <section id="setting-about" className="bg-surface-sidebar rounded border border-border p-4">
                  <h3 className="text-xs font-semibold text-text mb-2">{t(lang, 'About — Loading Rules', '关于 — 加载规则')}</h3>
                  <div className="space-y-3">
                    <p className="text-xs text-text-secondary leading-relaxed">
                      {lang === 'zh' ? (
                        <>所有 CLAUDE.md 文件在 Claude 启动时都会<span className="text-text">合并在一起</span>加载。
                        没有哪个文件会“覆盖”另一个文件——所有内容都会进入上下文。
                        当指令冲突时，更具体的文件（本地 &gt; 项目 &gt; 用户）优先。</>
                      ) : (
                        <>All CLAUDE.md files are <span className="text-text">merged together</span> when Claude starts.
                        No file &quot;overrides&quot; another — all content is visible in context.
                        When instructions conflict, more specific files (Local &gt; Project &gt; User) take precedence.</>
                      )}
                    </p>
                    {GROUP_DEFS.map((g) => {
                      const loc = localizeGroup(g, lang)
                      return (
                        <div key={g.type} className="bg-surface rounded border border-border p-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <GroupIcon type={g.type} color={g.color} className="size-4 shrink-0" />
                            <span style={{ color: g.color }} className="text-sm font-semibold uppercase tracking-wide">{loc.label}</span>
                          </div>
                          <p className="text-xs text-text-secondary leading-relaxed mb-1">{loc.desc}</p>
                          <p className="text-2xs text-text-muted font-mono mb-0.5">{loc.path}</p>
                          <p className="text-2xs text-text-muted">{loc.priority}</p>
                        </div>
                      )
                    })}
                    <div className="text-2xs text-text-muted pt-2 border-t border-border">
                      <p>{t(lang, 'CC Memory — Claude Code memory file manager', 'CC Memory — Claude Code 记忆文件管理器')}</p>
                      {appVersion && <p className="mt-0.5">v{appVersion}</p>}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          ) : showAbout ? (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-xl mx-auto space-y-5">
                <h2 className="text-sm font-semibold text-text">{t(lang, 'Loading Rules', '加载规则')}</h2>
                <p className="text-xs text-text-secondary leading-relaxed">
                  {lang === 'zh' ? (
                    <>所有 CLAUDE.md 文件在 Claude 启动时都会<span className="text-text">合并在一起</span>加载。
                    没有哪个文件会“覆盖”另一个文件——所有内容都会进入上下文。
                    当指令冲突时，更具体的文件（本地 &gt; 项目 &gt; 用户）优先。</>
                  ) : (
                    <>All CLAUDE.md files are <span className="text-text">merged together</span> when Claude starts.
                    No file &quot;overrides&quot; another — all content is visible in context.
                    When instructions conflict, more specific files (Local &gt; Project &gt; User) take precedence.</>
                  )}
                </p>
                {GROUP_DEFS.map((g) => {
                  const loc = localizeGroup(g, lang)
                  return (
                    <div key={g.type} className="bg-surface-sidebar rounded border border-border p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <GroupIcon type={g.type} color={g.color} className="size-4 shrink-0" />
                        <span style={{ color: g.color }} className="text-sm font-semibold uppercase tracking-wide">{loc.label}</span>
                      </div>
                      <p className="text-xs text-text-secondary leading-relaxed mb-1">{loc.desc}</p>
                      <p className="text-2xs text-text-muted font-mono mb-0.5">{loc.path}</p>
                      <p className="text-2xs text-text-muted">{loc.priority}</p>
                    </div>
                  )
                })}
                <div className="text-2xs text-text-muted pt-2 border-t border-border">
                  <p>{t(lang, 'CC Memory — Claude Code memory file manager', 'CC Memory — Claude Code 记忆文件管理器')}</p>
                  {appVersion && <p className="mt-0.5">v{appVersion}</p>}
                </div>
              </div>
            </div>
          ) : selectedFile ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Collapsible loading rules for this memory type */}
              {(() => {
                const def = GROUP_DEFS.find(g => g.type === selectedFile.type)
                if (!def) return null
                const loc = localizeGroup(def, lang)
                return (
                  <div className="border-b border-border">
                    <div
                      onClick={() => setRulesExpanded(!rulesExpanded)}
                      className="px-4 py-2 flex items-center gap-2 cursor-pointer hover:bg-surface-raised/50 transition-colors select-none"
                    >
                      {rulesExpanded ? (
                        <ChevronDown className="size-3 shrink-0 text-text-muted" />
                      ) : (
                        <ChevronRight className="size-3 shrink-0 text-text-muted" />
                      )}
                      <GroupIcon type={def.type} color={def.color} />
                      <span style={{ color: def.color }} className="text-2xs font-semibold uppercase tracking-wide">{loc.label}</span>
                      <span className="text-2xs text-text-muted truncate">— {loc.desc.slice(0, 60)}…</span>
                    </div>
                    {rulesExpanded && (
                      <div className="px-4 pb-2 space-y-1">
                        <p className="text-2xs text-text-secondary leading-relaxed">{loc.desc}</p>
                        <p className="text-2xs text-text-muted font-mono">{loc.path}</p>
                        <p className="text-2xs text-text-muted">{loc.priority}</p>
                        {selectedFileSources.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap pt-1">
                            <span className="inline-flex items-center gap-1 text-2xs text-text-muted">
                              <Link2 className="size-3" />
                              {t(lang, 'Indexed by', '索引来源')}:
                            </span>
                            {selectedFileSources.map(s => (
                              <button
                                key={s.path}
                                onClick={() => void openFile(s.path, s.line)}
                                title={lang === 'zh' ? (s.line ? `跳转到第 ${s.line} 行` : '跳转到文件') : (s.line ? `Jump to line ${s.line}` : 'Jump to file')}
                                className="text-2xs px-1.5 py-0.5 rounded border border-border text-accent hover:bg-surface-raised transition-colors"
                              >
                                {s.fileName}{s.line ? `:${s.line}` : ''}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}
              {/* File path + actions + info */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface-sidebar/30"
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
                <div className="flex min-w-0 items-center gap-2 text-xs">
                  <span className="font-mono text-text-secondary truncate">{selectedFile.path.split(/[\\/]/).pop()}</span>
                  <GitStatusIcon status={gitStatus[selectedFile.path]} lang={lang} />
                  <span className="text-2xs text-text-muted">{shortenPath(selectedFile.path)}</span>
                  {isDirty && (
                    <span className="inline-flex items-center gap-1 text-2xs text-yellow-500">
                      <Circle className="size-1.5 fill-current" />
                      {t(lang, 'Unsaved', '未保存')}
                    </span>
                  )}
                  {diskUpdated && (
                    <span className="inline-flex items-center gap-1 text-2xs text-yellow-500">
                      <AlertTriangle className="size-3" />
                      {t(lang, 'Disk updated', '磁盘已更新')}
                    </span>
                  )}
                  <span className="text-2xs text-text-muted">| {editingContent.split('\n').length} lines · {new Blob([editingContent]).size.toLocaleString()} bytes · {formatTokens(Math.ceil(editingContent.length / 4))}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                  <button onClick={handleSave} disabled={isSaving || !isDirty}
                    className={`text-xs px-3 py-1 rounded transition-colors ${
                      isDirty ? 'bg-accent text-accent-fg hover:opacity-90' : 'bg-surface-raised text-text-muted'
                    }`}>
                    {isSaving ? t(lang, 'Saving…', '保存中…') : t(lang, 'Save', '保存')}
                  </button>
                  {selectedFile.type === 'AutoMem' && (
                    <button onClick={handleDelete}
                      className="text-xs px-3 py-1 bg-surface-raised hover:bg-red-900 text-text-secondary hover:text-red-400 rounded transition-colors">
                      {t(lang, 'Delete', '删除')}
                    </button>
                  )}
                </div>
              </div>
              <CodeMirrorEditor value={editingContent} onChange={(v) => { setEditingContent(v); setIsDirty(v !== originalContentRef.current) }} highlightLine={highlightLine} />
            </div>
          ) : selectedSession ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center px-4 py-2 border-b border-border bg-surface-sidebar"
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
                <div className="flex min-w-0 items-center gap-3 text-xs">
                  <FileJson className="size-3.5 shrink-0 text-text-muted" />
                  <span className="truncate font-mono text-text-secondary">{selectedSession.id}.jsonl</span>
                  <span className="text-text-muted">{selectedSession.firstMessage?.slice(0, 50)}</span>
                </div>
              </div>
              {loadingJsonl ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="animate-spin size-4 border-2 border-accent border-t-transparent rounded-full" />
                </div>
              ) : jsonlContent ? (
                <CodeMirrorEditor value={jsonlContent} onChange={() => {}} readOnly />
              ) : (
                <div className="flex-1 flex items-center justify-center text-text-muted text-sm">{t(lang, 'Failed to load session data', '无法加载会话数据')}</div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-muted text-sm"
              style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
              {selectedProjectId
                ? t(lang, 'Select a file or session to view', '选择一个文件或会话进行查看')
                : t(lang, 'Select a project to browse files', '选择一个项目以浏览文件')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App

// ============================================================
// CodeMirror 6 Editor
// ============================================================

// Line-highlight support: used when jumping back to a source file from the Index.
// The effect carries a 1-based line number; the field resolves it to a concrete
// range at dispatch time and keeps it mapped as the document changes.
const setHighlightLine = StateEffect.define<number | null>()
const highlightLineField = StateField.define<{ from: number; to: number } | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (!e.is(setHighlightLine)) continue
      const lineNo = e.value
      if (lineNo == null) return null
      const line = tr.state.doc.line(Math.min(Math.max(1, lineNo), tr.state.doc.lines))
      return { from: line.from, to: line.to }
    }
    return value
  },
  provide: f => EditorView.decorations.from(f, hl =>
    hl ? Decoration.set([Decoration.line({ class: 'cm-lineHighlight' }).range(hl.from)]) : Decoration.none
  ),
})

const CodeMirrorEditor = ({ value, onChange, readOnly, highlightLine }: { value: string; onChange: (v: string) => void; readOnly?: boolean; highlightLine?: number | null }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const externalUpdateRef = useRef(false)
  const isLightRef = useRef(document.documentElement.classList.contains('light'))

  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const createView = (target: HTMLDivElement) => {
      const isLight = isLightRef.current
      const fillTheme = EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { overflowY: 'auto' },
      })
      const state = EditorState.create({
        doc: value,
        extensions: [
          fillTheme,
          markdown(),
          ...(isLight ? [] : [oneDark]),
          lineNumbers(),
          EditorView.lineWrapping,
          highlightLineField,
          ...(isLight ? [syntaxHighlighting(defaultHighlightStyle), EditorView.theme({
            '&': { backgroundColor: 'var(--color-surface)' },
            '.cm-gutters': { backgroundColor: 'var(--color-surface-raised)', color: 'var(--color-text-muted)', borderRight: '1px solid var(--color-border)' },
            '.cm-activeLineGutter': { backgroundColor: 'var(--color-surface-raised)' },
            '.cm-activeLine': { backgroundColor: 'rgba(0,0,0,0.04)' },
            '.cm-cursor': { borderLeftColor: 'var(--color-text)' },
            '.cm-selectionBackground': { backgroundColor: 'rgba(0,0,0,0.1)' },
            '&.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(0,0,0,0.15)' },
          }, { dark: false })] : []),
          ...(readOnly ? [EditorView.editable.of(false)] : []),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !externalUpdateRef.current) onChangeRef.current(update.state.doc.toString())
            externalUpdateRef.current = false
          }),
        ],
      })
      const view = new EditorView({ state, parent: target })
      viewRef.current = view
    }

    // Recreate when theme changes (detected via DOM observer on <html> class)
    const observer = new MutationObserver(() => {
      const nowLight = document.documentElement.classList.contains('light')
      if (nowLight !== isLightRef.current) {
        isLightRef.current = nowLight
        viewRef.current?.destroy()
        viewRef.current = null
        createView(container)
      }
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    createView(container)
    return () => { observer.disconnect(); viewRef.current?.destroy(); viewRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- mount-only; value/readOnly changes are handled by the sync effect below

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      externalUpdateRef.current = true
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    }
  }, [value])

  // Scroll to and highlight a target line (jump-back from Index).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (typeof highlightLine === 'number' && highlightLine >= 1) {
      const line = view.state.doc.line(Math.min(highlightLine, view.state.doc.lines))
      view.dispatch({
        selection: { anchor: line.from },
        effects: [EditorView.scrollIntoView(line.from, { y: 'center' }), setHighlightLine.of(highlightLine)],
      })
    } else {
      view.dispatch({ effects: setHighlightLine.of(null) })
    }
  }, [highlightLine])

  return <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden" />
}
