export const formatDate = (dateIso?: string): string => {
  if (!dateIso) {
    return '-'
  }

  const date = new Date(dateIso)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('nb-NO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export const formatMoney = (amount: number): string => {
  return new Intl.NumberFormat('nb-NO', {
    style: 'currency',
    currency: 'NOK',
    maximumFractionDigits: 2,
  }).format(amount)
}

export const uid = (): string => {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const downloadJsonFile = (fileName: string, data: unknown): void => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export const readJsonFile = async <T>(file: File): Promise<T> => {
  const text = await file.text()
  return JSON.parse(text) as T
}
