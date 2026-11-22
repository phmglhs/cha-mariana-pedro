/* Monta o payload Pix "copia e cola" (BR Code / EMV) a partir da chave. */
(function (global) {
  function tlv(id, value) {
    const v = String(value);
    const len = String(v.length).padStart(2, "0");
    return id + len + v;
  }

  function crc16(str) {
    let crc = 0xffff;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xffff;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }

  function sanitize(value, max) {
    const map = {
      á: "a", à: "a", â: "a", ã: "a", ä: "a",
      é: "e", è: "e", ê: "e", ë: "e",
      í: "i", ì: "i", î: "i", ï: "i",
      ó: "o", ò: "o", ô: "o", õ: "o", ö: "o",
      ú: "u", ù: "u", û: "u", ü: "u",
      ç: "c", ñ: "n",
    };
    const normalized = String(value || "")
      .split("")
      .map((ch) => {
        const lower = ch.toLowerCase();
        return map[lower] ? (ch === lower ? map[lower] : map[lower].toUpperCase()) : ch;
      })
      .join("")
      .replace(/[^A-Za-z0-9 $%*+\-.\/]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
    return normalized || "NA";
  }

  function buildPayload(options) {
    const key = String(options.key || "").trim();
    if (!key) throw new Error("Chave Pix ausente.");
    const name = sanitize(options.name || "Mariana Ferreira Redoan", 25);
    const city = sanitize(options.city || "SAO PAULO", 15).toUpperCase();
    const txid = sanitize(options.txid || "***", 25).replace(/\s+/g, "") || "***";
    const description = options.description ? sanitize(options.description, 40) : "";

    let merchant = tlv("00", "br.gov.bcb.pix") + tlv("01", key);
    if (description) merchant += tlv("02", description);

    let payload = tlv("00", "01") + tlv("01", "11") + tlv("26", merchant) + tlv("52", "0000") + tlv("53", "986");
    if (options.amount != null && options.amount !== "" && Number(options.amount) > 0) {
      payload += tlv("54", Number(options.amount).toFixed(2));
    }
    payload += tlv("58", "BR") + tlv("59", name) + tlv("60", city) + tlv("62", tlv("05", txid)) + "6304";
    payload += crc16(payload);
    return payload;
  }

  async function toDataUrl(payload) {
    if (!global.QRCodeLib || !global.QRCodeLib.toDataURL) {
      throw new Error("Biblioteca de QR Code não carregou.");
    }
    return global.QRCodeLib.toDataURL(payload, {
      width: 480,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#4A2F26", light: "#FFFFFF" },
    });
  }

  global.PixBR = { buildPayload, toDataUrl, crc16 };
})(window);
