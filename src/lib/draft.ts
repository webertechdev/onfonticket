const DRAFT_KEY = 'onfon-kiosk-draft-v1'
const DRAFT_TTL_MS = 10 * 60 * 1000

export interface KioskDraft {
  step: 'welcome' | 'service' | 'phone' | 'review' | 'created'
  service?: string
  phoneInput: string
  savedAt: number
}

export function loadDraft(): KioskDraft | null {
  const raw = localStorage.getItem(DRAFT_KEY)
  if (!raw) return null
  const draft = JSON.parse(raw) as KioskDraft
  if (Date.now() - draft.savedAt > DRAFT_TTL_MS) { clearDraft(); return null }
  return draft
}

export function saveDraft(draft: Omit<KioskDraft, 'savedAt'>): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: Date.now() }))
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_KEY)
}
