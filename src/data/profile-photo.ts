/** Decode locally and re-encode a square JPEG; strips metadata and bounds payload. */
export async function prepareProfilePhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "Elige una foto JPG, PNG o WebP. Si usas HEIC, expórtala como JPG.",
    );
  if (file.size > 10 * 1024 * 1024)
    throw new Error("La foto debe ocupar menos de 10 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new Error("No se ha podido leer la imagen. Prueba con otra foto.");
    });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se ha podido preparar la foto.");
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 256, 256);
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256,
    );
    for (const quality of [0.82, 0.65, 0.45]) {
      const result = canvas.toDataURL("image/jpeg", quality);
      if (result.length <= 48000) return result;
    }
    throw new Error(
      "Esta imagen tiene demasiado detalle. Prueba con otra foto.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
