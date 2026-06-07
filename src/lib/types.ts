export type ProjectStatus = 'Planlegging' | 'Pågående' | 'Ferdig'

export interface ContractorProfile {
  name: string
  addressLine1: string
  addressLine2: string
  postalCode: string
  city: string
  phone: string
  email: string
  orgNumber: string
}

export interface TaskItem {
  id: string
  title: string
  description: string
  dueDate: string
  completedAt?: string
}

export interface PurchaseItem {
  id: string
  itemName: string
  supplier: string
  supplierPhone: string
  supplierEmail: string
  purchasedAt: string
  amountNok: number
  notes: string
  receipts: ReceiptAttachment[]
}

export interface ReceiptAttachment {
  id: string
  fileName: string
  mimeType: string
  dataUrl: string
  sizeBytes: number
  addedAt: string
}

export interface Project {
  id: string
  name: string
  client: string
  clientContact: string
  clientPhone: string
  clientEmail: string
  addressLine1: string
  addressLine2?: string
  postalCode: string
  city: string
  status: ProjectStatus
  createdAt: string
  updatedAt: string
  archivedAt?: string
  tasks: TaskItem[]
  purchases: PurchaseItem[]
}

export interface AppState {
  contractor: ContractorProfile
  projects: Project[]
  archivedProjects: Project[]
  selectedProjectId?: string
}
