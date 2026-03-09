import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'dart:io';

class CameraMultiCaptureScreen extends StatefulWidget {
  const CameraMultiCaptureScreen({super.key});

  @override
  State<CameraMultiCaptureScreen> createState() => _CameraMultiCaptureScreenState();
}

class _CameraMultiCaptureScreenState extends State<CameraMultiCaptureScreen> {
  CameraController? _controller;
  List<CameraDescription> _cameras = const [];
  final List<XFile> _captured = [];
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _initCamera();
  }

  Future<void> _initCamera() async {
    try {
      _cameras = await availableCameras();
      if (_cameras.isEmpty) return;
      final back = _cameras.where((c) => c.lensDirection == CameraLensDirection.back).toList();
      final selected = back.isNotEmpty ? back.first : _cameras.first;
      final controller = CameraController(
        selected,
        ResolutionPreset.veryHigh,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() => _controller = controller);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Kamera konnte nicht gestartet werden.')),
      );
      Navigator.pop(context);
    }
  }

  Future<void> _capture() async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized || _busy) return;
    setState(() => _busy = true);
    try {
      final file = await controller.takePicture();
      if (!mounted) return;
      setState(() => _captured.add(file));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Foto konnte nicht aufgenommen werden.')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Fotos aufnehmen'),
        actions: [
          TextButton(
            onPressed: _captured.isEmpty ? null : () => Navigator.pop(context, _captured),
            child: Text('Fertig (${_captured.length})'),
          ),
        ],
      ),
      body: controller == null || !controller.value.isInitialized
          ? const Center(child: CircularProgressIndicator())
          : SafeArea(
              top: false,
              child: Column(
                children: [
                  Expanded(child: CameraPreview(controller)),
                  if (_captured.isNotEmpty)
                    SizedBox(
                      height: 76,
                      child: ListView.builder(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                        itemCount: _captured.length,
                        itemBuilder: (context, index) {
                          return Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.file(
                                File(_captured[index].path),
                                width: 64,
                                height: 64,
                                fit: BoxFit.cover,
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  Container(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                    child: Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _captured.isEmpty ? null : () => Navigator.pop(context, _captured),
                            icon: const Icon(Icons.check),
                            label: const Text('Hochladen'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        FloatingActionButton(
                          onPressed: _capture,
                          child: _busy
                              ? const SizedBox(
                                  width: 24,
                                  height: 24,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.camera_alt),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
