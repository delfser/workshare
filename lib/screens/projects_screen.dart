import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/app_config.dart';
import '../models/app_update_info.dart';
import '../models/enums.dart';
import '../models/project.dart';
import '../providers/auth_provider.dart';
import '../services/app_update_service.dart';
import '../services/invitation_service.dart';
import '../services/notification_service.dart';
import '../services/project_service.dart';
import '../utils/app_notice.dart';
import '../utils/error_mapper.dart';
import '../widgets/brand_logo.dart';
import 'notifications_screen.dart';
import 'project_detail_screen.dart';
import 'project_form_screen.dart';

class ProjectsScreen extends StatefulWidget {
  const ProjectsScreen({super.key});

  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  static const _seenUpdateBuildKey = 'seen_update_build';

  final _projectService = ProjectService();
  final _invitationService = InvitationService();
  final _notificationService = NotificationService();
  final _updateService = AppUpdateService();
  final _searchCtrl = TextEditingController();
  bool _showArchived = false;
  bool _isSearching = false;
  int _pendingInvitationCount = 0;
  int _pendingAppNotificationCount = 0;
  AppUpdateInfo? _pendingUpdateNotice;
  StreamSubscription<List<QueryDocumentSnapshot<Map<String, dynamic>>>>?
      _invitationCountSub;
  StreamSubscription<int>? _appNotificationCountSub;
  String? _signalsEmail;
  bool _checkingStartupUpdate = false;
  bool _suppressBadgeSignals = false;
  Set<String> _seenInvitationIds = <String>{};
  Set<String> _latestInvitationIds = <String>{};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _prepareNotificationsForCurrentUser();
    });
  }

  @override
  void dispose() {
    _invitationCountSub?.cancel();
    _appNotificationCountSub?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _prepareNotificationsForCurrentUser() async {
    final user = context.read<AuthProvider>().user;
    if (user == null) return;
    final email = (user.email ?? '').trim().toLowerCase();

    if (email.isEmpty) {
      await _invitationCountSub?.cancel();
      await _appNotificationCountSub?.cancel();
      _invitationCountSub = null;
      _appNotificationCountSub = null;
      if (!mounted) return;
      setState(() {
        _signalsEmail = null;
        _pendingInvitationCount = 0;
        _pendingAppNotificationCount = 0;
        _pendingUpdateNotice = null;
      });
      return;
    }

    if (_signalsEmail == email) return;

    await _invitationCountSub?.cancel();
    await _appNotificationCountSub?.cancel();
    _signalsEmail = email;
    final prefs = await SharedPreferences.getInstance();
    _seenInvitationIds =
        (prefs.getStringList(_seenInvitationIdsKey(email)) ?? const []).toSet();
    _invitationCountSub =
        _invitationService.streamPendingInvitations(email).listen((docs) {
      if (!mounted) return;
      _latestInvitationIds = docs.map((d) => d.id).toSet();
      final unseen =
          docs.where((d) => !_seenInvitationIds.contains(d.id)).length;
      if (_suppressBadgeSignals) {
        if (_pendingInvitationCount != 0) {
          setState(() => _pendingInvitationCount = 0);
        }
        return;
      }
      setState(() => _pendingInvitationCount = unseen);
    });
    _appNotificationCountSub = _notificationService
        .streamUnreadNotificationCount(user.uid)
        .listen((unreadCount) {
      if (!mounted) return;
      if (_suppressBadgeSignals) {
        if (_pendingAppNotificationCount != 0) {
          setState(() => _pendingAppNotificationCount = 0);
        }
        return;
      }
      setState(() => _pendingAppNotificationCount = unreadCount);
    });

    await _checkOneTimeUpdateNotice();
  }

  Future<void> _checkOneTimeUpdateNotice() async {
    if (!AppConfig.otaEnabled || _checkingStartupUpdate) return;
    _checkingStartupUpdate = true;
    try {
      final update = await _updateService.checkForUpdate();
      if (!mounted || update == null) return;
      final prefs = await SharedPreferences.getInstance();
      final seenBuild = prefs.getInt(_seenUpdateBuildKey) ?? 0;
      if (!mounted) return;
      if (update.buildNumber > seenBuild) {
        setState(() => _pendingUpdateNotice = update);
      }
    } catch (_) {
      // Startup check should not block UI.
    } finally {
      _checkingStartupUpdate = false;
    }
  }

  Future<void> _openNotifications() async {
    final user = context.read<AuthProvider>().user;
    final email = (user?.email ?? '').trim().toLowerCase();
    final pendingUpdate = _pendingUpdateNotice;
    if (mounted) {
      setState(() {
        _suppressBadgeSignals = true;
        _pendingInvitationCount = 0;
        _pendingAppNotificationCount = 0;
        _pendingUpdateNotice = null;
      });
    }
    final prefs = await SharedPreferences.getInstance();

    if (email.isNotEmpty) {
      final serverPendingIds =
          (await _invitationService.fetchPendingInvitationIds(email)).toSet();
      _seenInvitationIds = {
        ..._seenInvitationIds,
        ..._latestInvitationIds,
        ...serverPendingIds,
      };
      await prefs.setStringList(
        _seenInvitationIdsKey(email),
        _seenInvitationIds.toList(),
      );
    }

    if (user != null) {
      await _notificationService.markAllAsRead(user.uid);
    }
    if (pendingUpdate != null) {
      await prefs.setInt(_seenUpdateBuildKey, pendingUpdate.buildNumber);
    }

    if (!mounted) return;

    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => NotificationsScreen(
          pendingUpdate: pendingUpdate,
        ),
      ),
    );

    if (user != null) {
      await _notificationService.markAllAsRead(user.uid);
    }
    if (!mounted) return;
    await _prepareNotificationsForCurrentUser();
    if (!mounted) return;
    await Future.delayed(const Duration(milliseconds: 350));
    if (!mounted) return;
    setState(() {
      _suppressBadgeSignals = false;
      _pendingInvitationCount = 0;
      _pendingAppNotificationCount = 0;
    });
  }

  String _seenInvitationIdsKey(String email) => 'seen_invitation_ids_$email';

  bool _canArchive(ProjectRole role) =>
      role == ProjectRole.owner || role == ProjectRole.admin;

  bool _canDeleteProject(ProjectRole role) => role == ProjectRole.owner;

  bool _canLeaveProject(ProjectRole role) => role != ProjectRole.owner;

  String _roleText(ProjectRole role) {
    switch (role) {
      case ProjectRole.owner:
        return 'Rolle: Owner';
      case ProjectRole.admin:
        return 'Rolle: Admin';
      case ProjectRole.worker:
        return 'Rolle: Worker';
      case ProjectRole.viewer:
        return 'Rolle: Viewer (Nur lesen)';
    }
  }

  Future<void> _handleArchive(String projectId, bool archived) async {
    try {
      await _projectService.setProjectArchived(
          projectId: projectId, archived: archived);
      if (!mounted) return;
      showAppNotice(
        context,
        archived
            ? 'Projekt als erledigt abgelegt.'
            : 'Projekt wieder aktiviert.',
        type: AppNoticeType.success,
      );
    } catch (e) {
      if (!mounted) return;
      showAppNotice(
        context,
        friendlyErrorMessage(e,
            fallback: 'Projektstatus konnte nicht geändert werden.'),
        type: AppNoticeType.error,
      );
    }
  }

  Future<void> _handleDelete(String projectId) async {
    final confirm = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Projekt löschen?'),
            content:
                const Text('Projekt und zugehörige Daten werden entfernt.'),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const Text('Abbrechen')),
              FilledButton(
                  onPressed: () => Navigator.pop(context, true),
                  child: const Text('Löschen')),
            ],
          ),
        ) ??
        false;

    if (!confirm) return;

    try {
      await _projectService.deleteProject(projectId);
      if (!mounted) return;
      showAppNotice(context, 'Projekt gelöscht.', type: AppNoticeType.success);
    } catch (e) {
      if (!mounted) return;
      showAppNotice(
        context,
        friendlyErrorMessage(e,
            fallback: 'Projekt konnte nicht gelöscht werden.'),
        type: AppNoticeType.error,
      );
    }
  }

  Future<void> _handleLeaveProject({
    required String projectId,
    required String userId,
  }) async {
    final confirm = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Projekt aus Liste entfernen?'),
            content: const Text(
              'Das Projekt bleibt beim Ersteller und im Team bestehen. Es wird nur aus deiner Liste entfernt.',
            ),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const Text('Abbrechen')),
              FilledButton(
                  onPressed: () => Navigator.pop(context, true),
                  child: const Text('Entfernen')),
            ],
          ),
        ) ??
        false;

    if (!confirm) return;

    try {
      await _projectService.removeMember(projectId: projectId, userId: userId);
      if (!mounted) return;
      showAppNotice(context, 'Projekt aus deiner Liste entfernt.',
          type: AppNoticeType.success);
    } catch (e) {
      if (!mounted) return;
      showAppNotice(
        context,
        friendlyErrorMessage(e,
            fallback: 'Projekt konnte nicht aus deiner Liste entfernt werden.'),
        type: AppNoticeType.error,
      );
    }
  }

  Future<void> _showJoinByCodeDialog(String userId, String email) async {
    var input = '';
    try {
      final joined = await showDialog<String>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Projektcode eingeben'),
          content: TextField(
            textCapitalization: TextCapitalization.characters,
            onChanged: (value) => input = value,
            decoration: const InputDecoration(
              labelText: 'Code',
              hintText: 'z. B. A1B2C3',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Abbrechen'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, input.trim()),
              child: const Text('Beitreten'),
            ),
          ],
        ),
      );

      if (joined == null || joined.trim().isEmpty) return;

      final result = await _projectService.joinProjectByCode(
        code: joined,
        userId: userId,
        email: email,
      );
      if (!mounted) return;
      if (result == JoinByCodeResult.alreadyMember) {
        showAppNotice(context, 'Du bist bereits in diesem Projekt.',
            type: AppNoticeType.info);
      } else {
        showAppNotice(context, 'Projekt erfolgreich beigetreten.',
            type: AppNoticeType.success);
      }
      if (mounted) {
        setState(() {});
      }
    } catch (e) {
      if (!mounted) return;
      showAppNotice(
        context,
        friendlyErrorMessage(e,
            fallback: 'Beitritt per Projektcode fehlgeschlagen.'),
        type: AppNoticeType.error,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;
    final userEmail = (user?.email ?? '').trim().toLowerCase();

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

    if (_signalsEmail != userEmail) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _prepareNotificationsForCurrentUser();
      });
    }

    final pendingCount = _pendingInvitationCount +
        _pendingAppNotificationCount +
        (_pendingUpdateNotice == null ? 0 : 1);

    return Scaffold(
      appBar: AppBar(
        title: _isSearching
            ? TextField(
                controller: _searchCtrl,
                autofocus: true,
                decoration: const InputDecoration(
                  hintText: 'Projekte suchen...',
                  border: InputBorder.none,
                ),
                onChanged: (_) => setState(() {}),
              )
            : const WorkShareAppBarTitle('WorkShare'),
        actions: [
          IconButton(
            onPressed: _openNotifications,
            tooltip: 'Benachrichtigungen',
            icon: Stack(
              clipBehavior: Clip.none,
              children: [
                const Icon(Icons.notifications_none_outlined),
                if (pendingCount > 0)
                  Positioned(
                    right: -2,
                    top: -2,
                    child: Container(
                      width: 9,
                      height: 9,
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.error,
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          IconButton(
            onPressed: () => _showJoinByCodeDialog(user.uid, user.email ?? ''),
            icon: const Icon(Icons.vpn_key_outlined),
            tooltip: 'Mit Projektcode beitreten',
          ),
          IconButton(
            onPressed: () {
              setState(() {
                if (_isSearching) {
                  _searchCtrl.clear();
                }
                _isSearching = !_isSearching;
              });
            },
            icon: Icon(_isSearching ? Icons.close : Icons.search),
            tooltip: _isSearching ? 'Suche schließen' : 'Projekte suchen',
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          await Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const ProjectFormScreen()));
          if (mounted) setState(() {});
        },
        child: const Icon(Icons.add),
      ),
      body: StreamBuilder(
        stream: _projectService.streamUserMemberships(user.uid),
        builder: (context, memberSnapshot) {
          if (memberSnapshot.connectionState == ConnectionState.waiting &&
              !memberSnapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          if (memberSnapshot.hasError) {
            return const Center(
                child: Text('Mitgliedschaften konnten nicht geladen werden.'));
          }

          final memberships = memberSnapshot.data ?? const [];
          final roleByProjectId = {
            for (final m in memberships) m.projectId: m.role,
          };

          return StreamBuilder(
            stream: _projectService
                .streamProjectsByIds(roleByProjectId.keys.toList()),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting &&
                  !snapshot.hasData) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snapshot.hasError) {
                return const Center(
                    child: Text('Projekte konnten nicht geladen werden.'));
              }

              final all = snapshot.data ?? const [];
              final search = _searchCtrl.text.trim().toLowerCase();
              final filtered = search.isEmpty
                  ? all
                  : all
                      .where((p) => p.name.toLowerCase().contains(search))
                      .toList();
              final activeProjects =
                  filtered.where((p) => !p.archived).toList();
              final archivedProjects =
                  filtered.where((p) => p.archived).toList();
              if (all.isEmpty) {
                return ListView(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 80),
                  children: const [
                    SizedBox(height: 24),
                    Center(child: Text('Keine Projekte vorhanden.')),
                  ],
                );
              }

              Widget projectTile(Project project) {
                final role = roleByProjectId[project.id] ?? ProjectRole.viewer;
                final canArchive = _canArchive(role);
                final canDeleteProject = _canDeleteProject(role);
                final canLeaveProject = _canLeaveProject(role);

                DismissDirection direction;
                if (canArchive && (canDeleteProject || canLeaveProject)) {
                  direction = DismissDirection.horizontal;
                } else if (canArchive) {
                  direction = DismissDirection.startToEnd;
                } else if (canDeleteProject || canLeaveProject) {
                  direction = DismissDirection.endToStart;
                } else {
                  direction = DismissDirection.none;
                }

                return Dismissible(
                  key: ValueKey(project.id),
                  direction: direction,
                  confirmDismiss: (swipeDirection) async {
                    if (swipeDirection == DismissDirection.startToEnd) {
                      if (!canArchive) {
                        showAppNotice(
                          context,
                          'Nur Owner/Admin dürfen Projekte archivieren.',
                          type: AppNoticeType.info,
                        );
                        return false;
                      }
                      await _handleArchive(project.id, !project.archived);
                    } else {
                      if (canDeleteProject) {
                        await _handleDelete(project.id);
                      } else if (canLeaveProject) {
                        await _handleLeaveProject(
                            projectId: project.id, userId: user.uid);
                      } else {
                        showAppNotice(
                          context,
                          'Für dieses Projekt ist keine Aktion erlaubt.',
                          type: AppNoticeType.info,
                        );
                        return false;
                      }
                    }
                    return false;
                  },
                  background: Container(
                    alignment: Alignment.centerLeft,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    decoration: BoxDecoration(
                      color: canArchive
                          ? Colors.green.shade600
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: canArchive
                        ? Row(
                            children: [
                              const Icon(Icons.check_circle_outline,
                                  color: Colors.white),
                              const SizedBox(width: 8),
                              Text(
                                project.archived
                                    ? 'Aktivieren'
                                    : 'Erledigt ablegen',
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w600),
                              ),
                            ],
                          )
                        : const SizedBox.shrink(),
                  ),
                  secondaryBackground: (canDeleteProject || canLeaveProject)
                      ? Container(
                          alignment: Alignment.centerRight,
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          decoration: BoxDecoration(
                            color: Colors.red.shade600,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              Text(
                                canDeleteProject
                                    ? 'Löschen'
                                    : 'Aus Liste entfernen',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Icon(
                                canDeleteProject
                                    ? Icons.delete_outline
                                    : Icons.exit_to_app,
                                color: Colors.white,
                              ),
                            ],
                          ),
                        )
                      : null,
                  child: Card(
                    elevation: 0,
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      dense: true,
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 4),
                      title: Text(
                        project.name,
                        style: const TextStyle(
                            fontSize: 18, fontWeight: FontWeight.w600),
                      ),
                      subtitle: Text(
                        '${_roleText(role)}\nCode: ${project.projectCode ?? '-'}',
                        style: const TextStyle(fontSize: 12),
                      ),
                      trailing: (canArchive ||
                              canDeleteProject ||
                              canLeaveProject)
                          ? PopupMenuButton<String>(
                              onSelected: (value) async {
                                if (value == 'archive' && canArchive) {
                                  await _handleArchive(
                                      project.id, !project.archived);
                                }
                                if (value == 'delete' && canDeleteProject) {
                                  await _handleDelete(project.id);
                                }
                                if (value == 'leave' && canLeaveProject) {
                                  await _handleLeaveProject(
                                      projectId: project.id, userId: user.uid);
                                }
                              },
                              itemBuilder: (_) => [
                                if (canArchive)
                                  PopupMenuItem<String>(
                                    value: 'archive',
                                    child: Text(project.archived
                                        ? 'Als aktiv markieren'
                                        : 'Als erledigt ablegen'),
                                  ),
                                if (canDeleteProject)
                                  const PopupMenuItem<String>(
                                    value: 'delete',
                                    child: Text('Projekt löschen'),
                                  ),
                                if (canLeaveProject)
                                  const PopupMenuItem<String>(
                                    value: 'leave',
                                    child: Text('Aus meiner Liste entfernen'),
                                  ),
                              ],
                            )
                          : null,
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(
                              builder: (_) =>
                                  ProjectDetailScreen(project: project)),
                        );
                      },
                    ),
                  ),
                );
              }

              return ListView(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 80),
                children: [
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                    child: Text(
                      'Aktive Projekte',
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          letterSpacing: .2),
                    ),
                  ),
                  if (activeProjects.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 8),
                      child: Text('Keine aktiven Projekte.'),
                    ),
                  ...activeProjects.map(projectTile),
                  const SizedBox(height: 8),
                  SwitchListTile(
                    dense: true,
                    value: _showArchived,
                    onChanged: (v) => setState(() => _showArchived = v),
                    title: const Text('Abgeschlossene Projekte einblenden',
                        style: TextStyle(fontSize: 14)),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                  ),
                  if (_showArchived) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 8),
                      decoration: BoxDecoration(
                        color: Theme.of(context)
                            .colorScheme
                            .surfaceContainerHighest
                            .withValues(alpha: 0.45),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        'Abgeschlossene Projekte',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          letterSpacing: .2,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    if (archivedProjects.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: Text('Keine abgeschlossenen Projekte.'),
                      ),
                    ...archivedProjects.map(projectTile),
                  ],
                ],
              );
            },
          );
        },
      ),
    );
  }
}
