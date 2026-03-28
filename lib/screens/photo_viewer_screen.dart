import 'dart:io';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../utils/app_notice.dart';

class PhotoViewerImage {
  const PhotoViewerImage({
    this.imageUrl,
    this.localPath,
  });

  final String? imageUrl;
  final String? localPath;
}

class PhotoViewerScreen extends StatefulWidget {
  const PhotoViewerScreen({
    super.key,
    required this.photos,
    this.initialIndex = 0,
  });

  final List<PhotoViewerImage> photos;
  final int initialIndex;

  @override
  State<PhotoViewerScreen> createState() => _PhotoViewerScreenState();
}

class _PhotoViewerScreenState extends State<PhotoViewerScreen> {
  late final PageController _pageController;
  late int _currentIndex;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex.clamp(0, widget.photos.length - 1);
    _pageController = PageController(initialPage: _currentIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  PhotoViewerImage get _currentPhoto => widget.photos[_currentIndex];

  bool _hasLocal(PhotoViewerImage photo) {
    final path = photo.localPath;
    return path != null && path.isNotEmpty && File(path).existsSync();
  }

  bool _hasRemote(PhotoViewerImage photo) {
    final url = photo.imageUrl;
    return url != null && url.isNotEmpty;
  }

  Future<void> _downloadCurrent(BuildContext context) async {
    final url = _currentPhoto.imageUrl;
    if (url == null || url.isEmpty) {
      showAppNotice(
        context,
        'Download erst nach abgeschlossenem Upload verfuegbar.',
        type: AppNoticeType.info,
      );
      return;
    }
    final ok = await launchUrl(
      Uri.parse(url),
      mode: LaunchMode.externalApplication,
    );
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

  Widget _buildPage(PhotoViewerImage photo) {
    final hasLocal = _hasLocal(photo);
    final hasRemote = _hasRemote(photo);
    final localPath = photo.localPath;
    final remoteUrl = photo.imageUrl;

    return InteractiveViewer(
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
                    remoteUrl!,
                    fit: BoxFit.contain,
                    width: double.infinity,
                    height: double.infinity,
                  )
                : const Text('Bild noch nicht verfuegbar.'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final canDownload = _hasRemote(_currentPhoto);

    return Scaffold(
      appBar: AppBar(
        title: Text('Foto ${_currentIndex + 1}/${widget.photos.length}'),
        actions: [
          IconButton(
            onPressed: canDownload ? () => _downloadCurrent(context) : null,
            icon: const Icon(Icons.download_outlined),
            tooltip: 'Download',
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: PageView.builder(
              controller: _pageController,
              itemCount: widget.photos.length,
              onPageChanged: (index) {
                if (!mounted) return;
                setState(() => _currentIndex = index);
              },
              itemBuilder: (context, index) => _buildPage(widget.photos[index]),
            ),
          ),
          if (widget.photos.length > 1)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 10),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var i = 0; i < widget.photos.length; i++)
                    Container(
                      width: 8,
                      height: 8,
                      margin: const EdgeInsets.symmetric(horizontal: 3),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: i == _currentIndex
                            ? Theme.of(context).colorScheme.primary
                            : Theme.of(context)
                                .colorScheme
                                .onSurfaceVariant
                                .withValues(alpha: 0.35),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
