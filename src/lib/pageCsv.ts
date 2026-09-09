export type CsvValue = string | number | boolean | null | undefined;

export function csvText(headers: CsvValue[], rows: CsvValue[][]): string {
  const escape = (value: CsvValue) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n');
}

export function downloadCsv(filename: string, headers: CsvValue[], rows: CsvValue[][]): void {
  const blob = new Blob([`\uFEFF${csvText(headers, rows)}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
