import type { AppState, ContractorProfile, Project, ProjectStatus } from './types'
import { uid } from './utils'

const STORAGE_KEY = 'r-maskin-prosjektstyring-v1'

const now = (): string => new Date().toISOString()

const initialContractor: ContractorProfile = {
  name: 'R-Maskin',
  addressLine1: 'Maskinvegen 12',
  addressLine2: '',
  postalCode: '4354',
  city: 'Voll',
  phone: '51 00 00 01',
  email: 'post@r-maskin.no',
  orgNumber: '999 999 999',
}

const initialProject: Project = {
  id: uid(),
  name: 'Eksempelprosjekt - Garasje og grunnarbeid',
  client: 'Nordby Eiendom AS',
  clientContact: 'Ola Nordby',
  clientPhone: '900 00 000',
  clientEmail: 'ola@nordby.no',
  addressLine1: 'Fjordveien 14',
  addressLine2: 'Bygg A',
  postalCode: '4032',
  city: 'Stavanger',
  status: 'Pågående',
  createdAt: now(),
  updatedAt: now(),
  tasks: [
    {
      id: uid(),
      title: 'Bestille gravemaskin',
      description: 'Avklare levering torsdag morgen',
      dueDate: new Date(Date.now() + 2 * 86400000).toISOString(),
    },
    {
      id: uid(),
      title: 'Kontroll av grunnmaling',
      description: 'Sjekk at underlag er turt nok',
      dueDate: new Date(Date.now() + 4 * 86400000).toISOString(),
    },
  ],
  purchases: [
    {
      id: uid(),
      itemName: 'Betong C35 2.5m3',
      supplier: 'ByggPartner',
      supplierPhone: '51 00 00 00',
      supplierEmail: 'ordre@byggpartner.no',
      purchasedAt: now(),
      amountNok: 7850,
      notes: 'Levert med pumpebil',
      receipts: [],
    },
  ],
}

const secondProject: Project = {
  id: uid(),
  name: 'Eksempelprosjekt - Drenering rundt bolig',
  client: 'Larsen Invest',
  clientContact: 'Kari Larsen',
  clientPhone: '911 22 333',
  clientEmail: 'kari@larseninvest.no',
  addressLine1: 'Bakkeveien 22',
  addressLine2: '',
  postalCode: '4321',
  city: 'Sandnes',
  status: 'Planlegging',
  createdAt: now(),
  updatedAt: now(),
  tasks: [
    {
      id: uid(),
      title: 'Måle fall rundt grunnmur',
      description: 'Kontroller høyder før graving starter',
      dueDate: new Date(Date.now() + 6 * 86400000).toISOString(),
    },
    {
      id: uid(),
      title: 'Bestille drensrør og duk',
      description: 'Avklar levering direkte til byggeplass',
      dueDate: new Date(Date.now() + 8 * 86400000).toISOString(),
    },
  ],
  purchases: [
    {
      id: uid(),
      itemName: 'Drensrør 110 mm',
      supplier: 'Ahlsell',
      supplierPhone: '51 22 33 44',
      supplierEmail: 'sandnes@ahlsell.no',
      purchasedAt: now(),
      amountNok: 4690,
      notes: 'Hentelager Sandnes',
      receipts: [],
    },
  ],
}

const thirdProject: Project = {
  id: uid(),
  name: 'Eksempelprosjekt - Opparbeidelse av gårdsplass',
  client: 'Sørheim Eiendom',
  clientContact: 'Per Sørheim',
  clientPhone: '922 44 555',
  clientEmail: 'per@sorheim.no',
  addressLine1: 'Solsiden 7',
  addressLine2: '',
  postalCode: '4018',
  city: 'Stavanger',
  status: 'Pågående',
  createdAt: now(),
  updatedAt: now(),
  tasks: [
    {
      id: uid(),
      title: 'Komprimering av bærelag',
      description: 'To overfarter med vibroplate',
      dueDate: new Date(Date.now() + 1 * 86400000).toISOString(),
      completedAt: now(),
    },
    {
      id: uid(),
      title: 'Legge kantstein',
      description: 'Front mot innkjøring',
      dueDate: new Date(Date.now() + 3 * 86400000).toISOString(),
    },
  ],
  purchases: [
    {
      id: uid(),
      itemName: 'Kantstein grå 8 meter',
      supplier: 'Byggmakker',
      supplierPhone: '51 88 77 66',
      supplierEmail: 'ordre@byggmakker.no',
      purchasedAt: now(),
      amountNok: 5930,
      notes: 'Skal brukes ved innkjøring',
      receipts: [],
    },
    {
      id: uid(),
      itemName: 'Settesand 1 tonn',
      supplier: 'Rogaland Pukk',
      supplierPhone: '51 77 66 55',
      supplierEmail: 'post@rogalandpukk.no',
      purchasedAt: now(),
      amountNok: 2150,
      notes: 'Levert på storsekk',
      receipts: [],
    },
  ],
}

const buildSampleProjects = (): Project[] => {
  const sampleTemplates = structuredClone([initialProject, secondProject, thirdProject])

  return sampleTemplates.map((project) => {
    const timestamp = now()
    return {
      ...project,
      id: uid(),
      createdAt: timestamp,
      updatedAt: timestamp,
      tasks: project.tasks.map((task) => ({
        ...task,
        id: uid(),
      })),
      purchases: project.purchases.map((purchase) => ({
        ...purchase,
        id: uid(),
        receipts: [],
      })),
    }
  })
}

const initialProjects = buildSampleProjects()

const initialState: AppState = {
  contractor: initialContractor,
  projects: initialProjects,
  archivedProjects: [],
  selectedProjectId: initialProjects[0]?.id,
}

const clone = <T>(value: T): T => {
  return structuredClone(value)
}

export const loadState = (): AppState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return clone(initialState)
    }

    const parsed = JSON.parse(raw) as AppState
    if (!parsed.projects || !Array.isArray(parsed.projects)) {
      return clone(initialState)
    }

    parsed.contractor = {
      ...initialContractor,
      ...(parsed.contractor ?? {}),
    }
    parsed.archivedProjects = Array.isArray(parsed.archivedProjects)
      ? parsed.archivedProjects
      : []

    // Backward compatibility: migrate legacy status value without Norwegian characters.
    parsed.projects = parsed.projects.map((project) => {
      const legacyStatus = project.status as Project['status'] | 'Pagaende'
      const legacyProject = project as Project & {
        address?: string
        clientContact?: string
        clientPhone?: string
        clientEmail?: string
      }

      return {
        ...legacyProject,
        clientContact: legacyProject.clientContact ?? '',
        clientPhone: legacyProject.clientPhone ?? '',
        clientEmail: legacyProject.clientEmail ?? '',
        addressLine1: legacyProject.addressLine1 ?? legacyProject.address ?? '',
        addressLine2: legacyProject.addressLine2 ?? '',
        postalCode: legacyProject.postalCode ?? '',
        city: legacyProject.city ?? '',
        archivedAt: legacyProject.archivedAt,
        status: legacyStatus === 'Pagaende' ? 'Pågående' : legacyStatus,
        purchases: legacyProject.purchases.map((purchase) => ({
          ...purchase,
          supplierPhone: purchase.supplierPhone ?? '',
          supplierEmail: purchase.supplierEmail ?? '',
          receipts: purchase.receipts ?? [],
        })),
      }
    })

    parsed.archivedProjects = parsed.archivedProjects.map((project) => {
      const legacyStatus = project.status as Project['status'] | 'Pagaende'
      const legacyProject = project as Project & {
        address?: string
        clientContact?: string
        clientPhone?: string
        clientEmail?: string
      }

      return {
        ...legacyProject,
        clientContact: legacyProject.clientContact ?? '',
        clientPhone: legacyProject.clientPhone ?? '',
        clientEmail: legacyProject.clientEmail ?? '',
        addressLine1: legacyProject.addressLine1 ?? legacyProject.address ?? '',
        addressLine2: legacyProject.addressLine2 ?? '',
        postalCode: legacyProject.postalCode ?? '',
        city: legacyProject.city ?? '',
        archivedAt: legacyProject.archivedAt,
        status: legacyStatus === 'Pagaende' ? 'Pågående' : legacyStatus,
        purchases: legacyProject.purchases.map((purchase) => ({
          ...purchase,
          supplierPhone: purchase.supplierPhone ?? '',
          supplierEmail: purchase.supplierEmail ?? '',
          receipts: purchase.receipts ?? [],
        })),
      }
    })

    if (parsed.projects.length === 0 && parsed.archivedProjects.length === 0) {
      parsed.projects = buildSampleProjects()
    }

    if (!parsed.selectedProjectId && parsed.projects.length > 0) {
      parsed.selectedProjectId = parsed.projects[0].id
    }

    return parsed
  } catch {
    return clone(initialState)
  }
}

export const saveState = (state: AppState): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export const updateContractor = (
  state: AppState,
  payload: ContractorProfile,
): AppState => ({
  ...state,
  contractor: payload,
})

export const createProject = (
  state: AppState,
  payload: {
    name: string
    client: string
    clientContact: string
    clientPhone: string
    clientEmail: string
    addressLine1: string
    addressLine2: string
    postalCode: string
    city: string
    status: ProjectStatus
  },
): AppState => {
  const timestamp = now()
  const project: Project = {
    id: uid(),
    name: payload.name,
    client: payload.client,
    clientContact: payload.clientContact,
    clientPhone: payload.clientPhone,
    clientEmail: payload.clientEmail,
    addressLine1: payload.addressLine1,
    addressLine2: payload.addressLine2,
    postalCode: payload.postalCode,
    city: payload.city,
    status: payload.status,
    createdAt: timestamp,
    updatedAt: timestamp,
    tasks: [],
    purchases: [],
  }

  return {
    contractor: state.contractor,
    projects: [project, ...state.projects],
    archivedProjects: state.archivedProjects,
    selectedProjectId: project.id,
  }
}

export const updateProjectStatus = (
  state: AppState,
  projectId: string,
  status: ProjectStatus,
): AppState => {
  return {
    ...state,
    projects: state.projects.map((project) => {
      if (project.id !== projectId) {
        return project
      }
      return {
        ...project,
        status,
        updatedAt: now(),
      }
    }),
  }
}

export const updateProject = (
  state: AppState,
  projectId: string,
  payload: {
    name: string
    client: string
    clientContact: string
    clientPhone: string
    clientEmail: string
    addressLine1: string
    addressLine2: string
    postalCode: string
    city: string
    status: ProjectStatus
  },
): AppState => {
  return {
    ...state,
    projects: state.projects.map((project) => {
      if (project.id !== projectId) {
        return project
      }

      return {
        ...project,
        ...payload,
        updatedAt: now(),
      }
    }),
  }
}

export const removeProject = (state: AppState, projectId: string): AppState => {
  const projectToArchive = state.projects.find((project) => project.id === projectId)
  const nextProjects = state.projects.filter((project) => project.id !== projectId)
  return {
    contractor: state.contractor,
    projects: nextProjects,
    archivedProjects: projectToArchive
      ? [{ ...projectToArchive, archivedAt: now() }, ...state.archivedProjects]
      : state.archivedProjects,
    selectedProjectId: nextProjects[0]?.id,
  }
}

export const deleteArchivedProject = (state: AppState, projectId: string): AppState => ({
  ...state,
  archivedProjects: state.archivedProjects.filter((project) => project.id !== projectId),
})

export const restoreArchivedProject = (state: AppState, projectId: string): AppState => {
  const projectToRestore = state.archivedProjects.find((project) => project.id === projectId)
  if (!projectToRestore) {
    return state
  }

  const { archivedAt, ...restoredProject } = projectToRestore
  void archivedAt

  return {
    ...state,
    projects: [restoredProject, ...state.projects],
    archivedProjects: state.archivedProjects.filter((project) => project.id !== projectId),
    selectedProjectId: restoredProject.id,
  }
}

export const emptyArchivedProjects = (state: AppState): AppState => ({
  ...state,
  archivedProjects: [],
})

export const mergeArchivedProjects = (state: AppState, importedProjects: Project[]): AppState => {
  const existingIds = new Set(state.archivedProjects.map((project) => project.id))
  const deduplicatedImports = importedProjects.filter((project) => !existingIds.has(project.id))

  return {
    ...state,
    archivedProjects: [...deduplicatedImports, ...state.archivedProjects],
  }
}

export const selectProject = (state: AppState, projectId: string): AppState => ({
  ...state,
  selectedProjectId: projectId,
})

export const addSampleProjects = (state: AppState): AppState => {
  const existingNames = new Set(
    [...state.projects, ...state.archivedProjects].map((project) => project.name),
  )
  const missingSamples = buildSampleProjects().filter((project) => !existingNames.has(project.name))

  if (missingSamples.length === 0) {
    return state
  }

  const nextProjects = [...state.projects, ...missingSamples]
  return {
    ...state,
    projects: nextProjects,
    selectedProjectId: state.selectedProjectId ?? nextProjects[0]?.id,
  }
}
