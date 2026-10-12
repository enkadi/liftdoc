export async function downloadFile(jobId: string) {
  const response = await fetch(`/api/v1/jobs/${jobId}/download`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} - ${response.statusText}`);
  }

  const header = response.headers.get("Content-Disposition");
  const match = header?.match(/filename="?([^";]+)"?/);
  const filename = match ? match[1] : "downloaded_file.docx";
  saveBlob(await response.blob(), filename);
}

function saveBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}