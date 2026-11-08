# ONFON printer setup — Epson L3210

## Current hardware

The Epson EcoTank L3210 is an A4 inkjet printer. It connects to the kiosk computer by USB and uses the installed Epson printer driver. It does not have built-in Wi‑Fi or Bluetooth. Epson's official guide recommends connecting the printer directly to the computer rather than through a USB hub.

The ONFON application renders the ticket at a 58 mm thermal-ticket width (`@page { size: 58mm auto }`). This keeps the layout compatible with the future thermal printer. With the L3210, the computer's print dialog/driver may place that 58 mm layout on the selected A4 sheet; configure the driver for the loaded paper and use one copy.

## Physical setup

1. Install the Epson L3210 driver and Epson Printer Connection Checker on the kiosk computer.
2. Connect the printer directly to the computer with a USB printer cable. Do not use a USB hub for the initial setup.
3. Power on the printer and print an operating-system test page.
4. Set the Epson L3210 as the default printer on the kiosk computer.
5. Open `https://onfonticket.pages.dev/kiosk` in the kiosk browser.
6. Allow pop-ups for `onfonticket.pages.dev`; the print ticket action opens a print-only window.
7. Register a test customer. When the ticket is saved, select **Print ticket**, choose the Epson L3210, set one copy, and print.

## Duplicate-safe behavior

Ticket creation is completed in Supabase before printing. A browser print failure therefore does not create another queue ticket. Use the **Print existing ticket** action to print again. The existing-ticket flow calls the protected reprint RPC and then prints the same ticket number; it never creates a second queue record.

## When the thermal printer is purchased

Keep the same ticket data and print job records. Replace only the local print transport with a USB ESC/POS or QZ Tray/local-agent transport, preserving the 58 mm CSS/layout measurements and the existing idempotency key. Do not expose a printer port or printer credentials to the public internet.
