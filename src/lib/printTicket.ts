import type { Ticket } from '../domain/types'
import { getService, maskPhone } from '../domain/rules'

/** Opens a print-only 58 mm ticket. The browser's selected local printer/driver handles output. */
export function printTicket(ticket: Ticket, kind: 'new' | 'reprint' = 'new'): boolean {
  const service = getService(ticket.service)
  const printWindow = window.open('', '_blank', 'popup,width=420,height=700')
  if (!printWindow) return false

  const registered = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(ticket.registeredAt))

  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>ONFON ${ticket.number}</title><style>
    @page { size: 58mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { width: 58mm; padding: 4mm 3mm; font-family: Arial, Helvetica, sans-serif; font-size: 10pt; }
    .ticket { width: 52mm; text-align: center; }
    .brand { font-size: 11pt; font-weight: 800; letter-spacing: .08em; }
    .department { margin-top: 1mm; font-size: 7pt; letter-spacing: .06em; }
    .rule { border: 0; border-top: .3mm dashed #000; margin: 3mm 0; }
    .label { font-size: 7pt; letter-spacing: .08em; }
    .number { margin: 2mm 0; font-size: 31pt; line-height: 1; font-weight: 900; letter-spacing: .02em; }
    .service { font-size: 13pt; font-weight: 800; }
    .meta { margin-top: 3mm; text-align: left; font-size: 8pt; line-height: 1.55; }
    .meta strong { float: right; }
    .footer { margin-top: 4mm; font-size: 7pt; line-height: 1.35; }
    .repeat { margin-top: 2mm; font-weight: 800; font-size: 8pt; }
    @media screen { body { margin: 12px; box-shadow: 0 0 0 1px #ddd; } }
  </style></head><body><main class="ticket">
    <div class="brand">ONFON MOBILE</div>
    <div class="department">RISK DEPARTMENT</div>
    <hr class="rule">
    <div class="label">QUEUE TICKET</div>
    <div class="number">${escapeHtml(ticket.number)}</div>
    <div class="service">${escapeHtml(service.name)}</div>
    <hr class="rule">
    <div class="meta"><div>DATE <strong>${escapeHtml(ticket.businessDate)}</strong></div><div>TIME <strong>${escapeHtml(registered)}</strong></div><div>PHONE <strong>${escapeHtml(maskPhone(ticket.phoneCanonical))}</strong></div></div>
    ${ticket.repeat ? '<div class="repeat">REPEAT VISIT</div>' : ''}
    <div class="footer">Please wait for your ticket number to be called.<br>Keep this ticket for your service.</div>
  </main><script>window.addEventListener('load', () => { window.setTimeout(() => { window.print(); window.addEventListener('afterprint', () => window.close(), { once: true }); }, 150); });</script></body></html>`)
  printWindow.document.close()
  return true
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character)
}
