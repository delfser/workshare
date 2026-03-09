import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../models/enums.dart';
import '../models/workgroup_member.dart';
import '../providers/auth_provider.dart';
import '../services/workgroup_service.dart';
import '../utils/app_notice.dart';
import '../utils/error_mapper.dart';

class WorkgroupsScreen extends StatefulWidget {
  const WorkgroupsScreen({super.key});

  @override
  State<WorkgroupsScreen> createState() => _WorkgroupsScreenState();
}

class _WorkgroupsScreenState extends State<WorkgroupsScreen> {
  final _service = WorkgroupService();

  Future<void> _createWorkgroup(String ownerId, String ownerEmail) async {
    var value = '';
    try {
      final name = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Workgroup erstellen'),
          content: TextField(
            onChanged: (v) => value = v,
            decoration: const InputDecoration(labelText: 'Name'),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Abbrechen')),
            FilledButton(onPressed: () => Navigator.pop(context, value.trim()), child: const Text('Erstellen')),
          ],
        ),
      );
      if (name == null || name.trim().isEmpty) return;
      await _service.createWorkgroup(ownerId: ownerId, ownerEmail: ownerEmail, name: name);
      if (!mounted) return;
      showAppNotice(context, 'Workgroup erstellt.', type: AppNoticeType.success);
      setState(() {});
    } catch (e) {
      if (!mounted) return;
      showAppNotice(context, friendlyErrorMessage(e, fallback: 'Workgroup konnte nicht erstellt werden.'), type: AppNoticeType.error);
    }
  }

  Future<void> _joinByCode(String userId, String email) async {
    var value = '';
    try {
      final code = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Workgroup beitreten'),
          content: TextField(
            onChanged: (v) => value = v,
            textCapitalization: TextCapitalization.characters,
            decoration: const InputDecoration(labelText: 'Workgroup-Code'),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Abbrechen')),
            FilledButton(onPressed: () => Navigator.pop(context, value.trim()), child: const Text('Beitreten')),
          ],
        ),
      );
      if (code == null || code.trim().isEmpty) return;
      await _service.joinByCode(code: code, userId: userId, email: email);
      if (!mounted) return;
      showAppNotice(context, 'Workgroup beigetreten.', type: AppNoticeType.success);
      setState(() {});
    } catch (e) {
      if (!mounted) return;
      showAppNotice(context, friendlyErrorMessage(e, fallback: 'Beitritt fehlgeschlagen.'), type: AppNoticeType.error);
    }
  }

  Future<void> _deleteWorkgroup(String workgroupId, String name) async {
    final confirm = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Workgroup löschen?'),
            content: Text('Soll die Workgroup "$name" wirklich gelöscht werden?'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Abbrechen')),
              FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Löschen')),
            ],
          ),
        ) ??
        false;
    if (!confirm) return;

    try {
      await _service.deleteWorkgroup(workgroupId);
      if (!mounted) return;
      showAppNotice(context, 'Workgroup gelöscht.', type: AppNoticeType.success);
      setState(() {});
    } catch (e) {
      if (!mounted) return;
      showAppNotice(
        context,
        friendlyErrorMessage(e, fallback: 'Workgroup konnte nicht gelöscht werden.'),
        type: AppNoticeType.error,
      );
    }
  }

  Future<void> _leaveWorkgroup(String workgroupId, String name, String userId) async {
    final confirm = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Workgroup verlassen?'),
            content: Text('Soll die Workgroup "$name" aus deiner Liste entfernt werden?'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Abbrechen')),
              FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Verlassen')),
            ],
          ),
        ) ??
        false;
    if (!confirm) return;

    try {
      final auth = context.read<AuthProvider>();
      await _service.leaveWorkgroup(
        workgroupId: workgroupId,
        userId: userId,
        email: (auth.user?.email ?? '').toLowerCase(),
      );
      if (!mounted) return;
      showAppNotice(context, 'Workgroup verlassen.', type: AppNoticeType.success);
      setState(() {});
    } catch (e) {
      if (!mounted) return;
      showAppNotice(
        context,
        friendlyErrorMessage(e, fallback: 'Workgroup konnte nicht verlassen werden.'),
        type: AppNoticeType.error,
      );
    }
  }

  Future<void> _showMembersDialog({
    required String workgroupId,
    required String workgroupName,
    required String currentUserId,
    required WorkgroupRole selfRole,
  }) async {
    final canManage = selfRole == WorkgroupRole.owner || selfRole == WorkgroupRole.admin;
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Mitglieder - $workgroupName'),
        content: SizedBox(
          width: 420,
          child: StreamBuilder<List<WorkgroupMember>>(
            stream: _service.streamMembers(workgroupId),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const SizedBox(
                  height: 120,
                  child: Center(child: CircularProgressIndicator()),
                );
              }
              if (snapshot.hasError) {
                return const SizedBox(
                  height: 120,
                  child: Center(child: Text('Mitglieder konnten nicht geladen werden.')),
                );
              }
              final members = snapshot.data ?? const <WorkgroupMember>[];
              if (members.isEmpty) {
                return const SizedBox(height: 120, child: Center(child: Text('Keine Mitglieder.')));
              }

              return ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 360),
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: members.length,
                  itemBuilder: (context, index) {
                    final m = members[index];
                    final isSelf = m.userId == currentUserId;
                    final canRemove = canManage && !isSelf && m.role != WorkgroupRole.owner;
                    return ListTile(
                      dense: true,
                      leading: const Icon(Icons.person_outline),
                      title: Text(m.email),
                      subtitle: Text('Rolle: ${m.role.value}'),
                      trailing: canRemove
                          ? IconButton(
                              tooltip: 'Aus Workgroup entfernen',
                              icon: const Icon(Icons.person_remove_alt_1_outlined),
                              onPressed: () async {
                                final ok = await showDialog<bool>(
                                      context: context,
                                      builder: (_) => AlertDialog(
                                        title: const Text('Mitglied entfernen?'),
                                        content: Text('${m.email} aus der Workgroup entfernen?'),
                                        actions: [
                                          TextButton(
                                            onPressed: () => Navigator.pop(context, false),
                                            child: const Text('Abbrechen'),
                                          ),
                                          FilledButton(
                                            onPressed: () => Navigator.pop(context, true),
                                            child: const Text('Entfernen'),
                                          ),
                                        ],
                                      ),
                                    ) ??
                                    false;
                                if (!ok) return;
                                try {
                                  await _service.removeMember(
                                    workgroupId: workgroupId,
                                    userId: m.userId,
                                  );
                                  if (!context.mounted) return;
                                  showAppNotice(
                                    context,
                                    'Mitglied entfernt. Projekte wurden getrennt.',
                                    type: AppNoticeType.success,
                                  );
                                } catch (e) {
                                  if (!context.mounted) return;
                                  showAppNotice(
                                    context,
                                    friendlyErrorMessage(
                                      e,
                                      fallback: 'Mitglied konnte nicht entfernt werden.',
                                    ),
                                    type: AppNoticeType.error,
                                  );
                                }
                              },
                            )
                          : null,
                    );
                  },
                ),
              );
            },
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Schließen'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    if (user == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        Navigator.of(context, rootNavigator: true).popUntil((route) => route.isFirst);
      });
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    final userEmail = (user.email ?? '').toLowerCase();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Workgroups'),
        actions: [
          IconButton(
            onPressed: () => _joinByCode(user.uid, userEmail),
            icon: const Icon(Icons.group_add_outlined),
            tooltip: 'Workgroup beitreten',
          ),
          IconButton(
            onPressed: () => _createWorkgroup(user.uid, userEmail),
            icon: const Icon(Icons.add),
            tooltip: 'Workgroup erstellen',
          ),
        ],
      ),
      body: StreamBuilder(
        stream: _service.streamUserMemberships(user.uid),
        builder: (context, membershipSnapshot) {
          if (membershipSnapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (membershipSnapshot.hasError) {
            return const Center(child: Text('Workgroup-Rollen konnten nicht geladen werden.'));
          }
          final memberships = membershipSnapshot.data ?? const <WorkgroupMember>[];
          final roleByGroupId = {for (final m in memberships) m.workgroupId: m.role};

          return StreamBuilder(
        stream: _service.streamUserWorkgroups(user.uid),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return const Center(child: Text('Workgroups konnten nicht geladen werden.'));
          }
          final groups = snapshot.data ?? const [];
          if (groups.isEmpty) {
            return const Center(child: Text('Keine Workgroup vorhanden.'));
          }
          return ListView.builder(
            itemCount: groups.length,
            itemBuilder: (context, i) {
              final g = groups[i];
              final role = roleByGroupId[g.id] ?? WorkgroupRole.member;
              final isOwner = role == WorkgroupRole.owner;
              final canManageMembers = role == WorkgroupRole.owner || role == WorkgroupRole.admin;
              return ListTile(
                title: Text(g.name),
                subtitle: Text('Code: ${g.joinCode}'),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      onPressed: () async {
                        await Clipboard.setData(ClipboardData(text: g.joinCode));
                        if (!context.mounted) return;
                        showAppNotice(context, 'Code kopiert.', type: AppNoticeType.success);
                      },
                      icon: const Icon(Icons.copy),
                    ),
                    if (canManageMembers)
                      IconButton(
                        onPressed: () => _showMembersDialog(
                          workgroupId: g.id,
                          workgroupName: g.name,
                          currentUserId: user.uid,
                          selfRole: role,
                        ),
                        icon: const Icon(Icons.group_outlined),
                        tooltip: 'Mitglieder verwalten',
                      ),
                    if (isOwner)
                      IconButton(
                        onPressed: () => _deleteWorkgroup(g.id, g.name),
                        icon: const Icon(Icons.delete_outline),
                      )
                    else
                      IconButton(
                        onPressed: () => _leaveWorkgroup(g.id, g.name, user.uid),
                        icon: const Icon(Icons.logout),
                      ),
                  ],
                ),
              );
            },
          );
        },
      );
        },
      )
    );
  }
}
