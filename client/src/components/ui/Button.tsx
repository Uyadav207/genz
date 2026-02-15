/**
 * Reusable Button component.
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  type TouchableOpacityProps,
  type TextStyle,
  type ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { Colors, FontSize, Spacing, BorderRadius } from '@/constants';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  textStyle?: TextStyle;
}

export function Button({
  title,
  variant = 'primary',
  loading = false,
  style,
  textStyle,
  disabled,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        variantStyles[variant],
        isDisabled && styles.disabled,
        style as ViewStyle,
      ]}
      disabled={isDisabled}
      activeOpacity={0.75}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'outline' || variant === 'ghost' ? Colors.primary : Colors.white}
        />
      ) : (
        <Text style={[styles.text, variantTextStyles[variant], textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: FontSize.base,
    fontWeight: '600',
  },
});

const variantStyles: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: Colors.primary },
  secondary: { backgroundColor: Colors.secondary },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  ghost: { backgroundColor: 'transparent' },
};

const variantTextStyles: Record<ButtonVariant, TextStyle> = {
  primary: { color: Colors.white },
  secondary: { color: Colors.white },
  outline: { color: Colors.primary },
  ghost: { color: Colors.primary },
};
