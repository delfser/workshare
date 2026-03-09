import 'package:flutter/material.dart';

class WorkShareLogo extends StatelessWidget {
  const WorkShareLogo({super.key, this.size = 28});

  final double size;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(size * 0.22),
      child: Image.asset(
        'assets/branding/icon.png',
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stackTrace) => Container(
          width: size,
          height: size,
          color: Theme.of(context).colorScheme.primaryContainer,
          child: Icon(
            Icons.handyman_rounded,
            size: size * 0.58,
            color: Theme.of(context).colorScheme.onPrimaryContainer,
          ),
        ),
      ),
    );
  }
}

class WorkShareAppBarTitle extends StatelessWidget {
  const WorkShareAppBarTitle(
    this.text, {
    super.key,
    this.logoSize = 56,
    this.fontSize = 24,
  });

  final String text;
  final double logoSize;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        WorkShareLogo(size: logoSize),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: fontSize),
          ),
        ),
      ],
    );
  }
}
