import 'dart:io';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../utils/app_notice.dart';

class PhotoViewerScreen extends StatelessWidget {
  const PhotoViewerScreen({
    super.key,
    this.imageUrl,
    this.localPath,
  });

  final String? imageUrl;
  final String? localPath;

  Future<void> _download(BuildContext context) async {
    if (imageUrl == null || imageUrl!.isEmpty) {
      showAppNotice(
        context,
        'Download erst nach abgeschlossenem Upload verfügbar.',
        type: AppNoticeType.info,
      );
      return;
    }
    final uri = Uri.parse(imageUrl!);
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!context.mounted) return;
    if (ok) {
      showAppNotice(
        context,
        'Download im Browser gestartet.',
        type: AppNoticeType.success,
      );
    } else {
      showAppNotice(
        context,
        'Download konnte nicht gestartet werden.',
        type: AppNoticeType.error,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasLocal = localPath != null &&
        localPath!.isNotEmpty &&
        File(localPath!).existsSync();
    final hasRemote = imageUrl != null && imageUrl!.isNotEmpty;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Foto'),
        actions: [
          IconButton(
            onPressed: hasRemote ? () => _download(context) : null,
            icon: const Icon(Icons.download_outlined),
            tooltip: 'Download',
          ),
        ],
      ),
      body: InteractiveViewer(
        minScale: 0.8,
        maxScale: 5,
        child: Center(
          child: hasLocal
              ? Image.file(
                  File(localPath!),
                  fit: BoxFit.contain,
                  width: double.infinity,
                  height: double.infinity,
                )
              : hasRemote
                  ? Image.network(
                      imageUrl!,
                      fit: BoxFit.contain,
                      width: double.infinity,
                      height: double.infinity,
                    )
                  : const Text('Bild noch nicht verfügbar.'),
        ),
      ),
    );
  }
}
