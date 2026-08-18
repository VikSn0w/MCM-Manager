import QRCode from "qrcode";

/**
 * Renders a QR code as a self-contained data URI.
 *
 * Generating these locally keeps booking URLs off third-party services: the
 * previous implementation handed every order URL to api.qrserver.com.
 */
export async function buildQrDataUri(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: 300,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch (error) {
    console.error("[QR] Failed to generate QR code:", error);
    return "";
  }
}
