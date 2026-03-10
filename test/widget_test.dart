import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('basic widget test', (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Text('WorkShare'),
        ),
      ),
    );

    expect(find.text('WorkShare'), findsOneWidget);
  });
}
