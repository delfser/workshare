import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/enums.dart';
import '../models/project.dart';
import '../providers/auth_provider.dart';
import '../services/project_service.dart';
import '../utils/app_notice.dart';
import '../utils/error_mapper.dart';
import '../widgets/brand_logo.dart';
import 'invite_member_screen.dart';

class ProjectMembersScreen extends StatelessWidget {
  const ProjectMembersScreen({
    super.key,
    required this.project,
    required this.selfRole,
  });

  final Project project;
  final ProjectRole selfRole;

  @override
  Widget build(BuildContext context) {
    final service = ProjectService();
    final user = context.watch<AuthProvider>().user;

    return Scaffold(
      appBar: AppBar(
        title: const WorkShareAppBarTitle('WorkShare'),
        actions: [
          IconButton(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                    builder: (_) => InviteMemberScreen(project: project)),
              );
            },
            icon: const Icon(Icons.person_add_alt_1),
          ),
        ],
      ),
      body: StreamBuilder(
        stream: service.streamMembers(project.id),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return const Center(
                child: Text('Mitglieder konnten nicht geladen werden.'));
          }
          final members = snapshot.data ?? const [];
          if (members.isEmpty) {
            return const Center(child: Text('Keine Mitglieder gefunden.'));
          }
          return ListView.builder(
            itemCount: members.length,
            itemBuilder: (context, index) {
              final m = members[index];
              final isSelf = m.userId == user?.uid;
              final isOwner = m.role == ProjectRole.owner;

              return ListTile(
                title: Text(m.email),
                subtitle: Text('Rolle: ${m.role.name}'),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (!isOwner)
                      DropdownButton<ProjectRole>(
                        value: m.role,
                        onChanged: (role) async {
                          if (role == null) return;
                          try {
                            await service.updateMemberRole(
                              projectId: project.id,
                              userId: m.userId,
                              role: role,
                            );
                            if (!context.mounted) return;
                            showAppNotice(context, 'Rolle wurde aktualisiert.',
                                type: AppNoticeType.success);
                          } catch (e) {
                            if (!context.mounted) return;
                            showAppNotice(
                              context,
                              friendlyErrorMessage(e,
                                  fallback:
                                      'Rolle konnte nicht geändert werden.'),
                              type: AppNoticeType.error,
                            );
                          }
                        },
                        items: ProjectRole.values
                            .where((role) => role != ProjectRole.owner)
                            .map(
                              (role) => DropdownMenuItem<ProjectRole>(
                                value: role,
                                child: Text(role.name),
                              ),
                            )
                            .toList(),
                      ),
                    if (!isSelf && !isOwner)
                      IconButton(
                        icon: const Icon(Icons.person_remove_outlined),
                        onPressed: () async {
                          final confirm = await showDialog<bool>(
                                context: context,
                                builder: (context) => AlertDialog(
                                  title: const Text('Mitglied entfernen?'),
                                  content: Text(
                                      'Soll ${m.email} wirklich aus dem Projekt entfernt werden?'),
                                  actions: [
                                    TextButton(
                                      onPressed: () =>
                                          Navigator.pop(context, false),
                                      child: const Text('Abbrechen'),
                                    ),
                                    FilledButton(
                                      onPressed: () =>
                                          Navigator.pop(context, true),
                                      child: const Text('Entfernen'),
                                    ),
                                  ],
                                ),
                              ) ??
                              false;
                          if (!confirm) return;
                          try {
                            await service.removeMember(
                                projectId: project.id, userId: m.userId);
                            if (!context.mounted) return;
                            showAppNotice(context, 'Mitglied wurde entfernt.',
                                type: AppNoticeType.success);
                          } catch (e) {
                            if (!context.mounted) return;
                            showAppNotice(
                              context,
                              friendlyErrorMessage(e,
                                  fallback:
                                      'Mitglied konnte nicht entfernt werden.'),
                              type: AppNoticeType.error,
                            );
                          }
                        },
                      ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}
