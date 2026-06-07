import type { AppState, PurchaseItem, ReceiptAttachment } from '../../lib/types'
import { uid } from '../../lib/utils'

const now = (): string => new Date().toISOString()

export const addPurchase = (
  state: AppState,
  projectId: string,
  payload: {
    itemName: string
    supplier: string
    supplierPhone: string
    supplierEmail: string
    purchasedAt: string
    amountNok: number
    notes: string
    receipts: ReceiptAttachment[]
  },
): AppState => {
  const purchase: PurchaseItem = {
    id: uid(),
    itemName: payload.itemName,
    supplier: payload.supplier,
    supplierPhone: payload.supplierPhone,
    supplierEmail: payload.supplierEmail,
    purchasedAt: payload.purchasedAt,
    amountNok: payload.amountNok,
    notes: payload.notes,
    receipts: payload.receipts,
  }

  return {
    ...state,
    projects: state.projects.map((project) => {
      if (project.id !== projectId) {
        return project
      }
      return {
        ...project,
        purchases: [...project.purchases, purchase],
        updatedAt: now(),
      }
    }),
  }
}

export const updatePurchase = (
  state: AppState,
  projectId: string,
  purchaseId: string,
  payload: {
    itemName: string
    supplier: string
    supplierPhone: string
    supplierEmail: string
    purchasedAt: string
    amountNok: number
    notes: string
    receipts: ReceiptAttachment[]
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
        updatedAt: now(),
        purchases: project.purchases.map((purchase) => {
          if (purchase.id !== purchaseId) {
            return purchase
          }

          return {
            ...purchase,
            itemName: payload.itemName,
            supplier: payload.supplier,
            supplierPhone: payload.supplierPhone,
            supplierEmail: payload.supplierEmail,
            purchasedAt: payload.purchasedAt,
            amountNok: payload.amountNok,
            notes: payload.notes,
            receipts: payload.receipts,
          }
        }),
      }
    }),
  }
}

export const deletePurchase = (
  state: AppState,
  projectId: string,
  purchaseId: string,
): AppState => {
  return {
    ...state,
    projects: state.projects.map((project) => {
      if (project.id !== projectId) {
        return project
      }

      return {
        ...project,
        updatedAt: now(),
        purchases: project.purchases.filter((purchase) => purchase.id !== purchaseId),
      }
    }),
  }
}
