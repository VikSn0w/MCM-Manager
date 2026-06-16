import { Resend } from "resend";
import { prisma } from "./db.server";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

interface SendMailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

async function sendMail({ to, subject, html }: SendMailOptions) {
  const recipients = Array.isArray(to) ? to : [to];
  const sender = "onboarding@resend.dev"; // Default Resend sandbox sender

  console.log(`[EMAIL MAIL] Tentativo di invio email:
    Da: Leasio - MCM Racing School <${sender}>
    A: ${recipients.join(", ")}
    Oggetto: ${subject}`);

  if (!resend) {
    console.log(`[EMAIL MAIL MOCK] RESEND_API_KEY non definita in .env. Corpo dell'email registrato nei log qui sotto:\n-------------------\n${html}\n-------------------`);
    return { success: true, mock: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: `Leasio - MCM Racing School <${sender}>`,
      to: recipients,
      subject,
      html,
    });

    if (error) {
      console.error("[EMAIL ERROR] Errore da Resend API:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error("[EMAIL ERROR CATCH] Eccezione nell'invio email:", err);
    return { success: false, error: err };
  }
}

/**
 * Invia email sia al cliente che al back office per notificare l'avvenuta creazione di una prenotazione
 */
export async function sendBookingCreatedEmail(bookingId: string, requestHost: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: true,
      bikes: {
        include: {
          bike: {
            include: {
              model: true,
            },
          },
        },
      },
    },
  });

  if (!booking) {
    console.warn(`[EMAIL WARN] Nessuna prenotazione trovata con ID ${bookingId} per l'invio dell'email di creazione.`);
    return;
  }

  const orderUrl = `${requestHost}/order/${booking.id}`;
  const qrCodeSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(orderUrl)}`;

  // Email per il cliente
  const clientHtml = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #0b1329; color: #f8fafc; padding: 40px 20px; border-radius: 24px; max-width: 600px; margin: 0 auto; border: 1px solid #1e293b;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #ea580c; text-transform: uppercase; margin: 0 0 10px 0; font-size: 28px; font-weight: 900; letter-spacing: 1px;">Prenotazione Ricevuta!</h1>
        <p style="color: #94a3b8; font-size: 14px; margin: 0;">La tua richiesta è in attesa di essere confermata dal backoffice.</p>
      </div>

      <div style="background-color: #0f172a; padding: 24px; border-radius: 16px; margin-bottom: 24px; border: 1px solid #334155;">
        <h2 style="color: #ffffff; font-size: 16px; margin: 0 0 16px 0; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">Dettagli Paddock Pass</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #cbd5e1; line-height: 1.6;">
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #94a3b8;">Codice Prenotazione:</td>
            <td style="padding: 6px 0; text-align: right; font-family: monospace; font-weight: bold; color: #ffffff;">#${booking.id.substring(0, 8)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #94a3b8;">Data Uscita Pista:</td>
            <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #ffffff;">${booking.date}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #94a3b8;">Orari Sessioni:</td>
            <td style="padding: 6px 0; text-align: right; color: #ea580c; font-weight: bold;">${booking.hours}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #94a3b8;">Numero Piloti:</td>
            <td style="padding: 6px 0; text-align: right;">${booking.peopleCount}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #94a3b8;">Turni Totali:</td>
            <td style="padding: 6px 0; text-align: right;">${booking.sessionsCount}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0 0 0; font-weight: bold; color: #94a3b8; font-size: 14px; border-top: 1px dashed #334155;">Totale Corrisposto (IVA incl.):</td>
            <td style="padding: 12px 0 0 0; text-align: right; color: #22c55e; font-weight: 900; font-size: 18px; border-top: 1px dashed #334155;">€${booking.totalPrice.toFixed(2)}</td>
          </tr>
        </table>
      </div>

      <div style="background-color: #0f172a; padding: 24px; border-radius: 16px; margin-bottom: 24px; border: 1px solid #334155;">
        <h2 style="color: #ffffff; font-size: 16px; margin: 0 0 16px 0; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">Assegnazione Flotta Ohvale GP</h2>
        <div style="font-size: 13px; color: #cbd5e1; line-height: 1.6;">
          ${booking.bikes.map((bb, idx) => `
            <div style="padding: 10px 0; border-bottom: ${idx === booking.bikes.length - 1 ? 'none' : '1px solid #1e293b'}; display: flex; justify-content: space-between; align-items: center;">
              <span><strong>${idx + 1}. ${bb.pilotName || 'Pilota'}</strong>: ${bb.bike.model.name}</span>
              ${bb.insuranceSelected ? '<span style="background-color: rgba(34, 197, 94, 0.1); color: #22c55e; font-weight: bold; font-size: 10px; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(34, 197, 94, 0.2);">Copertura Crash OK</span>' : '<span style="color: #64748b; font-size: 11px;">Nessuna Assicurazione</span>'}
            </div>
          `).join('')}
        </div>
      </div>

      <div style="text-align: center; margin: 30px 0; background-color: #0f172a; padding: 24px; border-radius: 16px; border: 1px solid #334155;">
        <p style="color: #94a3b8; font-size: 13px; margin: 0 0 15px 0;">QR Code ufficiale da presentare per la verifica al box:</p>
        <img src="${qrCodeSrc}" alt="QR Code Verifica" style="border: 6px solid #ffffff; border-radius: 12px; width: 160px; height: 160px; display: block; margin: 0 auto;" />
      </div>

      <div style="text-align: center; margin-top: 30px;">
        <a href="${orderUrl}" style="background-color: #ea580c; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: bold; font-size: 14px; text-transform: uppercase; display: inline-block; box-shadow: 0 4px 12px rgba(234, 88, 12, 0.25); transition: all 0.2s;">Visualizza e Scarica Pass / PDF</a>
      </div>
    </div>
  `;

  await sendMail({
    to: booking.user.email,
    subject: `Richiesta Prenotazione Ricevuta - Leasio - MCM Racing School [#${booking.id.substring(0, 8)}]`,
    html: clientHtml,
  });

  // Query admins
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
  const adminEmails = admins.length > 0 ? admins.map(a => a.email) : ["admin@leasio.com"];

  // Email per il back office
  const backofficeHtml = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #0b1329; color: #f8fafc; padding: 40px 20px; border-radius: 24px; max-width: 600px; margin: 0 auto; border: 1px solid #1e293b;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #f59e0b; text-transform: uppercase; margin: 0 0 10px 0; font-size: 26px; font-weight: 900; letter-spacing: 1px;">Azione Richiesta: Prenotazione in Attesa!</h1>
        <p style="color: #94a3b8; font-size: 14px; margin: 0;">Una nuova prenotazione è stata creata da un cliente ed è in attesa di approvazione.</p>
      </div>

      <div style="background-color: #0f172a; padding: 24px; border-radius: 16px; margin-bottom: 24px; border: 1px solid #334155;">
        <h2 style="color: #ffffff; font-size: 16px; margin: 0 0 16px 0; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">Dettagli Richiesta</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #cbd5e1; line-height: 1.6;">
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #94a3b8;">Cliente / Pilota:</td>
            <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #ffffff;">${booking.user.name} (${booking.user.email})</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #94a3b8;">ID Riserva:</td>
            <td style="padding: 6px 0; text-align: right; font-family: monospace;">#${booking.id}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #94a3b8;">Data Pista:</td>
            <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #ffffff;">${booking.date}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #94a3b8;">Turni Orari:</td>
            <td style="padding: 6px 0; text-align: right; color: #ea580c; font-weight: bold;">${booking.hours}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #94a3b8;">Numero Piloti:</td>
            <td style="padding: 6px 0; text-align: right;">${booking.peopleCount}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0 0 0; font-weight: bold; color: #94a3b8; font-size: 14px; border-top: 1px dashed #334155;">Valore Totale:</td>
            <td style="padding: 12px 0 0 0; text-align: right; color: #22c55e; font-weight: bold; font-size: 18px; border-top: 1px dashed #334155;">€${booking.totalPrice.toFixed(2)}</td>
          </tr>
        </table>
      </div>

      <div style="text-align: center; margin-top: 30px;">
        <a href="${requestHost}/admin" style="background-color: #f59e0b; color: #0b1329; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: bold; font-size: 14px; text-transform: uppercase; display: inline-block; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.25);">Accedi al Backoffice</a>
      </div>
    </div>
  `;

  await sendMail({
    to: adminEmails,
    subject: `[ATTENZIONE] Nuova Prenotazione in Attesa - ${booking.user.name}`,
    html: backofficeHtml,
  });
}

/**
 * Invia email di conferma prenotazione al cliente
 */
export async function sendBookingConfirmedEmail(bookingId: string, requestHost: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: true,
      bikes: {
        include: {
          bike: {
            include: {
              model: true,
            },
          },
        },
      },
    },
  });

  if (!booking) {
    console.warn(`[EMAIL WARN] Nessuna prenotazione trovata con ID ${bookingId} per l'invio dell'email di conferma.`);
    return;
  }

  const orderUrl = `${requestHost}/order/${booking.id}`;
  const qrCodeSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(orderUrl)}`;

  const clientHtml = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #0b1329; color: #f8fafc; padding: 40px 20px; border-radius: 24px; max-width: 600px; margin: 0 auto; border: 1px solid #1e293b;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #22c55e; text-transform: uppercase; margin: 0 0 10px 0; font-size: 28px; font-weight: 900; letter-spacing: 1px;">Prenotazione Confermata!</h1>
        <p style="color: #94a3b8; font-size: 14px; margin: 0;">Lo staff ha confermato la tua richiesta. Il tuo paddock pass è ora attivo.</p>
      </div>

      <div style="background-color: #0f172a; padding: 24px; border-radius: 16px; margin-bottom: 24px; border: 1px solid #334155;">
        <h2 style="color: #ffffff; font-size: 16px; margin: 0 0 16px 0; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">Dettagli Paddock Pass</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #cbd5e1; line-height: 1.6;">
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #94a3b8;">Codice Prenotazione:</td>
            <td style="padding: 6px 0; text-align: right; font-family: monospace; font-weight: bold; color: #ffffff;">#${booking.id.substring(0, 8)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #94a3b8;">Data Uscita Pista:</td>
            <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #ffffff;">${booking.date}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #94a3b8;">Orari Sessioni:</td>
            <td style="padding: 6px 0; text-align: right; color: #ea580c; font-weight: bold;">${booking.hours}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0 0 0; font-weight: bold; color: #94a3b8; font-size: 14px; border-top: 1px dashed #334155;">Prezzo Totale (IVA incl.):</td>
            <td style="padding: 12px 0 0 0; text-align: right; color: #22c55e; font-weight: 900; font-size: 18px; border-top: 1px dashed #334155;">€${booking.totalPrice.toFixed(2)}</td>
          </tr>
        </table>
      </div>

      <div style="text-align: center; margin: 30px 0; background-color: #0f172a; padding: 24px; border-radius: 16px; border: 1px solid #334155;">
        <p style="color: #94a3b8; font-size: 13px; margin: 0 0 15px 0;">Presenta questo QR Code ai box per accedere alla pista:</p>
        <img src="${qrCodeSrc}" alt="QR Code Verifica" style="border: 6px solid #ffffff; border-radius: 12px; width: 160px; height: 160px; display: block; margin: 0 auto;" />
      </div>

      <div style="text-align: center; margin-top: 30px;">
        <a href="${orderUrl}" style="background-color: #22c55e; color: #0b1329; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: bold; font-size: 14px; text-transform: uppercase; display: inline-block; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.25);">Visualizza e Scarica Pass / PDF</a>
      </div>
    </div>
  `;

  await sendMail({
    to: booking.user.email,
    subject: `PRENOTAZIONE CONFERMATA - Leasio - MCM Racing School [#${booking.id.substring(0, 8)}]`,
    html: clientHtml,
  });
}

/**
 * Invia email di cancellazione sia al cliente che al back office
 */
export async function sendBookingCancelledEmail(bookingId: string, requestHost: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: true,
      bikes: {
        include: {
          bike: {
            include: {
              model: true,
            },
          },
        },
      },
    },
  });

  if (!booking) {
    console.warn(`[EMAIL WARN] Nessuna prenotazione trovata con ID ${bookingId} per l'invio dell'email di cancellazione.`);
    return;
  }

  // Email per il cliente
  const clientHtml = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #0b1329; color: #f8fafc; padding: 40px 20px; border-radius: 24px; max-width: 600px; margin: 0 auto; border: 1px solid #1e293b;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #ef4444; text-transform: uppercase; margin: 0 0 10px 0; font-size: 28px; font-weight: 900; letter-spacing: 1px;">Prenotazione Annullata</h1>
        <p style="color: #94a3b8; font-size: 14px; margin: 0;">La tua prenotazione paddock è stata annullata con successo e le moto allocate sono state liberate.</p>
      </div>

      <div style="background-color: #0f172a; padding: 24px; border-radius: 16px; margin-bottom: 24px; border: 1px solid #334155;">
        <h2 style="color: #ffffff; font-size: 16px; margin: 0 0 16px 0; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">Riepilogo Annullamento</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #cbd5e1; line-height: 1.6;">
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #94a3b8;">Codice Prenotazione:</td>
            <td style="padding: 6px 0; text-align: right; font-family: monospace; font-weight: bold; color: #ffffff;">#${booking.id.substring(0, 8)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #94a3b8;">Data Originaria Pista:</td>
            <td style="padding: 6px 0; text-align: right;">${booking.date}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #94a3b8;">Orari Sessioni:</td>
            <td style="padding: 6px 0; text-align: right;">${booking.hours}</td>
          </tr>
        </table>
      </div>

      <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 20px; line-height: 1.5;">Se ritieni che questo annullamento sia un errore, contatta subito la nostra assistenza clienti.</p>
    </div>
  `;

  await sendMail({
    to: booking.user.email,
    subject: `Prenotazione Annullata - Leasio - MCM Racing School [#${booking.id.substring(0, 8)}]`,
    html: clientHtml,
  });

  // Query admins
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
  const adminEmails = admins.length > 0 ? admins.map(a => a.email) : ["admin@leasio.com"];

  // Email per il back office
  const backofficeHtml = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #0b1329; color: #f8fafc; padding: 40px 20px; border-radius: 24px; max-width: 600px; margin: 0 auto; border: 1px solid #1e293b;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #ef4444; text-transform: uppercase; margin: 0 0 10px 0; font-size: 26px; font-weight: 900; letter-spacing: 1px;">Notifica: Prenotazione Annullata</h1>
        <p style="color: #94a3b8; font-size: 14px; margin: 0;">La prenotazione indicata è stata annullata. Gli slot di capacità e le moto assegnate sono stati liberati.</p>
      </div>

      <div style="background-color: #0f172a; padding: 24px; border-radius: 16px; border: 1px solid #334155;">
        <h2 style="color: #ffffff; font-size: 16px; margin: 0 0 16px 0; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">Dettagli Prenotazione</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #cbd5e1; line-height: 1.6;">
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #94a3b8;">Cliente:</td>
            <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #ffffff;">${booking.user.name} (${booking.user.email})</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #94a3b8;">ID Completo:</td>
            <td style="padding: 6px 0; text-align: right; font-family: monospace;">${booking.id}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #94a3b8;">Data Uscita Pista:</td>
            <td style="padding: 6px 0; text-align: right;">${booking.date}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #94a3b8;">Orari Sessioni:</td>
            <td style="padding: 6px 0; text-align: right;">${booking.hours}</td>
          </tr>
        </table>
      </div>
    </div>
  `;

  await sendMail({
    to: adminEmails,
    subject: `[NOTIFICA] Prenotazione Annullata - ${booking.user.name}`,
    html: backofficeHtml,
  });
}
