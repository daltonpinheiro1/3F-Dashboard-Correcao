/** Exporta tabela no formato SpreadsheetML — abre direto no Excel, sem dependência extra. */
export function downloadExcelTable(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
): void {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const rowXml = (cells: (string | number | null | undefined)[]) =>
    `<Row>${cells
      .map((c) => {
        if (c === null || c === undefined || c === '') {
          return '<Cell><Data ss:Type="String"></Data></Cell>';
        }
        const isNum = typeof c === 'number' && Number.isFinite(c);
        return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${
          isNum ? c : esc(String(c))
        }</Data></Cell>`;
      })
      .join('')}</Row>`;

  const safeSheet = esc(sheetName.slice(0, 31) || 'Dados');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${safeSheet}">
<Table>
${rowXml(headers)}
${rows.map(rowXml).join('\n')}
</Table>
</Worksheet>
</Workbook>`;

  const blob = new Blob(['\ufeff', xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
