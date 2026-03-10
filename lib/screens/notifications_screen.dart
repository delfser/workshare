import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/app_update_info.dart';
import '../providers/auth_provider.dart';
import '../services/invitation_service.dart';
import '../services/notification_service.dart';
import '../utils/app_notice.dart';
import '../utils/error_mapper.dart';
import '../widgets/brand_logo.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({
    super.key,
    this.pendingUpdate,
  });

  final AppUpdateInfo? pendingUpdate;

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final _invitationService = InvitationService();
  final _notificationService = NotificationService();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _markRead());
  }

  Future<void> _markRead() async {
    final user = context.read<AuthProvider>().user;
    if (user == null) return;
    await _notificationService.markAllAsRead(user.uid);
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    if (user == null || (user.email ?? '').trim().isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const WorkShareAppBarTitle('WorkShare')),
        body: const Center(child: Text('Bitte zuerst anmelden.')),
      );
    }
    final userEmail = user.email!.trim().toLowerCase();

    return Scaffold(
      appBar: AppBar(
        title: const WorkShareAppBarTitle('WorkShare'),
        actions: [
          TextButton(
            onPressed: () async {
              await _notificationService.markAllAsRead(user.uid);
              if (!context.mounted) return;
              showAppNotice(
                  context, 'Alle Benachrichtigungen als gelesen markiert.',
                  type: AppNoticeType.success);
            },
            child: const Text('Alles gelesen'),
          ),
          TextButton(
            onPressed: () async {
              await _notificationService.deleteAllNotifications(user.uid);
              if (!context.mounted) return;
              showAppNotice(context, 'Benachrichtigungen gelöscht.',
                  type: AppNoticeType.success);
            },
            child: const Text('Leeren'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          if (widget.pendingUpdate != null)
            Card(
              child: ListTile(
                leading: const Icon(Icons.system_update_alt_outlined),
                title:
                    Text('Update ${widget.pendingUpdate!.version} verfügbar'),
                subtitle: Text(
                  widget.pendingUpdate!.notes.isEmpty
                      ? 'Optionales Update steht bereit.'
                      : widget.pendingUpdate!.notes,
                ),
                trailing: FilledButton(
                  onPressed: () async {
                    final ok = await launchUrl(
                      Uri.parse(widget.pendingUpdate!.apkUrl),
                      mode: LaunchMode.externalApplication,
                    );
                    if (!context.mounted) return;
                    if (!ok) {
                      showAppNotice(
                        context,
                        'APK-Link konnte nicht geöffnet werden.',
                        type: AppNoticeType.error,
                      );
                    }
                  },
                  child: const Text('Installieren'),
                ),
              ),
            ),
          if (widget.pendingUpdate != null) const SizedBox(height: 8),
          StreamBuilder<List<QueryDocumentSnapshot<Map<String, dynamic>>>>(
            stream: _invitationService.streamPendingInvitations(userEmail),
            builder: (context, snapshot) {
              final invitations = snapshot.data ?? const [];
              return Column(
                children: invitations.map((doc) {
                  final data = doc.data();
                  final projectName = (data['projectName'] as String?) ?? '';
                  final workgroupName =
                      (data['workgroupName'] as String?) ?? '';
                  final isProjectInvite =
                      ((data['projectId'] as String?) ?? '').isNotEmpty;
                  final role = ((data['role'] as String?) ?? '').trim();
                  final title = isProjectInvite
                      ? 'Einladung zu Projekt: ${projectName.isEmpty ? '-' : projectName}'
                      : 'Einladung zu Workgroup: ${workgroupName.isEmpty ? '-' : workgroupName}';

                  return Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 4),
                          Text('Rolle: ${role.isEmpty ? '-' : role}'),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              OutlinedButton(
                                onPressed: () async {
                                  try {
                                    await _invitationService
                                        .declineInvitation(doc.id);
                                    if (!context.mounted) return;
                                    showAppNotice(
                                        context, 'Einladung abgelehnt.',
                                        type: AppNoticeType.info);
                                  } catch (e) {
                                    if (!context.mounted) return;
                                    showAppNotice(
                                      context,
                                      friendlyErrorMessage(e,
                                          fallback:
                                              'Einladung konnte nicht abgelehnt werden.'),
                                      type: AppNoticeType.error,
                                    );
                                  }
                                },
                                child: const Text('Ablehnen'),
                              ),
                              const SizedBox(width: 8),
                              FilledButton(
                                onPressed: () async {
                                  try {
                                    await _invitationService.acceptInvitation(
                                      invitationId: doc.id,
                                      userId: user.uid,
                                      email: userEmail,
                                    );
                                    if (!context.mounted) return;
                                    showAppNotice(
                                        context, 'Einladung angenommen.',
                                        type: AppNoticeType.success);
                                  } catch (e) {
                                    if (!context.mounted) return;
                                    showAppNotice(
                                      context,
                                      friendlyErrorMessage(e,
                                          fallback:
                                              'Einladung konnte nicht angenommen werden.'),
                                      type: AppNoticeType.error,
                                    );
                                  }
                                },
                                child: const Text('Annehmen'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              );
            },
          ),
          StreamBuilder<List<QueryDocumentSnapshot<Map<String, dynamic>>>>(
            stream: _notificationService.streamUserNotifications(user.uid),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Padding(
                  padding: EdgeInsets.only(top: 24),
                  child: Center(child: CircularProgressIndicator()),
                );
              }
              if (snapshot.hasError) {
                return const Center(
                    child: Text(
                        'Benachrichtigungen konnten nicht geladen werden.'));
              }
              final notices = snapshot.data ?? const [];
              if (notices.isEmpty) {
                return const Padding(
                  padding: EdgeInsets.only(top: 16),
                  child:
                      Center(child: Text('Keine weiteren Benachrichtigungen.')),
                );
              }

              return Column(
                children: notices.map((doc) {
                  final data = doc.data();
                  final title =
                      (data['title'] as String?) ?? 'Benachrichtigung';
                  final message = (data['message'] as String?) ?? '';
                  final createdAt = (data['createdAt'] as Timestamp?)?.toDate();
                  final isUnread = data['readAt'] == null;
                  return Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      leading: const Icon(Icons.notifications_none_outlined),
                      title: Text(
                        title,
                        style: TextStyle(
                          fontWeight:
                              isUnread ? FontWeight.w700 : FontWeight.w400,
                        ),
                      ),
                      subtitle: Text(
                        createdAt == null
                            ? message
                            : '$message\n${createdAt.day.toString().padLeft(2, '0')}.${createdAt.month.toString().padLeft(2, '0')}.${createdAt.year} ${createdAt.hour.toString().padLeft(2, '0')}:${createdAt.minute.toString().padLeft(2, '0')}',
                        style: TextStyle(
                          fontWeight:
                              isUnread ? FontWeight.w600 : FontWeight.w400,
                        ),
                      ),
                      isThreeLine: createdAt != null,
                      trailing: IconButton(
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () async {
                          await _notificationService.deleteNotification(
                              doc.id, user.uid);
                        },
                      ),
                    ),
                  );
                }).toList(),
              );
            },
          ),
        ],
      ),
    );
  }
}
