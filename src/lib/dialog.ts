/** Opens a <dialog> as a modal; browsers without showModal (older in-app browsers) get the plain open state instead of a thrown error. */
export function showDialog(dialog: HTMLDialogElement | null): void {
  if (!dialog || dialog.open) return;
  try {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  } catch { dialog.setAttribute("open", ""); }
}
export function closeDialog(dialog: HTMLDialogElement | null): void {
  if (!dialog) return;
  try { if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open"); } catch { dialog.removeAttribute("open"); }
}
