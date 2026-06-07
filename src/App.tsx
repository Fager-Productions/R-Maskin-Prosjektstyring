import { useEffect, useMemo, useState } from 'react'
import logoImage from '../Logo.png'
import runeImage from '../Rune3.png'
import { EmptyState } from './components/EmptyState'
import { addPurchase } from './features/purchases/purchaseOps'
import {
  buildProjectMailto,
  createProjectReceiptBundle,
  downloadProjectReceiptBundle,
  downloadProjectPdf,
  projectTotalCost,
} from './features/reports/report'
import { addTask, deleteTask, toggleTaskDone, updateTask } from './features/tasks/taskOps'
import { deletePurchase, updatePurchase } from './features/purchases/purchaseOps'
import {
  addSampleProjects,
  createProject,
  deleteArchivedProject,
  emptyArchivedProjects,
  loadState,
  mergeArchivedProjects,
  removeProject,
  restoreArchivedProject,
  saveState,
  selectProject,
  updateContractor,
  updateProject,
  updateProjectStatus,
} from './lib/storage'
import type { AppState, ContractorProfile, ProjectStatus, ReceiptAttachment } from './lib/types'
import { downloadJsonFile, formatDate, formatMoney, readJsonFile, uid } from './lib/utils'
import './styles/app.css'

const statusList: ProjectStatus[] = ['Planlegging', 'Pågående', 'Ferdig']
const archiveSortOptions = ['Nyest først', 'Eldst først', 'Navn A-Å', 'Navn Å-A'] as const
const BACKUP_META_KEY = 'r-maskin-full-backup-meta-v1'
const UI_PREFS_KEY = 'r-maskin-ui-prefs-v1'
const BACKUP_VERSION = '1.0.0'
const APP_VERSION = '1.0.0'
const BACKUP_REMINDER_DAYS = 7
const MAX_RECEIPT_SIZE_BYTES = 4 * 1024 * 1024
const MAX_RECEIPT_IMAGE_DIMENSION = 1800
const RECEIPT_IMAGE_QUALITY = 0.78

type ArchiveSortOption = (typeof archiveSortOptions)[number]
type BackupMetaItem = {
  type: 'eksport' | 'import'
  fileName: string
  at: string
  backupVersion: string
  appVersion: string
}

type BackupMeta = {
  lastExportedAt?: string
  history: BackupMetaItem[]
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type StandaloneNavigator = Navigator & {
  standalone?: boolean
}

type UiPrefs = {
  showAppDescription: boolean
  showProjectsTab: boolean
  showTasksTab: boolean
  showPurchasesTab: boolean
  showActiveProjectTab: boolean
}

const initialState = loadState()

const isRunningStandalone = () => {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as StandaloneNavigator).standalone === true
  )
}

const loadBackupMeta = (): BackupMeta => {
  try {
    const raw = localStorage.getItem(BACKUP_META_KEY)
    if (!raw) {
      return { history: [] }
    }

    const parsed = JSON.parse(raw) as BackupMeta
    if (!Array.isArray(parsed.history)) {
      return { history: [] }
    }

    return parsed
  } catch {
    return { history: [] }
  }
}

const loadUiPrefs = (): UiPrefs => {
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY)
    if (!raw) {
      return {
        showAppDescription: false,
        showProjectsTab: true,
        showTasksTab: true,
        showPurchasesTab: true,
        showActiveProjectTab: true,
      }
    }

    const parsed = JSON.parse(raw) as Partial<UiPrefs>
    return {
      showAppDescription: parsed.showAppDescription ?? false,
      showProjectsTab: parsed.showProjectsTab ?? true,
      showTasksTab: parsed.showTasksTab ?? true,
      showPurchasesTab: parsed.showPurchasesTab ?? true,
      showActiveProjectTab: parsed.showActiveProjectTab ?? true,
    }
  } catch {
    return {
      showAppDescription: false,
      showProjectsTab: true,
      showTasksTab: true,
      showPurchasesTab: true,
      showActiveProjectTab: true,
    }
  }
}

const blobToDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Kunne ikke lese filinnhold.'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Kunne ikke lese filen.'))
    reader.readAsDataURL(blob)
  })
}

const loadImageFromFile = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Kunne ikke lese bilde for komprimering.'))
    }
    image.src = objectUrl
  })
}

const compressImageFile = async (file: File): Promise<Blob> => {
  const image = await loadImageFromFile(file)
  const longestSide = Math.max(image.width, image.height)
  const scale = Math.min(1, MAX_RECEIPT_IMAGE_DIMENSION / longestSide)
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) {
    return file
  }

  context.drawImage(image, 0, 0, width, height)
  const compressedBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', RECEIPT_IMAGE_QUALITY)
  })

  if (!compressedBlob) {
    return file
  }

  return compressedBlob.size < file.size ? compressedBlob : file
}

const withJpegExtension = (fileName: string): string => {
  if (/\.jpe?g$/i.test(fileName)) {
    return fileName
  }

  const withoutExtension = fileName.replace(/\.[^.]+$/, '')
  return `${withoutExtension || fileName}.jpg`
}

const toReceiptAttachment = async (file: File): Promise<ReceiptAttachment> => {
  const isImage = file.type.startsWith('image/')
  const processedBlob = isImage ? await compressImageFile(file) : file
  const mimeType = processedBlob.type || file.type || 'application/octet-stream'

  return {
    id: uid(),
    fileName: isImage && mimeType === 'image/jpeg' ? withJpegExtension(file.name) : file.name,
    mimeType,
    dataUrl: await blobToDataUrl(processedBlob),
    sizeBytes: processedBlob.size,
    addedAt: new Date().toISOString(),
  }
}

const toDateInputValue = (value: string): string => {
  return value.includes('T') ? value.slice(0, 10) : value
}

function App() {
  const initialUiPrefs = useMemo(loadUiPrefs, [])
  const [state, setState] = useState<AppState>(initialState)
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [showProjectEditForm, setShowProjectEditForm] = useState(false)
  const [showContractorForm, setShowContractorForm] = useState(false)
  const [showRestorePanel, setShowRestorePanel] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const [archiveSearch, setArchiveSearch] = useState('')
  const [archiveSort, setArchiveSort] = useState<ArchiveSortOption>('Nyest først')
  const [confirmEmptyArchive, setConfirmEmptyArchive] = useState(false)
  const [confirmPermanentDeleteId, setConfirmPermanentDeleteId] = useState<string>()
  const [deleteConfirmProjectId, setDeleteConfirmProjectId] = useState<string>()
  const [deleteFinalProjectId, setDeleteFinalProjectId] = useState<string>()
  const [contractorForm, setContractorForm] = useState<ContractorProfile>(initialState.contractor)
  const [projectForm, setProjectForm] = useState({
    name: '',
    client: '',
    clientContact: '',
    clientPhone: '',
    clientEmail: '',
    addressLine1: '',
    addressLine2: '',
    postalCode: '',
    city: '',
    status: 'Planlegging' as ProjectStatus,
  })
  const [backupMeta, setBackupMeta] = useState<BackupMeta>(loadBackupMeta)
  const [backupMessage, setBackupMessage] = useState('')
  const [sampleProjectsMessage, setSampleProjectsMessage] = useState('')
  const [showAppDescription, setShowAppDescription] = useState(initialUiPrefs.showAppDescription)
  const [showProjectsTab, setShowProjectsTab] = useState(initialUiPrefs.showProjectsTab)
  const [showTasksTab, setShowTasksTab] = useState(initialUiPrefs.showTasksTab)
  const [showPurchasesTab, setShowPurchasesTab] = useState(initialUiPrefs.showPurchasesTab)
  const [showActiveProjectTab, setShowActiveProjectTab] = useState(initialUiPrefs.showActiveProjectTab)
  const [includeReceiptBundle, setIncludeReceiptBundle] = useState(false)
  const [receiptBundleMessage, setReceiptBundleMessage] = useState('')
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installMessage, setInstallMessage] = useState('')
  const [isInstalledApp, setIsInstalledApp] = useState(() => isRunningStandalone())
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    dueDate: '',
  })
  const [purchaseForm, setPurchaseForm] = useState({
    itemName: '',
    supplier: '',
    supplierPhone: '',
    supplierEmail: '',
    purchasedAt: '',
    amountNok: '',
    notes: '',
    receipts: [] as ReceiptAttachment[],
  })
  const [purchaseReceiptError, setPurchaseReceiptError] = useState('')
  const [editingTaskId, setEditingTaskId] = useState<string>()
  const [editingPurchaseId, setEditingPurchaseId] = useState<string>()
  const [expandedCompletedTaskIds, setExpandedCompletedTaskIds] = useState<string[]>([])

  const selectedProject = useMemo(() => {
    return state.projects.find((project) => project.id === state.selectedProjectId)
  }, [state.projects, state.selectedProjectId])

  const filteredArchivedProjects = useMemo(() => {
    const query = archiveSearch.trim().toLowerCase()
    const filteredProjects = query
      ? state.archivedProjects.filter((project) => {
          return [project.name, project.client, project.city]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(query))
        })
      : state.archivedProjects

    const sortedProjects = [...filteredProjects]
    sortedProjects.sort((left, right) => {
      if (archiveSort === 'Eldst først') {
        return (left.archivedAt ?? left.updatedAt).localeCompare(right.archivedAt ?? right.updatedAt)
      }
      if (archiveSort === 'Navn A-Å') {
        return left.name.localeCompare(right.name, 'nb-NO')
      }
      if (archiveSort === 'Navn Å-A') {
        return right.name.localeCompare(left.name, 'nb-NO')
      }
      return (right.archivedAt ?? right.updatedAt).localeCompare(left.archivedAt ?? left.updatedAt)
    })

    return sortedProjects
  }, [archiveSearch, archiveSort, state.archivedProjects])

  const needsBackupReminder = useMemo(() => {
    if (!backupMeta.lastExportedAt) {
      return true
    }

    const lastExport = new Date(backupMeta.lastExportedAt).getTime()
    if (Number.isNaN(lastExport)) {
      return true
    }

    const diffDays = (Date.now() - lastExport) / 86400000
    return diffDays >= BACKUP_REMINDER_DAYS
  }, [backupMeta.lastExportedAt])

  useEffect(() => {
    localStorage.setItem(BACKUP_META_KEY, JSON.stringify(backupMeta))
  }, [backupMeta])

  useEffect(() => {
    localStorage.setItem(
      UI_PREFS_KEY,
      JSON.stringify({
        showAppDescription,
        showProjectsTab,
        showTasksTab,
        showPurchasesTab,
        showActiveProjectTab,
      } satisfies UiPrefs),
    )
  }, [showActiveProjectTab, showAppDescription, showProjectsTab, showPurchasesTab, showTasksTab])

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      if (isRunningStandalone()) {
        return
      }
      event.preventDefault()
      setInstallPromptEvent(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setIsInstalledApp(true)
      setInstallPromptEvent(null)
      setInstallMessage('')
    }

    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const handleDisplayModeChange = () => {
      if (mediaQuery.matches) {
        setIsInstalledApp(true)
        setInstallPromptEvent(null)
        setInstallMessage('')
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    mediaQuery.addEventListener('change', handleDisplayModeChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      mediaQuery.removeEventListener('change', handleDisplayModeChange)
    }
  }, [])

  const commit = (nextState: AppState) => {
    setState(nextState)
    saveState(nextState)
  }

  const requestProjectDelete = (projectId: string) => {
    setDeleteConfirmProjectId(projectId)
    setDeleteFinalProjectId(undefined)
  }

  const confirmProjectDelete = (projectId: string) => {
    setDeleteFinalProjectId(projectId)
  }

  const archiveProject = (projectId: string) => {
    commit(removeProject(state, projectId))
    setDeleteConfirmProjectId(undefined)
    setDeleteFinalProjectId(undefined)
    setShowArchive(true)
  }

  const cancelProjectDelete = () => {
    setDeleteConfirmProjectId(undefined)
    setDeleteFinalProjectId(undefined)
  }

  const exportArchiveBackup = () => {
    downloadJsonFile('r-maskin-slettemappe-backup.json', {
      exportedAt: new Date().toISOString(),
      contractor: state.contractor,
      archivedProjects: state.archivedProjects,
    })
  }

  const exportFullBackup = () => {
    const exportedAt = new Date().toISOString()
    const fileName = `r-maskin-full-backup-${exportedAt.slice(0, 19).replaceAll(':', '-')}.json`
    downloadJsonFile(fileName, {
      backupVersion: BACKUP_VERSION,
      appVersion: APP_VERSION,
      exportedAt,
      appState: state,
    })

    setBackupMeta((prev) => ({
      lastExportedAt: exportedAt,
      history: [
        {
          type: 'eksport',
          fileName,
          at: exportedAt,
          backupVersion: BACKUP_VERSION,
          appVersion: APP_VERSION,
        } as BackupMetaItem,
        ...prev.history,
      ].slice(0, 12),
    }))
    setBackupMessage('Full backup eksportert. Lagre filen på et trygt sted, for eksempel i sky eller på PC.')
  }

  const importArchiveBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const parsed = await readJsonFile<{ archivedProjects?: AppState['archivedProjects'] }>(file)
      const importedProjects = Array.isArray(parsed.archivedProjects) ? parsed.archivedProjects : []
      commit(mergeArchivedProjects(state, importedProjects))
      setShowArchive(true)
      setBackupMessage(`Importert ${importedProjects.length} prosjekt(er) til slettemappen. Duplikater ble hoppet over.`)
    } finally {
      event.target.value = ''
    }
  }

  const importFullBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const parsed = await readJsonFile<{
        backupVersion?: string
        appVersion?: string
        exportedAt?: string
        appState?: AppState
      }>(file)
      if (parsed.appState) {
        commit(parsed.appState)
        const importedAt = new Date().toISOString()
        setBackupMeta((prev) => ({
          ...prev,
          history: [
            {
              type: 'import',
              fileName: file.name,
              at: importedAt,
              backupVersion: parsed.backupVersion || 'ukjent',
              appVersion: parsed.appVersion || 'ukjent',
            } as BackupMetaItem,
            ...prev.history,
          ].slice(0, 12),
        }))
        setBackupMessage(
          `Full backup importert. Fil: ${file.name}. Backupversjon: ${parsed.backupVersion || 'ukjent'}.`,
        )
      }
    } finally {
      event.target.value = ''
    }
  }

  const onSaveContractor = (event: React.FormEvent) => {
    event.preventDefault()
    if (!contractorForm.name || !contractorForm.addressLine1 || !contractorForm.postalCode || !contractorForm.city) {
      return
    }

    const nextState = updateContractor(state, contractorForm)
    commit(nextState)
    setShowContractorForm(false)
  }

  const onCreateProject = (event: React.FormEvent) => {
    event.preventDefault()
    if (
      !projectForm.name ||
      !projectForm.client ||
      !projectForm.addressLine1 ||
      !projectForm.postalCode ||
      !projectForm.city
    ) {
      return
    }
    const nextState = createProject(state, projectForm)
    commit(nextState)
    setProjectForm({
      name: '',
      client: '',
      clientContact: '',
      clientPhone: '',
      clientEmail: '',
      addressLine1: '',
      addressLine2: '',
      postalCode: '',
      city: '',
      status: 'Planlegging',
    })
    setShowProjectForm(false)
    setSampleProjectsMessage('')
  }

  const onAddSampleProjects = () => {
    const beforeCount = state.projects.length
    const nextState = addSampleProjects(state)
    const addedCount = nextState.projects.length - beforeCount

    if (addedCount > 0) {
      commit(nextState)
      setSampleProjectsMessage(`La til ${addedCount} eksempelprosjekt(er).`)
      return
    }

    setSampleProjectsMessage('Eksempelprosjektene finnes allerede.')
  }

  const onUpdateProject = (event: React.FormEvent) => {
    event.preventDefault()
    if (
      !selectedProject ||
      !projectForm.name ||
      !projectForm.client ||
      !projectForm.addressLine1 ||
      !projectForm.postalCode ||
      !projectForm.city
    ) {
      return
    }

    commit(updateProject(state, selectedProject.id, projectForm))
    setShowProjectEditForm(false)
  }

  const onAddTask = (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedProject || !taskForm.title || !taskForm.dueDate) {
      return
    }
    const nextState = editingTaskId
      ? updateTask(state, selectedProject.id, editingTaskId, taskForm)
      : addTask(state, selectedProject.id, taskForm)
    commit(nextState)
    setTaskForm({ title: '', description: '', dueDate: '' })
    setEditingTaskId(undefined)
  }

  const onAddPurchase = (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedProject || !purchaseForm.itemName || !purchaseForm.purchasedAt) {
      return
    }
    const amount = Number.parseFloat(purchaseForm.amountNok)
    if (Number.isNaN(amount)) {
      return
    }
    const nextState = editingPurchaseId
      ? updatePurchase(state, selectedProject.id, editingPurchaseId, {
          ...purchaseForm,
          amountNok: amount,
        })
      : addPurchase(state, selectedProject.id, {
          ...purchaseForm,
          amountNok: amount,
        })
    commit(nextState)
    setPurchaseForm({
      itemName: '',
      supplier: '',
      supplierPhone: '',
      supplierEmail: '',
      purchasedAt: '',
      amountNok: '',
      notes: '',
      receipts: [],
    })
    setEditingPurchaseId(undefined)
    setPurchaseReceiptError('')
  }

  const appendReceipts = async (files: File[]) => {
    if (files.length === 0) {
      return
    }

    const attachments = await Promise.all(files.map((file) => toReceiptAttachment(file)))
    const accepted = attachments.filter((attachment) => attachment.sizeBytes <= MAX_RECEIPT_SIZE_BYTES)
    const rejected = attachments.filter((attachment) => attachment.sizeBytes > MAX_RECEIPT_SIZE_BYTES)

    if (accepted.length > 0) {
      setPurchaseForm((prev) => ({
        ...prev,
        receipts: [...prev.receipts, ...accepted],
      }))
    }

    if (rejected.length > 0) {
      setPurchaseReceiptError(
        `Disse kvitteringene er over ${Math.round(MAX_RECEIPT_SIZE_BYTES / (1024 * 1024))} MB: ${rejected
          .map((item) => item.fileName)
          .join(', ')}`,
      )
      return
    }

    setPurchaseReceiptError('')
  }

  const onReceiptFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    await appendReceipts(files)
    event.target.value = ''
  }

  const onCameraReceiptSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    await appendReceipts(files)
    event.target.value = ''
  }

  const removeReceiptFromForm = (receiptId: string) => {
    setPurchaseForm((prev) => ({
      ...prev,
      receipts: prev.receipts.filter((receipt) => receipt.id !== receiptId),
    }))
  }

  const maybeDownloadReceiptBundle = async (): Promise<void> => {
    if (!selectedProject || !includeReceiptBundle) {
      setReceiptBundleMessage('')
      return
    }

    const created = await downloadProjectReceiptBundle(selectedProject, state.contractor)
    if (created) {
      setReceiptBundleMessage('Kvitteringspakke (.zip) ble lastet ned sammen med rapporten.')
      return
    }

    setReceiptBundleMessage('Ingen kvitteringer funnet i prosjektet, så kvitteringspakke ble ikke laget.')
  }

  const tryShareReceiptBundleAsAttachment = async (): Promise<boolean> => {
    if (!selectedProject || !includeReceiptBundle || !navigator.share || typeof File === 'undefined') {
      return false
    }

    const bundle = await createProjectReceiptBundle(selectedProject, state.contractor)
    if (!bundle) {
      return false
    }

    const file = new File([bundle.blob], bundle.fileName, { type: 'application/zip' })
    const shareData: ShareData = {
      title: `Prosjektrapport ${selectedProject.name}`,
      text: `Vedlagt kvitteringspakke for prosjektet ${selectedProject.name}.`,
      files: [file],
    }

    const canShareFiles =
      typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] })
    if (!canShareFiles) {
      return false
    }

    try {
      await navigator.share(shareData)
      setReceiptBundleMessage('Vedlegg delt via systemets delefunksjon. Velg Mail for å sende med vedlegg.')
      return true
    } catch {
      return false
    }
  }

  const onGeneratePdf = async () => {
    if (!selectedProject) {
      return
    }

    downloadProjectPdf(selectedProject, state.contractor)
    await maybeDownloadReceiptBundle()
  }

  const onCreateMailDraft = async () => {
    if (!selectedProject) {
      return
    }

    const sharedWithAttachment = await tryShareReceiptBundleAsAttachment()
    if (sharedWithAttachment) {
      return
    }

    await maybeDownloadReceiptBundle()
    if (includeReceiptBundle) {
      setReceiptBundleMessage((prev) =>
        prev
          ? `${prev} Nettleser tillot ikke automatisk vedlegg i e-postutkast.`
          : 'Nettleser tillot ikke automatisk vedlegg i e-postutkast.',
      )
    }
    window.location.href = buildProjectMailto(selectedProject, state.contractor)
  }

  const onInstallApp = async () => {
    if (!installPromptEvent) {
      setInstallMessage('Bruk nettleserens meny og velg "Installer app" eller "Legg til på hjemskjerm".')
      return
    }

    await installPromptEvent.prompt()
    const choiceResult = await installPromptEvent.userChoice
    if (choiceResult.outcome === 'accepted') {
      setInstallMessage('Installering startet. Appen blir tilgjengelig fra hjemskjerm/programmer.')
    } else {
      setInstallMessage('Installering ble avbrutt.')
    }
    setInstallPromptEvent(null)
  }

  return (
    <main className="layout">
      <header className="topbar">
        <div className="topbar-content">
          <div className="hero-brand">
            <img className="hero-brand__logo" src={logoImage} alt="R-Maskin AS logo" />
          </div>
          <h1 className="app-title">Prosjektstyring</h1>
          {!isInstalledApp && (
            <div className="install-box">
              <button type="button" className="secondary" onClick={onInstallApp}>
                Installer app
              </button>
              {installMessage && <p className="install-message">{installMessage}</p>}
            </div>
          )}
          {needsBackupReminder && (
            <div className="backup-reminder">
              Husk å ta full backup. Det er mer enn {BACKUP_REMINDER_DAYS} dager siden sist eksport.
              <button type="button" onClick={exportFullBackup}>
                Ta backup nå
              </button>
            </div>
          )}
        </div>
        <div className="contractor-box">
          <div className="contractor-box__header">
            <strong>Firmaopplysninger</strong>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setContractorForm(state.contractor)
                setShowContractorForm((prev) => !prev)
              }}
            >
              {showContractorForm ? 'Lukk' : 'Rediger'}
            </button>
          </div>
          {showContractorForm && (
            <>
              <p>{state.contractor.name}</p>
              <p>{state.contractor.addressLine1}</p>
              {state.contractor.addressLine2 && <p>{state.contractor.addressLine2}</p>}
              <p>
                {state.contractor.postalCode} {state.contractor.city}
              </p>
              {state.contractor.phone && <p>Tlf: {state.contractor.phone}</p>}
              {state.contractor.email && <p>E-post: {state.contractor.email}</p>}
              {state.contractor.orgNumber && <p>Org.nr: {state.contractor.orgNumber}</p>}
              <div className="stack backup-actions">
                <button type="button" className="secondary" onClick={exportFullBackup}>
                  Eksporter full backup
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowRestorePanel((prev) => !prev)}
                >
                  {showRestorePanel ? 'Lukk gjenoppretting' : 'Åpne gjenoppretting'}
                </button>
                {backupMessage && <p className="backup-message">{backupMessage}</p>}

                {showRestorePanel && (
                  <div className="restore-panel">
                    <p>
                      Importer en full backupfil for å gjenopprette all informasjon i appen etter
                      enhetsbytte eller krasj.
                    </p>
                    <label className="button-like secondary archive-import">
                      Importer full backup
                      <input type="file" accept="application/json" onChange={importFullBackup} />
                    </label>
                    <div className="backup-history">
                      <strong>Backupoversikt</strong>
                      {backupMeta.history.length === 0 && <p>Ingen backuphistorikk ennå.</p>}
                      {backupMeta.history.length > 0 && (
                        <ul>
                          {backupMeta.history.map((item, index) => (
                            <li key={`${item.fileName}-${item.at}-${index}`}>
                              {item.type.toUpperCase()} | {formatDate(item.at)} | {item.fileName} |
                              Backup v{item.backupVersion} | App v{item.appVersion}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <form className="stack contractor-form" onSubmit={onSaveContractor}>
                <input
                  type="text"
                  placeholder="Firmanavn"
                  value={contractorForm.name}
                  onChange={(event) =>
                    setContractorForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  required
                />
                <input
                  type="text"
                  placeholder="Adresse"
                  value={contractorForm.addressLine1}
                  onChange={(event) =>
                    setContractorForm((prev) => ({ ...prev, addressLine1: event.target.value }))
                  }
                  required
                />
                <input
                  type="text"
                  placeholder="Adresselinje 2"
                  value={contractorForm.addressLine2}
                  onChange={(event) =>
                    setContractorForm((prev) => ({ ...prev, addressLine2: event.target.value }))
                  }
                />
                <div className="inline-fields">
                  <input
                    type="text"
                    placeholder="Postnr"
                    value={contractorForm.postalCode}
                    onChange={(event) =>
                      setContractorForm((prev) => ({ ...prev, postalCode: event.target.value }))
                    }
                    required
                  />
                  <input
                    type="text"
                    placeholder="Sted"
                    value={contractorForm.city}
                    onChange={(event) =>
                      setContractorForm((prev) => ({ ...prev, city: event.target.value }))
                    }
                    required
                  />
                </div>
                <div className="inline-fields inline-fields--equal">
                  <input
                    type="tel"
                    placeholder="Firmatelefon"
                    value={contractorForm.phone}
                    onChange={(event) =>
                      setContractorForm((prev) => ({ ...prev, phone: event.target.value }))
                    }
                  />
                  <input
                    type="email"
                    placeholder="Firma e-post"
                    value={contractorForm.email}
                    onChange={(event) =>
                      setContractorForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                  />
                </div>
                <input
                  type="text"
                  placeholder="Organisasjonsnummer"
                  value={contractorForm.orgNumber}
                  onChange={(event) =>
                    setContractorForm((prev) => ({ ...prev, orgNumber: event.target.value }))
                  }
                />
                <button type="submit">Lagre firmaopplysninger</button>
              </form>
            </>
          )}
        </div>
      </header>

      <section className="grid">
        <aside className="panel project-list-panel">
          <div className="section-header">
            <h2>Prosjekter</h2>
            <button
              type="button"
              className="secondary tab-toggle"
              onClick={() => setShowProjectsTab((prev) => !prev)}
              aria-label={showProjectsTab ? 'Skjul prosjektfane' : 'Vis prosjektfane'}
            >
              {showProjectsTab ? '▾' : '▸'}
            </button>
          </div>
          {showProjectsTab && (
            <>
              <button
                type="button"
                className="project-toggle-button"
                onClick={() => setShowProjectForm((prev) => !prev)}
              >
                {showProjectForm ? 'Lukk nytt prosjekt' : 'Nytt prosjekt'}
              </button>
              <button
                type="button"
                className="secondary project-samples-button"
                onClick={onAddSampleProjects}
              >
                Legg til 3 eksempelprosjekter
              </button>
              {sampleProjectsMessage && <p className="sample-projects-message">{sampleProjectsMessage}</p>}

              {showProjectForm && (
                <form className="stack" onSubmit={onCreateProject}>
              <input
                type="text"
                placeholder="Prosjektnavn"
                value={projectForm.name}
                onChange={(event) => setProjectForm((p) => ({ ...p, name: event.target.value }))}
                required
              />
              <input
                type="text"
                placeholder="Kunde"
                value={projectForm.client}
                onChange={(event) => setProjectForm((p) => ({ ...p, client: event.target.value }))}
                required
              />
              <input
                type="text"
                placeholder="Kontaktperson"
                value={projectForm.clientContact}
                onChange={(event) =>
                  setProjectForm((p) => ({ ...p, clientContact: event.target.value }))
                }
              />
              <div className="inline-fields inline-fields--equal">
                <input
                  type="tel"
                  placeholder="Telefon"
                  value={projectForm.clientPhone}
                  onChange={(event) =>
                    setProjectForm((p) => ({ ...p, clientPhone: event.target.value }))
                  }
                />
                <input
                  type="email"
                  placeholder="E-post"
                  value={projectForm.clientEmail}
                  onChange={(event) =>
                    setProjectForm((p) => ({ ...p, clientEmail: event.target.value }))
                  }
                />
              </div>
              <input
                type="text"
                placeholder="Adresse"
                value={projectForm.addressLine1}
                onChange={(event) =>
                  setProjectForm((p) => ({ ...p, addressLine1: event.target.value }))
                }
                required
              />
              <input
                type="text"
                placeholder="Adresselinje 2"
                value={projectForm.addressLine2}
                onChange={(event) =>
                  setProjectForm((p) => ({ ...p, addressLine2: event.target.value }))
                }
              />
              <div className="inline-fields">
                <input
                  type="text"
                  placeholder="Postnr"
                  value={projectForm.postalCode}
                  onChange={(event) =>
                    setProjectForm((p) => ({ ...p, postalCode: event.target.value }))
                  }
                  required
                />
                <input
                  type="text"
                  placeholder="Sted"
                  value={projectForm.city}
                  onChange={(event) =>
                    setProjectForm((p) => ({ ...p, city: event.target.value }))
                  }
                  required
                />
              </div>
              <select
                value={projectForm.status}
                onChange={(event) =>
                  setProjectForm((p) => ({ ...p, status: event.target.value as ProjectStatus }))
                }
              >
                {statusList.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <button type="submit">Legg til prosjekt</button>
              <button type="button" className="secondary" onClick={() => setShowProjectForm(false)}>
                Avbryt
              </button>
                </form>
              )}

              <div className="project-list">
                {state.projects.length === 0 && (
                  <EmptyState
                    title="Ingen prosjekter enda"
                    message="Opprett et prosjekt for å starte oppgave- og innkjøpsstyring."
                  />
                )}
                {state.projects.map((project) => {
                  const isActive = project.id === selectedProject?.id
                  return (
                    <article
                      key={project.id}
                      className={isActive ? 'project-card project-card--active' : 'project-card'}
                    >
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => commit(selectProject(state, project.id))}
                      >
                        <span>{project.name}</span>
                        <small>{project.client}</small>
                        <small>{project.status}</small>
                      </button>
                    </article>
                  )
                })}
              </div>

              <div className="archive-section">
                <button
                  type="button"
                  className="secondary archive-toggle"
                  onClick={() => {
                    setShowArchive((prev) => !prev)
                    setConfirmEmptyArchive(false)
                    setConfirmPermanentDeleteId(undefined)
                  }}
                >
                  {showArchive
                    ? `Lukk slettemappe (${state.archivedProjects.length})`
                    : `Åpne slettemappe (${state.archivedProjects.length})`}
                </button>

                {showArchive && (
                  <div className="archive-list">
                <div className="archive-toolbar stack">
                  <input
                    type="search"
                    placeholder="Søk i slettemappe"
                    value={archiveSearch}
                    onChange={(event) => setArchiveSearch(event.target.value)}
                  />
                  <select
                    value={archiveSort}
                    onChange={(event) => setArchiveSort(event.target.value as ArchiveSortOption)}
                  >
                    {archiveSortOptions.map((option) => (
                      <option key={option} value={option}>
                        Sortering: {option}
                      </option>
                    ))}
                  </select>
                  {state.archivedProjects.length > 0 && (
                    <button type="button" className="secondary" onClick={exportArchiveBackup}>
                      Eksporter slettemappe
                    </button>
                  )}
                  <label className="button-like secondary archive-import">
                    Importer backup
                    <input type="file" accept="application/json" onChange={importArchiveBackup} />
                  </label>
                  {state.archivedProjects.length > 0 && !confirmEmptyArchive && (
                    <button
                      type="button"
                      className="danger"
                      onClick={() => setConfirmEmptyArchive(true)}
                    >
                      Tøm slettemappe
                    </button>
                  )}
                  {confirmEmptyArchive && (
                    <div className="delete-warning archive-warning">
                      <strong>Ekstra bekreftelse:</strong> Dette sletter alle prosjekter i
                      slettemappen permanent fra lokal lagring.
                      <div className="delete-warning__actions">
                        <button
                          type="button"
                          className="danger"
                          onClick={() => {
                            commit(emptyArchivedProjects(state))
                            setConfirmEmptyArchive(false)
                            setArchiveSearch('')
                          }}
                        >
                          Bekreft tømming
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setConfirmEmptyArchive(false)}
                        >
                          Avbryt
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {state.archivedProjects.length === 0 && (
                  <EmptyState
                    title="Slettemappen er tom"
                    message="Slettede prosjekter flyttes hit og blir liggende til du sletter dem manuelt."
                  />
                )}
                {state.archivedProjects.length > 0 && filteredArchivedProjects.length === 0 && (
                  <EmptyState
                    title="Ingen treff"
                    message="Ingen slettede prosjekter matcher søket ditt."
                  />
                )}
                {filteredArchivedProjects.map((project) => (
                  <article key={project.id} className="project-card archive-card">
                    <div className="archive-card__content">
                      <span>{project.name}</span>
                      <small>{project.client}</small>
                      <small>Arkivert {formatDate(project.archivedAt || project.updatedAt)}</small>
                    </div>
                    <div className="archive-card__actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => commit(restoreArchivedProject(state, project.id))}
                      >
                        Gjenopprett
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => setConfirmPermanentDeleteId(project.id)}
                      >
                        Slett permanent
                      </button>
                    </div>
                    {confirmPermanentDeleteId === project.id && (
                      <div className="delete-warning archive-warning">
                        <strong>Permanent sletting:</strong> Dette prosjektet fjernes helt fra
                        slettemappen og kan ikke gjenopprettes etterpå.
                        <div className="delete-warning__actions">
                          <button
                            type="button"
                            className="danger"
                            onClick={() => {
                              commit(deleteArchivedProject(state, project.id))
                              setConfirmPermanentDeleteId(undefined)
                            }}
                          >
                            Bekreft permanent sletting
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => setConfirmPermanentDeleteId(undefined)}
                          >
                            Avbryt
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                ))}
                  </div>
                )}
              </div>
            </>
          )}
        </aside>

        <section className="panel details-panel">
          {!selectedProject && (
            <EmptyState
              title="Velg et prosjekt"
              message="Prosjektdetaljer, oppgaver, innkjøp og rapporter vises her."
            />
          )}

          {selectedProject && (
            <>
              <div className="section-header active-project-tab">
                <h2 className="active-project-tab__title">@ {selectedProject.name}</h2>
                <button
                  type="button"
                  className="secondary tab-toggle"
                  onClick={() => setShowActiveProjectTab((prev) => !prev)}
                  aria-label={showActiveProjectTab ? 'Skjul aktivt prosjekt' : 'Vis aktivt prosjekt'}
                >
                  {showActiveProjectTab ? '▾' : '▸'}
                </button>
              </div>

              {showActiveProjectTab && (
                <>
              <div className="project-header">
                <div>
                  <h2>{selectedProject.name}</h2>
                  <p>{selectedProject.client}</p>
                  {selectedProject.clientContact && <p>Kontaktperson: {selectedProject.clientContact}</p>}
                  {selectedProject.clientPhone && <p>Telefon: {selectedProject.clientPhone}</p>}
                  {selectedProject.clientEmail && <p>E-post: {selectedProject.clientEmail}</p>}
                  <p>{selectedProject.addressLine1}</p>
                  {selectedProject.addressLine2 && <p>{selectedProject.addressLine2}</p>}
                  <p>
                    {selectedProject.postalCode} {selectedProject.city}
                  </p>
                  <p>
                    Opprettet {formatDate(selectedProject.createdAt)} | Sist oppdatert{' '}
                    {formatDate(selectedProject.updatedAt)}
                  </p>
                </div>
                <div className="actions">
                  <select
                    value={selectedProject.status}
                    onChange={(event) =>
                      commit(
                        updateProjectStatus(
                          state,
                          selectedProject.id,
                          event.target.value as ProjectStatus,
                        ),
                      )
                    }
                  >
                    {statusList.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <label className="checkbox-row report-attachments-toggle">
                    <input
                      type="checkbox"
                      checked={includeReceiptBundle}
                      onChange={(event) => setIncludeReceiptBundle(event.target.checked)}
                    />
                    <span>Legg ved kvitteringspakke (.zip) ved PDF/e-post</span>
                  </label>
                  {receiptBundleMessage && <p className="report-attachments-message">{receiptBundleMessage}</p>}
                  <button type="button" onClick={onGeneratePdf}>
                    Generer PDF
                  </button>
                  <button type="button" className="button-link" onClick={onCreateMailDraft}>
                    Lag e-post
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setProjectForm({
                        name: selectedProject.name,
                        client: selectedProject.client,
                        clientContact: selectedProject.clientContact,
                        clientPhone: selectedProject.clientPhone,
                        clientEmail: selectedProject.clientEmail,
                        addressLine1: selectedProject.addressLine1,
                        addressLine2: selectedProject.addressLine2 || '',
                        postalCode: selectedProject.postalCode,
                        city: selectedProject.city,
                        status: selectedProject.status,
                      })
                      setShowProjectEditForm((prev) => !prev)
                    }}
                  >
                    Rediger prosjekt
                  </button>
                  {deleteConfirmProjectId !== selectedProject.id && (
                    <button
                      type="button"
                      className="danger"
                      onClick={() => requestProjectDelete(selectedProject.id)}
                    >
                      Slett prosjekt
                    </button>
                  )}
                </div>
              </div>

              {showProjectEditForm && (
                <form className="stack edit-project-form" onSubmit={onUpdateProject}>
                  <input
                    type="text"
                    placeholder="Prosjektnavn"
                    value={projectForm.name}
                    onChange={(event) => setProjectForm((prev) => ({ ...prev, name: event.target.value }))}
                    required
                  />
                  <input
                    type="text"
                    placeholder="Kunde"
                    value={projectForm.client}
                    onChange={(event) => setProjectForm((prev) => ({ ...prev, client: event.target.value }))}
                    required
                  />
                  <input
                    type="text"
                    placeholder="Kontaktperson"
                    value={projectForm.clientContact}
                    onChange={(event) =>
                      setProjectForm((prev) => ({ ...prev, clientContact: event.target.value }))
                    }
                  />
                  <div className="inline-fields inline-fields--equal">
                    <input
                      type="tel"
                      placeholder="Telefon"
                      value={projectForm.clientPhone}
                      onChange={(event) =>
                        setProjectForm((prev) => ({ ...prev, clientPhone: event.target.value }))
                      }
                    />
                    <input
                      type="email"
                      placeholder="E-post"
                      value={projectForm.clientEmail}
                      onChange={(event) =>
                        setProjectForm((prev) => ({ ...prev, clientEmail: event.target.value }))
                      }
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Adresse"
                    value={projectForm.addressLine1}
                    onChange={(event) =>
                      setProjectForm((prev) => ({ ...prev, addressLine1: event.target.value }))
                    }
                    required
                  />
                  <input
                    type="text"
                    placeholder="Adresselinje 2"
                    value={projectForm.addressLine2}
                    onChange={(event) =>
                      setProjectForm((prev) => ({ ...prev, addressLine2: event.target.value }))
                    }
                  />
                  <div className="inline-fields">
                    <input
                      type="text"
                      placeholder="Postnr"
                      value={projectForm.postalCode}
                      onChange={(event) =>
                        setProjectForm((prev) => ({ ...prev, postalCode: event.target.value }))
                      }
                      required
                    />
                    <input
                      type="text"
                      placeholder="Sted"
                      value={projectForm.city}
                      onChange={(event) =>
                        setProjectForm((prev) => ({ ...prev, city: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <select
                    value={projectForm.status}
                    onChange={(event) =>
                      setProjectForm((prev) => ({ ...prev, status: event.target.value as ProjectStatus }))
                    }
                  >
                    {statusList.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <button type="submit">Lagre prosjektendringer</button>
                  <button type="button" className="secondary" onClick={() => setShowProjectEditForm(false)}>
                    Lukk redigering
                  </button>
                </form>
              )}

              {deleteConfirmProjectId === selectedProject.id && (
                <div className="delete-warning">
                  <strong>Advarsel 1:</strong> Prosjektet fjernes fra aktive prosjekter og flyttes til
                  slettemappen. Det blir ikke slettet fra lokal lagring ennå.
                  <div className="delete-warning__actions">
                    {deleteFinalProjectId !== selectedProject.id ? (
                      <>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => confirmProjectDelete(selectedProject.id)}
                        >
                          Fortsett
                        </button>
                        <button type="button" className="secondary" onClick={cancelProjectDelete}>
                          Avbryt
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="delete-warning__text">
                          <strong>Advarsel 2:</strong> Bekreft at prosjektet skal flyttes til
                          slettemappen. Permanent sletting må eventuelt gjøres manuelt derfra.
                        </p>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => archiveProject(selectedProject.id)}
                        >
                          Flytt til slettemappe
                        </button>
                        <button type="button" className="secondary" onClick={cancelProjectDelete}>
                          Avbryt
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="stats-row">
                <article>
                  <h3>Oppgaver totalt</h3>
                  <strong>{selectedProject.tasks.length}</strong>
                </article>
                <article>
                  <h3>Oppgaver ferdig</h3>
                  <strong>{selectedProject.tasks.filter((task) => task.completedAt).length}</strong>
                </article>
                <article>
                  <h3>Innkjøp registrert</h3>
                  <strong>{selectedProject.purchases.length}</strong>
                </article>
                <article>
                  <h3>Totalkostnad</h3>
                  <strong>{formatMoney(projectTotalCost(selectedProject))}</strong>
                </article>
              </div>

              <div className="split">
                <section className="subpanel">
                  <div className="section-header section-header--subpanel">
                    <h3>Oppgaver og frister</h3>
                    <button
                      type="button"
                      className="secondary tab-toggle"
                      onClick={() => setShowTasksTab((prev) => !prev)}
                      aria-label={showTasksTab ? 'Skjul oppgavefane' : 'Vis oppgavefane'}
                    >
                      {showTasksTab ? '▾' : '▸'}
                    </button>
                  </div>
                  {showTasksTab && (
                    <>
                      <form className="stack" onSubmit={onAddTask}>
                    <input
                      type="text"
                      placeholder="Hva skal gjøres?"
                      value={taskForm.title}
                      onChange={(event) =>
                        setTaskForm((prev) => ({ ...prev, title: event.target.value }))
                      }
                      required
                    />
                    <input
                      type="text"
                      placeholder="Beskrivelse"
                      value={taskForm.description}
                      onChange={(event) =>
                        setTaskForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                    />
                    <input
                      type="date"
                      value={taskForm.dueDate}
                      onChange={(event) =>
                        setTaskForm((prev) => ({ ...prev, dueDate: event.target.value }))
                      }
                      required
                    />
                    <button type="submit">Legg til oppgave</button>
                    {editingTaskId && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setTaskForm({ title: '', description: '', dueDate: '' })
                          setEditingTaskId(undefined)
                        }}
                      >
                        Avbryt redigering
                      </button>
                    )}
                      </form>

                      <ul className="list">
                    {selectedProject.tasks.length === 0 && (
                      <li>
                        <EmptyState title="Ingen oppgaver" message="Legg til første oppgave over." />
                      </li>
                    )}
                    {selectedProject.tasks.map((task) => (
                      <li key={task.id}>
                        <div
                          className={
                            task.completedAt && !expandedCompletedTaskIds.includes(task.id)
                              ? 'task-row task-row--compact'
                              : 'task-row'
                          }
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(task.completedAt)}
                            onChange={() => {
                              commit(toggleTaskDone(state, selectedProject.id, task.id))
                              setExpandedCompletedTaskIds((prev) => prev.filter((id) => id !== task.id))
                            }}
                          />
                          <div className="task-content">
                            <strong>{task.title}</strong>
                            {task.completedAt && !expandedCompletedTaskIds.includes(task.id) && (
                              <div className="item-actions item-actions--compact">
                                <button
                                  type="button"
                                  className="secondary"
                                  onClick={() =>
                                    setExpandedCompletedTaskIds((prev) => [...prev, task.id])
                                  }
                                >
                                  Vis detaljer
                                </button>
                              </div>
                            )}
                            {(!task.completedAt || expandedCompletedTaskIds.includes(task.id)) && (
                              <>
                                <small>Frist {formatDate(task.dueDate)}</small>
                                <small>{task.description || 'Ingen beskrivelse'}</small>
                                <small>
                                  {task.completedAt
                                    ? `Ferdigstilt ${formatDate(task.completedAt)}`
                                    : 'Ikke ferdigstilt'}
                                </small>
                                <div className="item-actions">
                                  {task.completedAt && (
                                    <button
                                      type="button"
                                      className="secondary"
                                      onClick={() =>
                                        setExpandedCompletedTaskIds((prev) =>
                                          prev.filter((id) => id !== task.id),
                                        )
                                      }
                                    >
                                      Lukk detaljer
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="secondary"
                                    onClick={() => {
                                      setTaskForm({
                                        title: task.title,
                                        description: task.description,
                                        dueDate: toDateInputValue(task.dueDate),
                                      })
                                      setEditingTaskId(task.id)
                                    }}
                                  >
                                    Rediger
                                  </button>
                                  <button
                                    type="button"
                                    className="danger"
                                    onClick={() => commit(deleteTask(state, selectedProject.id, task.id))}
                                  >
                                    Slett
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                      </ul>
                    </>
                  )}
                </section>

                <section className="subpanel">
                  <div className="section-header section-header--subpanel">
                    <h3>Innkjøp og utlegg</h3>
                    <button
                      type="button"
                      className="secondary tab-toggle"
                      onClick={() => setShowPurchasesTab((prev) => !prev)}
                      aria-label={showPurchasesTab ? 'Skjul innkjøpsfane' : 'Vis innkjøpsfane'}
                    >
                      {showPurchasesTab ? '▾' : '▸'}
                    </button>
                  </div>
                  {showPurchasesTab && (
                    <>
                      <form className="stack" onSubmit={onAddPurchase}>
                    <input
                      type="text"
                      placeholder="Vare / materiale"
                      value={purchaseForm.itemName}
                      onChange={(event) =>
                        setPurchaseForm((prev) => ({ ...prev, itemName: event.target.value }))
                      }
                      required
                    />
                    <input
                      type="text"
                      placeholder="Leverandør"
                      value={purchaseForm.supplier}
                      onChange={(event) =>
                        setPurchaseForm((prev) => ({ ...prev, supplier: event.target.value }))
                      }
                    />
                    <div className="inline-fields inline-fields--equal">
                      <input
                        type="tel"
                        placeholder="Leverandør tlf"
                        value={purchaseForm.supplierPhone}
                        onChange={(event) =>
                          setPurchaseForm((prev) => ({ ...prev, supplierPhone: event.target.value }))
                        }
                      />
                      <input
                        type="email"
                        placeholder="Leverandør e-post"
                        value={purchaseForm.supplierEmail}
                        onChange={(event) =>
                          setPurchaseForm((prev) => ({ ...prev, supplierEmail: event.target.value }))
                        }
                      />
                    </div>
                    <input
                      type="date"
                      value={purchaseForm.purchasedAt}
                      onChange={(event) =>
                        setPurchaseForm((prev) => ({ ...prev, purchasedAt: event.target.value }))
                      }
                      required
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Beløp NOK"
                      value={purchaseForm.amountNok}
                      onChange={(event) =>
                        setPurchaseForm((prev) => ({ ...prev, amountNok: event.target.value }))
                      }
                      required
                    />
                    <input
                      type="text"
                      placeholder="Notat"
                      value={purchaseForm.notes}
                      onChange={(event) =>
                        setPurchaseForm((prev) => ({ ...prev, notes: event.target.value }))
                      }
                    />
                    <div className="receipt-upload-actions">
                      <label className="receipt-upload">
                        Last opp kvitteringer
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          multiple
                          onChange={onReceiptFilesSelected}
                        />
                      </label>
                      <label className="receipt-upload">
                        Ta bilde med kamera
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={onCameraReceiptSelected}
                        />
                      </label>
                    </div>
                    {purchaseReceiptError && <p className="receipt-error">{purchaseReceiptError}</p>}
                    {purchaseForm.receipts.length > 0 && (
                      <ul className="receipt-list">
                        {purchaseForm.receipts.map((receipt) => (
                          <li key={receipt.id}>
                            <a href={receipt.dataUrl} target="_blank" rel="noreferrer">
                              {receipt.fileName}
                            </a>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => removeReceiptFromForm(receipt.id)}
                            >
                              Fjern
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button type="submit">Registrer innkjøp</button>
                    {editingPurchaseId && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setPurchaseForm({
                            itemName: '',
                            supplier: '',
                            supplierPhone: '',
                            supplierEmail: '',
                            purchasedAt: '',
                            amountNok: '',
                            notes: '',
                            receipts: [],
                          })
                          setEditingPurchaseId(undefined)
                          setPurchaseReceiptError('')
                        }}
                      >
                        Avbryt redigering
                      </button>
                    )}
                      </form>

                      <ul className="list">
                    {selectedProject.purchases.length === 0 && (
                      <li>
                        <EmptyState
                          title="Ingen innkjøp"
                          message="Registrer materialer og varer for prosjektet."
                        />
                      </li>
                    )}
                    {selectedProject.purchases.map((purchase) => (
                      <li key={purchase.id} className="purchase-card">
                        <span>
                          <strong>{purchase.itemName}</strong>
                          <small><span className="purchase-label">Leverandør:</span> {purchase.supplier || 'Ukjent leverandør'}</small>
                          {(purchase.supplierPhone || purchase.supplierEmail) && (
                            <small>
                              <span className="purchase-label">Kontakt:</span>{' '}
                              {[purchase.supplierPhone, purchase.supplierEmail].filter(Boolean).join(' | ')}
                            </small>
                          )}
                          <small><span className="purchase-label">Dato:</span> {formatDate(purchase.purchasedAt)}</small>
                          <small><span className="purchase-label">Beløp:</span> {formatMoney(purchase.amountNok)}</small>
                          <small><span className="purchase-label">Notat:</span> {purchase.notes || 'Ingen notat'}</small>
                          <small>
                            <span className="purchase-label">Kvitteringer:</span>{' '}
                            {purchase.receipts.length === 0
                              ? 'Ingen vedlegg'
                              : `${purchase.receipts.length} vedlegg`}
                          </small>
                          {purchase.receipts.length > 0 && (
                            <ul className="receipt-list receipt-list--saved">
                              {purchase.receipts.map((receipt) => (
                                <li key={receipt.id}>
                                  <a href={receipt.dataUrl} target="_blank" rel="noreferrer">
                                    {receipt.fileName}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                          <span className="item-actions">
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => {
                                setPurchaseForm({
                                  itemName: purchase.itemName,
                                  supplier: purchase.supplier,
                                  supplierPhone: purchase.supplierPhone,
                                  supplierEmail: purchase.supplierEmail,
                                  purchasedAt: toDateInputValue(purchase.purchasedAt),
                                  amountNok: String(purchase.amountNok),
                                  notes: purchase.notes,
                                  receipts: purchase.receipts,
                                })
                                setEditingPurchaseId(purchase.id)
                                setPurchaseReceiptError('')
                              }}
                            >
                              Rediger
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => commit(deletePurchase(state, selectedProject.id, purchase.id))}
                            >
                              Slett
                            </button>
                          </span>
                        </span>
                      </li>
                    ))}
                      </ul>
                    </>
                  )}
                </section>
              </div>
                </>
              )}
            </>
          )}
        </section>
      </section>

      <section className="app-description">
        <button
          type="button"
          className="app-description__tab"
          onClick={() => setShowAppDescription((prev) => !prev)}
        >
          {showAppDescription ? 'Lukk appbeskrivelse' : 'Appbeskrivelse'}
        </button>
        {showAppDescription && (
          <div className="app-description__panel">
            <p>
              Hold prosjekter helt adskilt, spor oppgaver med frister, registrer alle innkjøp og
              generer rapport som PDF eller e-post.
            </p>
            <ul>
              <li>Opprett, rediger og arkiver prosjekter med full kundedetaljering.</li>
              <li>Registrer oppgaver med frister, status og ferdigstillingsdato.</li>
              <li>Registrer innkjøp, leverandørdata, beløp og notater per prosjekt.</li>
              <li>Skann eller last opp kvitteringer, inkludert kameraknapp for mobil.</li>
              <li>Automatisk bildekomprimering for å spare lokal lagringsplass.</li>
              <li>Generer prosjektrapport som PDF eller e-postutkast.</li>
              <li>Valgfri kvitteringspakke (ZIP) som kan lastes ned med rapporten.</li>
              <li>Full backup/import samt slettemappe med gjenoppretting.</li>
            </ul>
          </div>
        )}
      </section>

      <footer className="app-footer">
        <img className="app-footer__rune" src={runeImage} alt="Rune fra R-Maskin" />
      </footer>
    </main>
  )
}

export default App
