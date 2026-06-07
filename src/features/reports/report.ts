import jsPDF from 'jspdf'
import JSZip from 'jszip'
import logoImage from '../../../Logo.png'
import type { ContractorProfile, Project } from '../../lib/types'
import { formatDate, formatMoney } from '../../lib/utils'

const formatProjectAddress = (project: Project): string[] => {
  const lines = [
    project.addressLine1,
    project.addressLine2,
    [project.postalCode, project.city].filter(Boolean).join(' '),
  ]

  return lines.filter((line): line is string => Boolean(line))
}

export const projectTotalCost = (project: Project): number => {
  return project.purchases.reduce((sum, purchase) => sum + purchase.amountNok, 0)
}

const formatContractorAddress = (contractor: ContractorProfile): string => {
  return [
    contractor.addressLine1,
    contractor.addressLine2,
    [contractor.postalCode, contractor.city].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ')
}

const formatTaskStatus = (project: Project): string => {
  const completed = project.tasks.filter((task) => task.completedAt).length
  return `${completed}/${project.tasks.length}`
}

const slugify = (value: string): string => {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const dataUrlToUint8Array = (dataUrl: string): Uint8Array => {
  const base64 = dataUrl.split(',')[1] ?? ''
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export type ReceiptBundleData = {
  blob: Blob
  fileName: string
}

export const createProjectReceiptBundle = async (
  project: Project,
  contractor: ContractorProfile,
): Promise<ReceiptBundleData | null> => {
  const receipts = project.purchases.flatMap((purchase) => purchase.receipts)
  if (receipts.length === 0) {
    return null
  }

  const zip = new JSZip()
  const rootName = `${slugify(project.name)}-kvitteringer`
  const rootFolder = zip.folder(rootName)
  if (!rootFolder) {
    return null
  }

  const manifestLines: string[] = [
    'R-MASKIN AS - KVITTERINGSPAKKE',
    `Prosjekt: ${project.name}`,
    `Kunde: ${project.client}`,
    `Generert: ${formatDate(new Date().toISOString())}`,
    `Utførende: ${contractor.name}`,
    '',
    'INNHOLD',
  ]

  project.purchases.forEach((purchase, purchaseIndex) => {
    if (purchase.receipts.length === 0) {
      return
    }

    const purchaseFolder = rootFolder.folder(
      `${String(purchaseIndex + 1).padStart(2, '0')}-${slugify(purchase.itemName || 'innkjop')}`,
    )
    if (!purchaseFolder) {
      return
    }

    purchase.receipts.forEach((receipt, receiptIndex) => {
      const extension = receipt.fileName.includes('.')
        ? receipt.fileName.split('.').pop() || 'bin'
        : receipt.mimeType.split('/')[1] || 'bin'
      const fileName = `${String(receiptIndex + 1).padStart(2, '0')}-${slugify(
        receipt.fileName.replace(/\.[^.]+$/, ''),
      )}.${extension}`

      purchaseFolder.file(fileName, dataUrlToUint8Array(receipt.dataUrl))
      manifestLines.push(
        `${purchaseIndex + 1}.${receiptIndex + 1} | ${purchase.itemName} | ${formatDate(
          purchase.purchasedAt,
        )} | ${formatMoney(purchase.amountNok)} | ${fileName}`,
      )
    })
  })

  rootFolder.file('manifest.txt', manifestLines.join('\n'))

  const blob = await zip.generateAsync({ type: 'blob' })
  const fileName = `${slugify(project.name)}-kvitteringspakke.zip`
  return { blob, fileName }
}

export const downloadProjectReceiptBundle = async (
  project: Project,
  contractor: ContractorProfile,
): Promise<boolean> => {
  const bundle = await createProjectReceiptBundle(project, contractor)
  if (!bundle) {
    return false
  }

  const url = URL.createObjectURL(bundle.blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = bundle.fileName
  anchor.click()
  URL.revokeObjectURL(url)
  return true
}

export const buildProjectMailto = (project: Project, contractor: ContractorProfile): string => {
  const taskLines = project.tasks
    .map((task, index) => {
      const done = task.completedAt ? `Ferdig ${formatDate(task.completedAt)}` : 'Ikke ferdig'
      const description = task.description ? ` | Notat: ${task.description}` : ''
      return `${index + 1}. ${task.title} | Frist: ${formatDate(task.dueDate)} | ${done}${description}`
    })
    .join('\n')

  const purchaseLines = project.purchases
    .map((purchase, index) => {
      const supplierInfo = [purchase.supplier, purchase.supplierPhone, purchase.supplierEmail]
        .filter(Boolean)
        .join(', ')
      const receiptSummary =
        purchase.receipts.length > 0
          ? ` | Kvitteringer: ${purchase.receipts.map((receipt) => receipt.fileName).join(', ')}`
          : ''

      return `${index + 1}. ${purchase.itemName} - ${formatMoney(purchase.amountNok)} (${formatDate(
        purchase.purchasedAt,
      )})${supplierInfo ? ` | ${supplierInfo}` : ''}${receiptSummary}`
    })
    .join('\n')

  const subject = encodeURIComponent(`Prosjektrapport ${project.name} - ${formatDate(project.updatedAt)}`)
  const body = encodeURIComponent(
    [
      'R-MASKIN AS - PROSJEKTRAPPORT',
      `Generert: ${formatDate(new Date().toISOString())}`,
      '',
      'OPPSUMMERING',
      `Prosjekt: ${project.name}`,
      `Status: ${project.status}`,
      `Oppgaver fullført: ${formatTaskStatus(project)}`,
      `Innkjøp registrert: ${project.purchases.length}`,
      `Totalkostnad: ${formatMoney(projectTotalCost(project))}`,
      '',
      'UTFØRENDE',
      `Firma: ${contractor.name}`,
      `Adresse: ${formatContractorAddress(contractor)}`,
      `Telefon: ${contractor.phone || '-'}`,
      `E-post: ${contractor.email || '-'}`,
      `Org.nr: ${contractor.orgNumber || '-'}`,
      '',
      'KUNDE',
      `Kunde: ${project.client}`,
      `Kontaktperson: ${project.clientContact || '-'}`,
      `Telefon: ${project.clientPhone || '-'}`,
      `E-post: ${project.clientEmail || '-'}`,
      'Adresse:',
      ...formatProjectAddress(project),
      `Status: ${project.status}`,
      '',
      'OPPGAVER OG FRISTER',
      taskLines || 'Ingen oppgaver registrert.',
      '',
      'INNKJØP OG UTLEGG',
      purchaseLines || 'Ingen innkjøp registrert.',
    ].join('\n'),
  )

  return `mailto:?subject=${subject}&body=${body}`
}

export const downloadProjectPdf = (project: Project, contractor: ContractorProfile): void => {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14
  let y = 20

  doc.addImage(logoImage, 'PNG', margin, 10, 90, 18)
  y = 42

  doc.setDrawColor(199, 187, 164)
  doc.line(margin, y, pageWidth - margin, y)
  y += 12

  const line = (text: string, options?: { bold?: boolean; spacing?: number }) => {
    doc.setFont('helvetica', options?.bold ? 'bold' : 'normal')
    const split = doc.splitTextToSize(text, pageWidth - margin * 2)
    const lineSpacing = options?.spacing ?? 1.5
    const neededHeight = split.length * 6 + lineSpacing

    if (y + neededHeight > pageHeight - 16) {
      doc.addPage()
      y = 18
    }

    doc.text(split, margin, y)
    y += neededHeight
  }

  const section = (title: string) => {
    const sectionGap = 10
    const headingHeight = 10
    const atLeastOneContentLine = 8
    const neededHeight = sectionGap + headingHeight + atLeastOneContentLine

    if (y + neededHeight > pageHeight - 16) {
      doc.addPage()
      y = 18
    }

    y += sectionGap
    line(title, { bold: true, spacing: 4 })
  }

  line(`PROSJEKTRAPPORT`, { bold: true, spacing: 2 })
  line(`Prosjekt: ${project.name}`)
  line(`Generert: ${formatDate(new Date().toISOString())}`)
  line(`Sist oppdatert: ${formatDate(project.updatedAt)}`)

  section('Oppsummering')
  line(`Status: ${project.status}`)
  line(`Oppgaver fullført: ${formatTaskStatus(project)}`)
  line(`Registrerte innkjøp: ${project.purchases.length}`)
  line(`Totalkostnad: ${formatMoney(projectTotalCost(project))}`, { bold: true })

  section('Utførende')
  line(`Firma: ${contractor.name}`)
  line(`Adresse: ${contractor.addressLine1}`)
  if (contractor.addressLine2) {
    line(contractor.addressLine2)
  }
  line(`${contractor.postalCode} ${contractor.city}`)
  line(`Telefon: ${contractor.phone || '-'}`)
  line(`E-post: ${contractor.email || '-'}`)
  line(`Organisasjonsnummer: ${contractor.orgNumber || '-'}`)

  section('Kunde')
  line(`Kunde: ${project.client}`)
  line(`Kontaktperson: ${project.clientContact || '-'}`)
  line(`Telefon: ${project.clientPhone || '-'}`)
  line(`E-post: ${project.clientEmail || '-'}`)
  line('Adresse:')
  formatProjectAddress(project).forEach((addressLine) => line(addressLine))

  section('Oppgaver og frister')
  if (project.tasks.length === 0) {
    line('Ingen oppgaver registrert.')
  }
  project.tasks.forEach((task, index) => {
    const taskStatus = task.completedAt
      ? `Ferdig ${formatDate(task.completedAt)}`
      : 'Ikke ferdig'
    line(
      `${index + 1}. ${task.title} | Frist: ${formatDate(task.dueDate)} | ${taskStatus}`,
    )
    if (task.description) {
      line(`   Notat: ${task.description}`)
    }
  })

  section('Innkjøp og utlegg')
  if (project.purchases.length === 0) {
    line('Ingen innkjøp registrert.')
  }
  project.purchases.forEach((purchase, index) => {
    line(
      `${index + 1}. ${purchase.itemName} | ${purchase.supplier} | ${formatMoney(purchase.amountNok)} | ${formatDate(
        purchase.purchasedAt,
      )}`,
    )
    if (purchase.supplierPhone || purchase.supplierEmail) {
      line(`   Leverandørkontakt: ${purchase.supplierPhone || '-'} | ${purchase.supplierEmail || '-'}`)
    }
    if (purchase.notes) {
      line(`   Notat: ${purchase.notes}`)
    }
    if (purchase.receipts.length > 0) {
      line(`   Kvitteringer: ${purchase.receipts.map((receipt) => receipt.fileName).join(', ')}`)
    }
  })

  y = Math.max(y, pageHeight - 18)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`R-Maskin AS | Prosjektrapport`, margin, pageHeight - 10)
  doc.text(`Side ${doc.getNumberOfPages()}`, pageWidth - margin, pageHeight - 10, { align: 'right' })

  const fileName = `${project.name.toLowerCase().replaceAll(' ', '-')}-rapport.pdf`
  doc.save(fileName)
}
