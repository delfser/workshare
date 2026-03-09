import 'dart:typed_data';

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
    return value.toStringAsFixed(2).replaceAll(RegExp(r'0+$'), '').replaceAll(RegExp(r'\.$'), '');
  }

  Future<Uint8List> buildMaterialPdf({
    required String projectName,
    required List<MaterialItem> materials,
    List<WorkLog> workLogs = const [],
  }) async {
    final doc = pw.Document();
    final date = DateFormat('dd.MM.yyyy').format(DateTime.now());

    doc.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        build: (context) {
          final content = <pw.Widget>[
            pw.Text('WorkShare - Materialexport',
                style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold)),
            pw.SizedBox(height: 8),
            pw.Text('Projekt: $projectName'),
            pw.Text('Erstellt am: $date'),
            pw.SizedBox(height: 16),
            pw.Text('Materialien', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
            pw.SizedBox(height: 8),
            pw.Table.fromTextArray(
              headers: const ['Name', 'Menge', 'Einheit'],
              data: materials
                  .map((m) => [
                        m.name,
                        _formatNumber(m.quantity),
                        m.unit,
                      ])
                  .toList(),
            ),
          ];

          if (workLogs.isNotEmpty) {
            content.add(pw.SizedBox(height: 16));
            content.add(pw.Text('Arbeitszeiten', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)));
            content.add(pw.SizedBox(height: 8));
            content.add(
              pw.Table.fromTextArray(
                headers: const ['Arbeiter', 'Stunden', 'Datum'],
                data: workLogs
                    .map((w) => [
                          w.worker,
                          _formatNumber(w.hours),
                          DateFormat('dd.MM.yyyy').format(w.updatedAt),
                        ])
                    .toList(),
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
    required List<MaterialItem> materials,
    List<WorkLog> workLogs = const [],
  }) async {
    final bytes = await buildMaterialPdf(
      projectName: projectName,
      materials: materials,
      workLogs: workLogs,
    );
    await Printing.sharePdf(bytes: bytes, filename: 'workshare_material_$projectName.pdf');
  }
}
