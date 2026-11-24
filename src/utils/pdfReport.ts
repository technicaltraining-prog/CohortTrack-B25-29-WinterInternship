import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BatchRecord } from '../types/internship';

export interface PdfBatchRow {
  batch: BatchRecord;
  present: number;
  late: number;
  od: number;
  absent: number;
  unmarked: number;
  attended: number;
  rate: number;
}

export interface PdfSummaryTotals {
  enrolled: number;
  present: number;
  late: number;
  od: number;
  absent: number;
  unmarked: number;
  attended: number;
  rate: number;
}

export function downloadDailyAttendancePdf(params: {
  programTitle: string;
  dayLabel: string;
  dateKey: string;
  rows: PdfBatchRow[];
  totals: PdfSummaryTotals;
}): void {
  const { programTitle, dayLabel, dateKey, rows, totals } = params;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;

  // Top Header Strip
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Daily Attendance Summary Report', marginX, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(programTitle, marginX, 18.5);

  const generatedStamp = new Date().toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  doc.text(`${dayLabel} (${dateKey})`, pageWidth - marginX, 12, {
    align: 'right',
  });
  doc.setFontSize(8);
  doc.text(`Generated: ${generatedStamp}`, pageWidth - marginX, 18.5, {
    align: 'right',
  });

  // Summary KPI Cards Row (6 boxes)
  const kpiY = 34;
  const gap = 2.5;
  const boxWidth = (contentWidth - gap * 5) / 6;
  const boxHeight = 18;

  const pctOf = (count: number) =>
    totals.enrolled > 0 ? `${((count / totals.enrolled) * 100).toFixed(1)}%` : '0.0%';

  const kpis: {
    label: string;
    value: string;
    sub: string;
    color: [number, number, number];
  }[] = [
    {
      label: 'TOTAL ENROLLED',
      value: String(totals.enrolled),
      sub: `${totals.rate.toFixed(1)}% attended`,
      color: [15, 23, 42],
    },
    {
      label: 'PRESENT',
      value: String(totals.present),
      sub: pctOf(totals.present),
      color: [21, 128, 61],
    },
    {
      label: 'LATE',
      value: String(totals.late),
      sub: pctOf(totals.late),
      color: [180, 83, 9],
    },
    {
      label: 'ON-DUTY (OD)',
      value: String(totals.od),
      sub: pctOf(totals.od),
      color: [29, 78, 216],
    },
    {
      label: 'ABSENT',
      value: String(totals.absent),
      sub: pctOf(totals.absent),
      color: [190, 18, 60],
    },
    {
      label: 'UNMARKED',
      value: String(totals.unmarked),
      sub: pctOf(totals.unmarked),
      color: [71, 85, 105],
    },
  ];

  kpis.forEach((kpi, idx) => {
    const x = marginX + idx * (boxWidth + gap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, kpiY, boxWidth, boxHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + 2.5, kpiY + 5);

    doc.setFontSize(12);
    doc.setTextColor(...kpi.color);
    doc.text(kpi.value, x + 2.5, kpiY + 11.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.sub, x + 2.5, kpiY + 15.8);
  });

  // Table Section Heading
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Batch-by-Batch Attendance Breakdown', marginX, 60);

  const tableBody = rows.map((row) => {
    const isCore = row.batch.trackType === 'CORE';
    const venueLabel = row.batch.venue
      ? row.batch.roomNumber
        ? `${row.batch.venue} (${row.batch.roomNumber})`
        : row.batch.venue
      : 'Pending';
    return [
      row.batch.department,
      row.batch.organisation,
      venueLabel,
      isCore ? 'CORE' : String(row.batch.studentCount),
      isCore ? '—' : String(row.present),
      isCore ? '—' : String(row.late),
      isCore ? '—' : String(row.od),
      isCore ? '—' : String(row.absent),
      isCore ? '—' : String(row.unmarked),
      isCore ? '—' : `${row.rate.toFixed(1)}%`,
    ];
  });

  const itBatchCount = rows.filter((r) => r.batch.trackType === 'IT').length;

  autoTable(doc, {
    startY: 63,
    margin: { left: marginX, right: marginX, bottom: 18 },
    head: [
      [
        'Dept',
        'Partner',
        'Venue (Room)',
        'Enrolled',
        'Present',
        'Late',
        'OD',
        'Absent',
        'Unmarked',
        'Attended %',
      ],
    ],
    body: tableBody,
    foot: [
      [
        `Total (${itBatchCount} IT)`,
        'All Partners',
        '',
        String(totals.enrolled),
        String(totals.present),
        String(totals.late),
        String(totals.od),
        String(totals.absent),
        String(totals.unmarked),
        `${totals.rate.toFixed(1)}%`,
      ],
    ],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: { top: 2.2, right: 2, bottom: 2.2, left: 2 },
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [51, 65, 85],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 18 },
      1: { cellWidth: 28 },
      2: { cellWidth: 28 },
      3: { halign: 'right', cellWidth: 15 },
      4: { halign: 'right', textColor: [21, 128, 61], cellWidth: 15 },
      5: { halign: 'right', textColor: [180, 83, 9], cellWidth: 12 },
      6: { halign: 'right', textColor: [29, 78, 216], cellWidth: 12 },
      7: { halign: 'right', textColor: [190, 18, 60], cellWidth: 14 },
      8: { halign: 'right', textColor: [100, 116, 139], cellWidth: 18 },
      9: { halign: 'right', fontStyle: 'bold', cellWidth: 22 },
    },
    didDrawPage: () => {
      const pageCount = doc.getNumberOfPages();
      const currentPage = doc.getCurrentPageInfo().pageNumber;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `CohortTrack — ${programTitle}`,
        marginX,
        pageHeight - 8
      );
      doc.text(
        `Page ${currentPage} of ${pageCount}`,
        pageWidth - marginX,
        pageHeight - 8,
        { align: 'right' }
      );
    },
  });

  doc.save(`B2025-2029_Daily_Attendance_Report_${dateKey}.pdf`);
}
