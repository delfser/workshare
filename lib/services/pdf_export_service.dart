import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../models/material_item.dart';
import '../models/work_log.dart';

class PdfExportService {
  String _formatNumber(double value) {
    if (value == value.roundToDouble()) {
      return value.toInt().toString();
    }
    return value
        .toStringAsFixed(2)
        .replaceAll(RegExp(r'0+$'), '')
        .replaceAll(RegExp(r'\.$'), '');
  }

  Future<Uint8List> buildMaterialPdf({
    required String projectName,
    List<String> activities = const [],
    required List<MaterialItem> materials,
    List<WorkLog> workLogs = const [],
  }) async {
    final doc = pw.Document();
    final date = DateFormat('dd.MM.yyyy').format(DateTime.now());
    pw.MemoryImage? logoImage;
    try {
      final logoBytes = await rootBundle.load('assets/branding/icon.png');
      logoImage = pw.MemoryImage(logoBytes.buffer.asUint8List());
    } catch (_) {
      logoImage = null;
    }
    final totalHours = workLogs.fold<double>(0, (sum, log) => sum + log.hours);
    final longestUnitLen = materials.isEmpty
        ? 0
        : materials
            .map((m) => m.unit.trim().length)
            .reduce((a, b) => a > b ? a : b);
    final unitColumnWidth =
        ((longestUnitLen * 6 + 24).toDouble().clamp(56, 84)).toDouble();
    const qtyColumnWidth = 68.0;

    doc.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        build: (context) {
          final content = <pw.Widget>[
            pw.Row(
              crossAxisAlignment: pw.CrossAxisAlignment.center,
              children: [
                if (logoImage != null)
                  pw.Container(
                    width: 56,
                    height: 56,
                    margin: const pw.EdgeInsets.only(right: 10),
                    child: pw.Image(logoImage),
                  ),
                pw.Expanded(
                  child: pw.Text(
                    'WorkShare Materialexport',
                    style: pw.TextStyle(
                        fontSize: 20, fontWeight: pw.FontWeight.bold),
                  ),
                ),
              ],
            ),
            pw.SizedBox(height: 8),
            pw.Divider(),
            pw.SizedBox(height: 6),
            pw.Text('Projekt: $projectName'),
            pw.Text('Erstellt am: $date'),
            pw.SizedBox(height: 16),
            if (activities.isNotEmpty) ...[
              pw.Text(
                'Tätigkeiten',
                style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
              ),
              pw.SizedBox(height: 8),
              ...activities
                  .map((activity) => activity.trim())
                  .where((activity) => activity.isNotEmpty)
                  .map(
                    (activity) => pw.Padding(
                      padding: const pw.EdgeInsets.only(bottom: 4),
                      child: pw.Text('- $activity'),
                    ),
                  ),
              pw.SizedBox(height: 14),
            ],
            pw.Text('Materialien',
                style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
            pw.SizedBox(height: 8),
            pw.TableHelper.fromTextArray(
              headers: const ['Name', 'Menge', 'Einheit'],
              data: materials
                  .map((m) => [
                        m.name,
                        _formatNumber(m.quantity),
                        m.unit,
                      ])
                  .toList(),
              columnWidths: {
                0: const pw.FlexColumnWidth(),
                1: const pw.FixedColumnWidth(qtyColumnWidth),
                2: pw.FixedColumnWidth(unitColumnWidth),
              },
              headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold),
              cellAlignments: {
                1: pw.Alignment.centerRight,
                2: pw.Alignment.centerLeft,
              },
            ),
          ];

          if (workLogs.isNotEmpty) {
            content.add(pw.SizedBox(height: 16));
            content.add(pw.Text('Arbeitszeiten',
                style: pw.TextStyle(fontWeight: pw.FontWeight.bold)));
            content.add(pw.SizedBox(height: 8));
            content.add(
              pw.TableHelper.fromTextArray(
                headers: const ['Arbeiter', 'Stunden'],
                data: workLogs
                    .map((w) => [w.worker, _formatNumber(w.hours)])
                    .toList(),
                columnWidths: {
                  0: const pw.FlexColumnWidth(),
                  1: const pw.FixedColumnWidth(70),
                },
                headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold),
                cellAlignments: {
                  1: pw.Alignment.centerRight,
                },
              ),
            );
            content.add(pw.SizedBox(height: 10));
            content.add(
              pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                children: [
                  pw.Text(
                    'Gesamtstunden',
                    style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
                  ),
                  pw.Text(
                    _formatNumber(totalHours),
                    style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
                  ),
                ],
              ),
            );
          }

          return content;
        },
      ),
    );

    return doc.save();
  }

  Future<void> shareMaterialPdf({
    required String projectName,
    List<String> activities = const [],
    required List<MaterialItem> materials,
    List<WorkLog> workLogs = const [],
  }) async {
    final bytes = await buildMaterialPdf(
      projectName: projectName,
      activities: activities,
      materials: materials,
      workLogs: workLogs,
    );
    await Printing.sharePdf(
        bytes: bytes, filename: 'workshare_material_$projectName.pdf');
  }
}
