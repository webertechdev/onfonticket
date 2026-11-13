import type { Ticket } from '../domain/types'

export type PrinterPhase = 'CONNECTED' | 'PRINTING' | 'OFFLINE' | 'FAILED' | 'NOT_CONFIGURED'
export type PrinterState = { phase: PrinterPhase; label: string; detail: string; checkedAt: string; bridgeUrl: string }

const BRIDGE_URL_KEY = 'onfon_printer_bridge_url'
export const DEFAULT_PRINTER_BRIDGE_URL = 'http://127.0.0.1:18181'
const statusEvent = 'onfon:printer-status'

export function printerBridgeUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_PRINTER_BRIDGE_URL
  return window.localStorage.getItem(BRIDGE_URL_KEY)?.trim() || DEFAULT_PRINTER_BRIDGE_URL
}

export function setPrinterBridgeUrl(value: string): void {
  const next = value.trim().replace(/\/$/, '')
  if (typeof window !== 'undefined') {
    if (next) window.localStorage.setItem(BRIDGE_URL_KEY, next)
    else window.localStorage.removeItem(BRIDGE_URL_KEY)
  }
}

export function publishPrinterState(state: PrinterState): PrinterState {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(statusEvent, { detail: state }))
  return state
}

export function subscribePrinterStatus(listener: (state: PrinterState) => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const handler = (event: Event) => listener((event as CustomEvent<PrinterState>).detail)
  window.addEventListener(statusEvent, handler)
  return () => window.removeEventListener(statusEvent, handler)
}

function state(phase: PrinterPhase, label: string, detail: string): PrinterState {
  return { phase, label, detail, checkedAt: new Date().toISOString(), bridgeUrl: printerBridgeUrl() }
}

export async function probePrinter(): Promise<PrinterState> {
  const bridgeUrl = printerBridgeUrl()
  try {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 1800)
    const response = await fetch(`${bridgeUrl}/status`, { headers: { Accept: 'application/json' }, signal: controller.signal })
    window.clearTimeout(timeout)
    if (!response.ok) return publishPrinterState(state('FAILED', 'Printer bridge error', `Bridge returned HTTP ${response.status}.`))
    const body = await response.json() as { connected?: boolean; printerName?: string; error?: string }
    if (!body.connected) return publishPrinterState(state('OFFLINE', 'Printer not connected', body.error || body.printerName || 'Connect the P58E printer and check Bluetooth or USB.'))
    return publishPrinterState(state('CONNECTED', body.printerName ? `Connected: ${body.printerName}` : 'Printer connected', 'Ready to print.'))
  } catch (cause) {
    const detail = cause instanceof DOMException && cause.name === 'AbortError'
      ? 'The local printer bridge did not respond.'
      : 'No local printer bridge is responding. Browser print fallback is available.'
    return publishPrinterState(state('NOT_CONFIGURED', 'Printer bridge not connected', detail))
  }
}

export async function printInBackground(ticket: Ticket, kind: 'new' | 'reprint' = 'new'): Promise<PrinterState> {
  const before = await probePrinter()
  if (before.phase === 'CONNECTED') {
    publishPrinterState(state('PRINTING', 'Printing ticket', `${ticket.number} is being sent to the configured printer.`))
    try {
      const response = await fetch(`${before.bridgeUrl}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ kind, ticket }),
      })
      if (!response.ok) throw new Error(`Print bridge returned HTTP ${response.status}.`)
      return publishPrinterState(state('CONNECTED', 'Printed successfully', `${ticket.number} was sent to the printer.`))
    } catch (cause) {
      return publishPrinterState(state('FAILED', 'Printing failed', cause instanceof Error ? cause.message : 'The printer bridge rejected the job.'))
    }
  }
  return before
}
