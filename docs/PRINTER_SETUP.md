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

## Approved pilot printer decision — P58E with perforated paper

The approved low-cost pilot configuration is the P58E Bluetooth 58 mm thermal printer used with the Tecno MegaPad SE Android tablet and **58 mm perforated thermal receipt paper**. The perforation replaces the need for an automatic cutter: the printer feeds the completed ticket to the tear line and the customer or attendant tears it cleanly by hand.

Purchase and verify paper that is:

- 57–58 mm wide and compatible with the P58E paper compartment;
- direct-thermal and BPA-compliant where available;
- supplied as a continuous roll with regular pre-cut perforations;
- narrow enough that the perforation does not rub against the printer guides;
- tested for reliable feeding without curling, slipping, or double-feeding.

Do not modify the P58E to install an internal cutter. Do not use a separate exposed blade at the kiosk. If a manual cutter is later required, use only a guarded commercial 58 mm paper trimmer positioned away from customer reach; the preferred pilot method remains the integrated tear edge plus perforated paper.

The first physical acceptance test must print at least ten tickets from the Tecno MegaPad SE over Bluetooth. Each ticket must stop at or close to the perforation, remain readable, tear without damaging the ticket number, and leave the next ticket ready for printing. Test one new roll, a nearly empty roll, and a repeated print after a simulated Bluetooth or paper-feed interruption.
