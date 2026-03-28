import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/material_item.dart';
import '../models/project.dart';
import '../models/project_member.dart';
import '../models/project_note.dart';
import '../models/project_photo.dart';
import '../models/work_log.dart';
import '../providers/auth_provider.dart';
import '../services/material_service.dart';
import '../services/pdf_export_service.dart';
import '../services/project_photo_service.dart';
import '../services/project_note_service.dart';
import '../services/project_service.dart';
import '../services/work_log_service.dart';
import '../utils/app_notice.dart';
import '../utils/error_mapper.dart';
import '../utils/role_utils.dart';
import '../widgets/brand_logo.dart';
import '../widgets/material_tile.dart';
import 'activity_form_screen.dart';
import 'camera_multi_capture_screen.dart';
import 'invite_member_screen.dart';
import 'material_form_screen.dart';
import 'note_form_screen.dart';
import 'photo_viewer_screen.dart';
import 'project_form_screen.dart';
import 'project_members_screen.dart';
import 'work_log_form_screen.dart';

class ProjectDetailScreen extends StatefulWidget {
  const ProjectDetailScreen({super.key, required this.project});

  final Project project;

  @override
  State<ProjectDetailScreen> createState() => _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends State<ProjectDetailScreen> {
  int _sectionIndex = 3;
  String? _runtimeProjectCode;
  String _materialSortMode = 'input';
  final _projectService = ProjectService();
  final _materialService = MaterialService();
  final _noteService = ProjectNoteService();
  final _workLogService = WorkLogService();
  final _pdfService = PdfExportService();
  final _photoService = ProjectPhotoService();
  final _picker = ImagePicker();
  Stream<ProjectMember?>? _membershipStream;
  String? _membershipUid;
  late final Stream<List<ProjectPhoto>> _photosStream;
  late final Stream<List<ProjectNote>> _activitiesStream;
  late final Stream<List<ProjectNote>> _notesStream;
  late final Stream<List<WorkLog>> _workLogsStream;
  late Stream<List<MaterialItem>> _materialsStream;
  Timer? _photoRetryTimer;
  String? _photoRetryUserId;

  String _formatNumber(double value) {
    if (value == value.roundToDouble()) {
      return value.toInt().toString();
    }
    return value
        .toStringAsFixed(2)
        .replaceAll(RegExp(r'0+$'), '')
        .replaceAll(RegExp(r'\.$'), '');
  }

  Color _photoStatusColor(ProjectPhoto photo) {
    switch (photo.uploadStatus) {
      case ProjectPhotoUploadStatus.queued:
        return Colors.blueGrey;
      case ProjectPhotoUploadStatus.uploading:
        return Colors.blue;
      case ProjectPhotoUploadStatus.uploaded:
        return Colors.green;
      case ProjectPhotoUploadStatus.failed:
        return Colors.red;
    }
  }

  void _ensurePhotoRetryLoop(String userId) {
    if (_photoRetryUserId == userId && _photoRetryTimer != null) return;
    _photoRetryUserId = userId;
    _photoRetryTimer?.cancel();
    unawaited(
      _photoService.retryPendingUploads(
        projectId: widget.project.id,
        createdBy: userId,
      ),
    );
    _photoRetryTimer = Timer.periodic(const Duration(seconds: 25), (_) {
      unawaited(
        _photoService.retryPendingUploads(
          projectId: widget.project.id,
          createdBy: userId,
        ),
      );
    });
  }

  @override
  void initState() {
    super.initState();
    _runtimeProjectCode = widget.project.projectCode;
    _materialSortMode = widget.project.materialSortMode;
    _photosStream = _photoService.streamPhotos(widget.project.id);
    _activitiesStream =
        _noteService.streamNotes(widget.project.id, type: 'activity');
    _notesStream = _noteService.streamNotes(widget.project.id, type: 'note');
    _workLogsStream = _workLogService.streamWorkLogs(widget.project.id);
    _materialsStream = _materialService.streamMaterials(
      widget.project.id,
      sortMode: _materialSortMode,
    );
  }

  @override
  void dispose() {
    _photoRetryTimer?.cancel();
    super.dispose();
  }

  Future<void> _uploadPickedPhotos(List<XFile> files, String userId) async {
    if (files.isEmpty) return;
    try {
      final count = await _photoService.uploadPhotos(
        projectId: widget.project.id,
        createdBy: userId,
        files: files,
      );
      unawaited(
        _photoService.retryPendingUploads(
          projectId: widget.project.id,
          createdBy: userId,
        ),
      );
      if (!mounted) return;
      showAppNotice(
        context,
        '$count Foto(s) lokal gespeichert. Upload läuft im Hintergrund.',
        type: AppNoticeType.success,
      );
    } catch (e) {
      if (!mounted) return;
      showAppNotice(
        context,
        friendlyErrorMessage(e,
            fallback: 'Fotos konnten nicht gespeichert werden.'),
        type: AppNoticeType.error,
      );
    }
  }

  Future<void> _pickFromGallery(String userId) async {
    final files = await _picker.pickMultiImage(
      imageQuality: 92,
      maxWidth: 2560,
      maxHeight: 2560,
    );
    if (files.isEmpty) return;
    await _uploadPickedPhotos(files, userId);
  }

  Future<void> _pickFromCamera(String userId) async {
    if (!mounted) return;
    final files = await Navigator.of(context).push<List<XFile>>(
      MaterialPageRoute(builder: (_) => const CameraMultiCaptureScreen()),
    );
    if (files == null || files.isEmpty) return;
    await _uploadPickedPhotos(files, userId);
  }

  Future<void> _setMaterialSortMode(String mode) async {
    if (_materialSortMode == mode) return;
    final oldMode = _materialSortMode;
    setState(() {
      _materialSortMode = mode;
      _materialsStream = _materialService.streamMaterials(
        widget.project.id,
        sortMode: mode,
      );
    });
    try {
      await _projectService.setMaterialSortMode(
        projectId: widget.project.id,
        sortMode: mode,
      );
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _materialSortMode = oldMode;
        _materialsStream = _materialService.streamMaterials(
          widget.project.id,
          sortMode: oldMode,
        );
      });
      showAppNotice(
        context,
        'Sortierung konnte nicht gespeichert werden.',
        type: AppNoticeType.error,
      );
    }
  }

  Future<bool> _confirmDeleteMaterial() async {
    return await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Material loeschen?'),
            content: const Text(
              'Bist du sicher, dass dieses Material geloescht werden soll?',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(false),
                child: const Text('Abbrechen'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(dialogContext).pop(true),
                child: const Text('Loeschen'),
              ),
            ],
          ),
        ) ??
        false;
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    if (user == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        Navigator.of(context, rootNavigator: true)
            .popUntil((route) => route.isFirst);
      });
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    _ensurePhotoRetryLoop(user.uid);
    if (_membershipUid != user.uid || _membershipStream == null) {
      _membershipUid = user.uid;
      _membershipStream = _projectService.streamMembershipForProject(
        projectId: widget.project.id,
        uid: user.uid,
      );
    }

    return StreamBuilder<ProjectMember?>(
      stream: _membershipStream,
      builder: (context, membershipSnapshot) {
        if (membershipSnapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
              body: Center(child: CircularProgressIndicator()));
        }

        final membership = membershipSnapshot.data;
        if (membership == null) {
          return Scaffold(
            appBar: AppBar(title: const WorkShareAppBarTitle('WorkShare')),
            body: const Center(child: Text('Kein Zugriff auf dieses Projekt.')),
          );
        }

        final canWrite = canWriteMaterials(membership.role);
        final canMembers = canManageMembers(membership.role);
        final date = DateFormat('d.M.y').format(widget.project.createdAt);
        final projectCode = _runtimeProjectCode ?? widget.project.projectCode;

        return Scaffold(
          appBar: AppBar(
            title: const WorkShareAppBarTitle('WorkShare'),
            actions: [
              IconButton(
                icon: const Icon(Icons.picture_as_pdf_outlined),
                onPressed: () async {
                  try {
                    final materials = await _materialService.fetchMaterials(
                      widget.project.id,
                      sortMode: _materialSortMode,
                    );
                    final workLogs =
                        await _workLogService.fetchWorkLogs(widget.project.id);
                    final activities = await _noteService.fetchNotes(
                      widget.project.id,
                      type: 'activity',
                    );
                    await _pdfService.shareMaterialPdf(
                      projectName: widget.project.name,
                      activities:
                          activities.map((activity) => activity.text).toList(),
                      materials: materials,
                      workLogs: workLogs,
                    );
                    if (!context.mounted) return;
                    showAppNotice(context, 'Bericht exportiert.',
                        type: AppNoticeType.success);
                  } catch (e) {
                    if (!context.mounted) return;
                    showAppNotice(
                      context,
                      friendlyErrorMessage(e,
                          fallback: 'PDF-Export fehlgeschlagen.'),
                      type: AppNoticeType.error,
                    );
                  }
                },
              ),
              IconButton(
                icon: const Icon(Icons.edit_outlined),
                onPressed: canMembers
                    ? () => Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) =>
                            ProjectFormScreen(project: widget.project)))
                    : null,
              ),
            ],
          ),
          floatingActionButton: canWrite &&
                  (_sectionIndex == 3 ||
                      _sectionIndex == 2 ||
                      _sectionIndex == 1 ||
                      _sectionIndex == 4)
              ? FloatingActionButton(
                  onPressed: () {
                    if (_sectionIndex == 3) {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                            builder: (_) =>
                                MaterialFormScreen(project: widget.project)),
                      );
                    } else if (_sectionIndex == 2) {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                            builder: (_) =>
                                ActivityFormScreen(project: widget.project)),
                      );
                    } else if (_sectionIndex == 1) {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                            builder: (_) =>
                                WorkLogFormScreen(project: widget.project)),
                      );
                    } else if (_sectionIndex == 4) {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                            builder: (_) =>
                                NoteFormScreen(project: widget.project)),
                      );
                    }
                  },
                  child: const Icon(Icons.add),
                )
              : null,
          body: Column(
            children: [
              Container(
                margin: const EdgeInsets.fromLTRB(12, 6, 12, 6),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Theme.of(context)
                      .colorScheme
                      .surfaceContainerHighest
                      .withValues(
                        alpha: Theme.of(context).brightness == Brightness.dark
                            ? 0.28
                            : 0.55,
                      ),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(widget.project.name,
                              style: const TextStyle(
                                  fontSize: 18, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 2),
                          Text(
                            'Erstellt: $date',
                            style: TextStyle(
                              fontSize: 12,
                              color: Theme.of(context)
                                  .colorScheme
                                  .onSurfaceVariant,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  'Code: ${projectCode ?? '-'}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w600),
                                ),
                              ),
                              if (projectCode != null && projectCode.isNotEmpty)
                                IconButton(
                                  onPressed: () async {
                                    await Clipboard.setData(
                                        ClipboardData(text: projectCode));
                                    if (!context.mounted) return;
                                    showAppNotice(
                                        context, 'Projektcode kopiert.',
                                        type: AppNoticeType.success);
                                  },
                                  icon: const Icon(Icons.copy, size: 18),
                                  tooltip: 'Code kopieren',
                                  constraints: const BoxConstraints(
                                      minWidth: 24, minHeight: 24),
                                  padding: EdgeInsets.zero,
                                  visualDensity: VisualDensity.compact,
                                )
                              else if (canMembers)
                                TextButton(
                                  onPressed: () async {
                                    try {
                                      final code = await _projectService
                                          .ensureProjectJoinCode(
                                        projectId: widget.project.id,
                                        ownerId: widget.project.ownerId,
                                      );
                                      if (mounted) {
                                        setState(
                                            () => _runtimeProjectCode = code);
                                      }
                                      if (!context.mounted) return;
                                      await Clipboard.setData(
                                          ClipboardData(text: code));
                                      if (!context.mounted) return;
                                      showAppNotice(
                                        context,
                                        'Projektcode erstellt und kopiert.',
                                        type: AppNoticeType.success,
                                      );
                                    } catch (e) {
                                      if (!context.mounted) return;
                                      showAppNotice(
                                        context,
                                        friendlyErrorMessage(
                                          e,
                                          fallback:
                                              'Projektcode konnte nicht erstellt werden.',
                                        ),
                                        type: AppNoticeType.error,
                                      );
                                    }
                                  },
                                  style: TextButton.styleFrom(
                                    visualDensity: VisualDensity.compact,
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 8, vertical: 4),
                                    minimumSize: const Size(0, 30),
                                    tapTargetSize:
                                        MaterialTapTargetSize.shrinkWrap,
                                  ),
                                  child: const Text('Code erstellen',
                                      style: TextStyle(fontSize: 12)),
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        OutlinedButton(
                          onPressed: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => ProjectMembersScreen(
                                    project: widget.project,
                                    selfRole: membership.role),
                              ),
                            );
                          },
                          style: OutlinedButton.styleFrom(
                            visualDensity: VisualDensity.compact,
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 6),
                            minimumSize: const Size(0, 32),
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                          child: const Text('Mitglieder',
                              style: TextStyle(fontSize: 13)),
                        ),
                        const SizedBox(height: 6),
                        FilledButton(
                          onPressed: canMembers
                              ? () {
                                  Navigator.of(context).push(
                                    MaterialPageRoute(
                                        builder: (_) => InviteMemberScreen(
                                            project: widget.project)),
                                  );
                                }
                              : null,
                          style: FilledButton.styleFrom(
                            visualDensity: VisualDensity.compact,
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 6),
                            minimumSize: const Size(0, 32),
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                          child: const Text('Einladen',
                              style: TextStyle(fontSize: 13)),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              _MiniSectionSelector(
                selected: _sectionIndex,
                onSelected: (v) => setState(() => _sectionIndex = v),
              ),
              const Divider(height: 1),
              Expanded(
                child: IndexedStack(
                  index: _sectionIndex,
                  children: [
                    _buildSectionBody(
                      index: 0,
                      noteService: _noteService,
                      workLogService: _workLogService,
                      materialService: _materialService,
                      userId: user.uid,
                      canWrite: canWrite,
                    ),
                    _buildSectionBody(
                      index: 1,
                      noteService: _noteService,
                      workLogService: _workLogService,
                      materialService: _materialService,
                      userId: user.uid,
                      canWrite: canWrite,
                    ),
                    _buildSectionBody(
                      index: 2,
                      noteService: _noteService,
                      workLogService: _workLogService,
                      materialService: _materialService,
                      userId: user.uid,
                      canWrite: canWrite,
                    ),
                    _buildSectionBody(
                      index: 3,
                      noteService: _noteService,
                      workLogService: _workLogService,
                      materialService: _materialService,
                      userId: user.uid,
                      canWrite: canWrite,
                    ),
                    _buildSectionBody(
                      index: 4,
                      noteService: _noteService,
                      workLogService: _workLogService,
                      materialService: _materialService,
                      userId: user.uid,
                      canWrite: canWrite,
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildSectionBody({
    required int index,
    required ProjectNoteService noteService,
    required WorkLogService workLogService,
    required MaterialService materialService,
    required String userId,
    required bool canWrite,
  }) {
    if (index == 4) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 80),
        child: StreamBuilder(
          stream: _notesStream,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return const Center(
                  child: Text('Notizen konnten nicht geladen werden.'));
            }
            final notes = snapshot.data ?? const [];
            if (notes.isEmpty) {
              return const Center(child: Text('Keine Notizen vorhanden.'));
            }
            return ListView.builder(
              itemCount: notes.length,
              itemBuilder: (context, index) {
                final note = notes[index];
                return Card(
                  elevation: 0,
                  child: ListTile(
                    title: Text(note.text),
                    subtitle: Text(
                        DateFormat('dd.MM.yyyy HH:mm').format(note.updatedAt)),
                    trailing: canWrite
                        ? IconButton(
                            icon: const Icon(Icons.delete_outline),
                            onPressed: () async {
                              try {
                                await noteService.deleteNote(note.id);
                                if (!context.mounted) return;
                                showAppNotice(context, 'Notiz gelöscht.',
                                    type: AppNoticeType.success);
                              } catch (e) {
                                if (!context.mounted) return;
                                showAppNotice(
                                  context,
                                  friendlyErrorMessage(e,
                                      fallback:
                                          'Notiz konnte nicht gelöscht werden.'),
                                  type: AppNoticeType.error,
                                );
                              }
                            },
                          )
                        : null,
                  ),
                );
              },
            );
          },
        ),
      );
    }

    if (index == 2) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 80),
        child: StreamBuilder(
          stream: _activitiesStream,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return const Center(
                  child: Text('Tätigkeiten konnten nicht geladen werden.'));
            }
            final activities = snapshot.data ?? const [];
            if (activities.isEmpty) {
              return const Center(child: Text('Keine Tätigkeiten vorhanden.'));
            }
            return ListView.builder(
              itemCount: activities.length,
              itemBuilder: (context, index) {
                final activity = activities[index];
                return Card(
                  elevation: 0,
                  child: ListTile(
                    title: Text(activity.text),
                    subtitle: Text(
                      DateFormat('dd.MM.yyyy HH:mm').format(activity.updatedAt),
                    ),
                    onTap: canWrite
                        ? () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => ActivityFormScreen(
                                  project: widget.project,
                                  activity: activity,
                                ),
                              ),
                            );
                          }
                        : null,
                    trailing: canWrite
                        ? Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit_outlined),
                                tooltip: 'Bearbeiten',
                                onPressed: () {
                                  Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (_) => ActivityFormScreen(
                                        project: widget.project,
                                        activity: activity,
                                      ),
                                    ),
                                  );
                                },
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete_outline),
                                onPressed: () async {
                                  try {
                                    await noteService.deleteNote(activity.id);
                                    if (!context.mounted) return;
                                    showAppNotice(
                                      context,
                                      'Tätigkeit gelöscht.',
                                      type: AppNoticeType.success,
                                    );
                                  } catch (e) {
                                    if (!context.mounted) return;
                                    showAppNotice(
                                      context,
                                      friendlyErrorMessage(
                                        e,
                                        fallback:
                                            'Tätigkeit konnte nicht gelöscht werden.',
                                      ),
                                      type: AppNoticeType.error,
                                    );
                                  }
                                },
                              ),
                            ],
                          )
                        : null,
                  ),
                );
              },
            );
          },
        ),
      );
    }

    if (index == 1) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 80),
        child: StreamBuilder(
          stream: _workLogsStream,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return const Center(
                  child: Text('Arbeitszeiten konnten nicht geladen werden.'));
            }
            final logs = snapshot.data ?? const [];
            if (logs.isEmpty) {
              return const Center(
                  child: Text('Keine Arbeitszeiten vorhanden.'));
            }
            return ListView.builder(
              itemCount: logs.length,
              itemBuilder: (context, index) {
                final log = logs[index];
                return Card(
                  elevation: 0,
                  child: ListTile(
                    title: Text('${_formatNumber(log.hours)} h'),
                    subtitle: Text(
                      '${DateFormat('dd.MM.yyyy HH:mm').format(log.updatedAt)} - ${log.worker}',
                    ),
                    onTap: canWrite
                        ? () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => WorkLogFormScreen(
                                  project: widget.project,
                                  workLog: log,
                                ),
                              ),
                            );
                          }
                        : null,
                    trailing: canWrite
                        ? Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit_outlined),
                                tooltip: 'Bearbeiten',
                                onPressed: () {
                                  Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (_) => WorkLogFormScreen(
                                        project: widget.project,
                                        workLog: log,
                                      ),
                                    ),
                                  );
                                },
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete_outline),
                                onPressed: () async {
                                  try {
                                    await workLogService.deleteWorkLog(log.id);
                                    if (!context.mounted) return;
                                    showAppNotice(context, 'Arbeitszeit gelöscht.',
                                        type: AppNoticeType.success);
                                  } catch (e) {
                                    if (!context.mounted) return;
                                    showAppNotice(
                                      context,
                                      friendlyErrorMessage(e,
                                          fallback:
                                              'Arbeitszeit konnte nicht gelöscht werden.'),
                                      type: AppNoticeType.error,
                                    );
                                  }
                                },
                              ),
                            ],
                          )
                        : null,
                  ),
                );
              },
            );
          },
        ),
      );
    }

    if (index == 0) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 80),
        child: Column(
          children: [
            if (canWrite)
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _pickFromCamera(userId),
                      icon: const Icon(Icons.photo_camera_outlined),
                      label: const Text('Kamera'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () => _pickFromGallery(userId),
                      icon: const Icon(Icons.photo_library_outlined),
                      label: const Text('Galerie'),
                    ),
                  ),
                ],
              ),
            const SizedBox(height: 10),
            Expanded(
              child: StreamBuilder<List<ProjectPhoto>>(
                stream: _photosStream,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  if (snapshot.hasError) {
                    return const Center(
                        child: Text('Fotos konnten nicht geladen werden.'));
                  }
                  final photos = snapshot.data ?? const <ProjectPhoto>[];
                  if (photos.isEmpty) {
                    return const Center(
                        child: Text('Noch keine Fotos hochgeladen.'));
                  }
                  final viewerPhotos = photos
                      .map(
                        (p) => PhotoViewerImage(
                          imageUrl: p.downloadUrl,
                          localPath: p.localPath,
                        ),
                      )
                      .toList(growable: false);

                  return GridView.builder(
                    itemCount: photos.length,
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 3,
                      mainAxisSpacing: 8,
                      crossAxisSpacing: 8,
                    ),
                    itemBuilder: (context, index) {
                      final photo = photos[index];
                      final localFile = photo.localPath.isNotEmpty
                          ? File(photo.localPath)
                          : null;
                      final hasLocal =
                          localFile != null && localFile.existsSync();
                      final hasRemote = photo.downloadUrl.isNotEmpty;
                      return ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            InkWell(
                              onTap: (hasLocal || hasRemote)
                                  ? () {
                                      Navigator.of(context).push(
                                        MaterialPageRoute(
                                          builder: (_) => PhotoViewerScreen(
                                            photos: viewerPhotos,
                                            initialIndex: index,
                                          ),
                                        ),
                                      );
                                    }
                                  : null,
                              child: hasLocal
                                  ? Image.file(localFile, fit: BoxFit.cover)
                                  : hasRemote
                                      ? Image.network(photo.downloadUrl,
                                          fit: BoxFit.cover)
                                      : Container(
                                          color: Theme.of(context)
                                              .colorScheme
                                              .surfaceContainerHighest,
                                          child:
                                              const Icon(Icons.image_outlined),
                                        ),
                            ),
                            Positioned(
                              left: 6,
                              bottom: 6,
                              child: Container(
                                width: 12,
                                height: 12,
                                decoration: BoxDecoration(
                                  color: _photoStatusColor(photo),
                                  shape: BoxShape.circle,
                                  border:
                                      Border.all(color: Colors.white, width: 1),
                                ),
                              ),
                            ),
                            if (photo.uploadStatus ==
                                    ProjectPhotoUploadStatus.failed &&
                                photo.createdBy == userId)
                              Positioned(
                                left: 22,
                                bottom: 3,
                                child: GestureDetector(
                                  onTap: () =>
                                      _photoService.retryPhoto(photo.id),
                                  child: const Icon(Icons.refresh,
                                      size: 15, color: Colors.white),
                                ),
                              ),
                            if (canWrite)
                              Positioned(
                                right: 2,
                                top: 2,
                                child: IconButton(
                                  onPressed: () async {
                                    try {
                                      await _photoService.deletePhoto(photo);
                                      if (!context.mounted) return;
                                      showAppNotice(context, 'Foto gelöscht.',
                                          type: AppNoticeType.success);
                                    } catch (e) {
                                      if (!context.mounted) return;
                                      showAppNotice(
                                        context,
                                        friendlyErrorMessage(e,
                                            fallback:
                                                'Foto konnte nicht gelöscht werden.'),
                                        type: AppNoticeType.error,
                                      );
                                    }
                                  },
                                  icon: const Icon(Icons.delete,
                                      color: Colors.white, size: 18),
                                  style: IconButton.styleFrom(
                                    backgroundColor: Colors.black54,
                                    padding: EdgeInsets.zero,
                                    minimumSize: const Size(28, 28),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      );
    }

    if (index == 3) {
      return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
          child: Row(
            children: [
              Text(
                'Sortierung:',
                style: TextStyle(
                    color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: SegmentedButton<String>(
                  showSelectedIcon: false,
                  segments: const [
                    ButtonSegment<String>(
                      value: 'input',
                      icon: Icon(Icons.schedule_outlined, size: 16),
                      label: Text('Eingabe'),
                    ),
                    ButtonSegment<String>(
                      value: 'alpha',
                      icon: Icon(Icons.sort_by_alpha_outlined, size: 16),
                      label: Text('A-Z'),
                    ),
                  ],
                  selected: {_materialSortMode},
                  onSelectionChanged: (selection) {
                    final mode = selection.first;
                    _setMaterialSortMode(mode);
                  },
                  style: const ButtonStyle(
                    visualDensity: VisualDensity.compact,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    padding: WidgetStatePropertyAll(
                      EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: StreamBuilder(
            stream: _materialsStream,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snapshot.hasError) {
                return const Center(
                    child: Text('Materialien konnten nicht geladen werden.'));
              }

              final materials = snapshot.data ?? const [];
              if (materials.isEmpty) {
                return const Center(
                    child: Text('Noch keine Materialien erfasst.'));
              }

              return ListView.builder(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 80),
                itemCount: materials.length,
                itemBuilder: (context, index) {
                  final item = materials[index];
                  return MaterialTile(
                    item: item,
                    onEdit: canWrite
                        ? () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => MaterialFormScreen(
                                    project: widget.project, material: item),
                              ),
                            )
                        : null,
                    onDelete: canWrite
                        ? () async {
                            final confirmed = await _confirmDeleteMaterial();
                            if (!confirmed) return;
                            try {
                              await materialService.deleteMaterial(item.id);
                              if (!context.mounted) return;
                              showAppNotice(context, 'Material gelöscht.',
                                  type: AppNoticeType.success);
                            } catch (e) {
                              if (!context.mounted) return;
                              showAppNotice(
                                context,
                                friendlyErrorMessage(e,
                                    fallback:
                                        'Material konnte nicht gelöscht werden.'),
                                type: AppNoticeType.error,
                              );
                            }
                          }
                        : null,
                  );
                },
              );
            },
          ),
        ),
      ],
    );
    }

    return const SizedBox.shrink();
  }
}

class _MiniSectionSelector extends StatelessWidget {
  const _MiniSectionSelector(
      {required this.selected, required this.onSelected});

  final int selected;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    const items = [
      'Fotos',
      'Arbeitszeit',
      'Tätigkeiten',
      'Materialien',
      'Notizen'
    ];
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final labelColor =
        isDark ? Theme.of(context).colorScheme.onSurface : Colors.black;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Row(
        children: [
          for (var i = 0; i < items.length; i++)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
              child: ChoiceChip(
                label: Text(
                  items[i],
                  style: TextStyle(color: labelColor),
                ),
                labelStyle: TextStyle(color: labelColor),
                selected: selected == i,
                onSelected: (_) => onSelected(i),
              ),
            ),
        ],
      ),
    );
  }
}
